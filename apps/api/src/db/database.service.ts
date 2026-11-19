import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, types, type PoolClient } from 'pg';
import { APP_CONFIG, AppConfig } from '../config';
import { SCHEMA_SQL } from './schema';
import { POSTGRES_SCHEMA_SQL } from './postgres-schema';
import { createPgPool } from './pg';

export type SqlValue = string | number | null | bigint;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

types.setTypeParser(20, (value: string) => Number(value));
types.setTypeParser(1700, (value: string) => Number(value));

const placeholderCache = new Map<string, string>();

export function toPostgresPlaceholders(sql: string): string {
  const cached = placeholderCache.get(sql);
  if (cached) return cached;

  let output = '';
  let index = 0;
  let quote: string | null = null;
  let i = 0;

  while (i < sql.length) {
    const char = sql[i];
    if (quote) {
      output += char;
      if (char === quote) {
        if (sql[i + 1] === quote) {
          output += sql[i + 1];
          i += 2;
          continue;
        }
        quote = null;
      }
      i += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      output += char;
      i += 1;
      continue;
    }
    if (char === '-' && sql[i + 1] === '-') {
      const newline = sql.indexOf('\n', i);
      if (newline === -1) {
        output += sql.slice(i);
        break;
      }
      output += sql.slice(i, newline + 1);
      i = newline + 1;
      continue;
    }
    if (char === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) {
        output += sql.slice(i);
        break;
      }
      output += sql.slice(i, end + 2);
      i = end + 2;
      continue;
    }
    if (char === '?') {
      index += 1;
      output += `$${index}`;
      i += 1;
      continue;
    }
    output += char;
    i += 1;
  }

  placeholderCache.set(sql, output);
  return output;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private pool: Pool | null = null;
  private sqlite: DatabaseSync | null = null;
  private readonly pgTransaction = new AsyncLocalStorage<PoolClient>();
  private readonly sqliteTransaction = new AsyncLocalStorage<boolean>();
  private sqliteQueue: Promise<unknown> = Promise.resolve();
  private ready: Promise<void> | null = null;
  readonly driver: 'postgres' | 'sqlite';
  readonly filePath: string;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.driver = config.databaseUrl ? 'postgres' : 'sqlite';
    this.filePath = config.databaseUrl ? 'postgres (DATABASE_URL)' : config.dbPath;
  }

  private ensureReady(): Promise<void> {
    this.ready ??= this.initialize().catch((error: unknown) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }

  private async initialize(): Promise<void> {
    if (this.config.databaseUrl) {
      this.pool = createPgPool(this.config.databaseUrl, {
        max: Number(process.env.PG_POOL_MAX ?? 5),
      });
      await this.pool.query(POSTGRES_SCHEMA_SQL);
      return;
    }

    fs.mkdirSync(path.dirname(this.config.dbPath), { recursive: true });
    this.sqlite = new DatabaseSync(this.config.dbPath);
    this.sqlite.exec('PRAGMA journal_mode = WAL;');
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
    this.sqlite.exec('PRAGMA busy_timeout = 5000;');
    this.sqlite.exec(SCHEMA_SQL);
    const columns = this.sqlite
      .prepare('PRAGMA table_info(appointment_requests)')
      .all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'decision_note')) {
      this.sqlite.exec('ALTER TABLE appointment_requests ADD COLUMN decision_note TEXT');
    }
  }

  private enqueueSqlite<T>(work: () => T | Promise<T>): Promise<T> {
    const next = this.sqliteQueue.then(() => work());
    this.sqliteQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private sqliteOperation<T>(work: () => T): Promise<T> {
    if (this.sqliteTransaction.getStore()) return Promise.resolve(work());
    return this.enqueueSqlite(work);
  }

  private async query(
    sql: string,
    params: SqlValue[],
  ): Promise<{ rows: unknown[]; rowCount: number }> {
    await this.ensureReady();
    const client = this.pgTransaction.getStore();
    const values = params.map((value) => (typeof value === 'bigint' ? value.toString() : value));
    const result = client
      ? await client.query(toPostgresPlaceholders(sql), values)
      : await this.pool!.query(toPostgresPlaceholders(sql), values);
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
  }

  async all<T = Record<string, unknown>>(sql: string, ...params: SqlValue[]): Promise<T[]> {
    if (this.driver === 'postgres') {
      const result = await this.query(sql, params);
      return result.rows as T[];
    }
    await this.ensureReady();
    return this.sqliteOperation(() => this.sqlite!.prepare(sql).all(...params) as T[]);
  }

  async get<T = Record<string, unknown>>(sql: string, ...params: SqlValue[]): Promise<T | undefined> {
    if (this.driver === 'postgres') {
      const result = await this.query(sql, params);
      return result.rows[0] as T | undefined;
    }
    await this.ensureReady();
    return this.sqliteOperation(() => this.sqlite!.prepare(sql).get(...params) as T | undefined);
  }

  async run(sql: string, ...params: SqlValue[]): Promise<RunResult> {
    if (this.driver === 'postgres') {
      const result = await this.query(sql, params);
      return { changes: result.rowCount, lastInsertRowid: 0 };
    }
    await this.ensureReady();
    return this.sqliteOperation(() => {
      const result = this.sqlite!.prepare(sql).run(...params);
      return {
        changes: Number(result.changes),
        lastInsertRowid: Number(result.lastInsertRowid),
      };
    });
  }

  async exec(sql: string): Promise<void> {
    if (this.driver === 'postgres') {
      await this.query(sql, []);
      return;
    }
    await this.ensureReady();
    await this.sqliteOperation(() => this.sqlite!.exec(sql));
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    await this.ensureReady();
    if (this.driver === 'postgres') {
      if (this.pgTransaction.getStore()) return work();
      const client = await this.pool!.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          "SET LOCAL lock_timeout = '5000'; SET LOCAL idle_in_transaction_session_timeout = '15000';",
        );
        const result = await this.pgTransaction.run(client, work);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // ignore rollback failure, preserve the original error
        }
        throw error;
      } finally {
        client.release();
      }
    }

    if (this.sqliteTransaction.getStore()) return work();
    return this.enqueueSqlite(async () => {
      this.sqlite!.exec('BEGIN IMMEDIATE');
      try {
        const result = await this.sqliteTransaction.run(true, work);
        this.sqlite!.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          this.sqlite!.exec('ROLLBACK');
        } catch {
          // ignore rollback failure, preserve the original error
        }
        throw error;
      }
    });
  }

  async nextCounter(name: string): Promise<number> {
    const row = await this.get<{ value: number }>(
      `INSERT INTO counters (name, value) VALUES (?, 1)
       ON CONFLICT(name) DO UPDATE SET value = counters.value + 1
       RETURNING value`,
      name,
    );
    return row ? Number(row.value) : 1;
  }

  async lockAuditChain(): Promise<void> {
    if (this.driver !== 'postgres') return;
    await this.query('SELECT pg_advisory_xact_lock(?)', [917_001]);
  }

  async isHealthy(): Promise<boolean> {
    try {
      const row = await this.get<{ ok: number }>('SELECT 1 AS ok');
      return Number(row?.ok ?? 0) === 1;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end().catch(() => undefined);
      this.pool = null;
    }
    if (this.sqlite) {
      try {
        this.sqlite.close();
      } catch {
        // already closed
      }
      this.sqlite = null;
    }
  }
}

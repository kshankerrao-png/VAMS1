import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { SCHEMA_SQL } from './schema';

export type SqlValue = string | number | null | bigint;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly db: DatabaseSync;
  private inTransaction = false;
  readonly filePath: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.filePath = config.dbPath;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.db = new DatabaseSync(this.filePath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec(SCHEMA_SQL);
    const requestColumns = this.db.prepare('PRAGMA table_info(appointment_requests)').all() as Array<{ name: string }>;
    if (!requestColumns.some((column) => column.name === 'decision_note')) {
      this.db.exec('ALTER TABLE appointment_requests ADD COLUMN decision_note TEXT');
    }
  }

  all<T = Record<string, unknown>>(sql: string, ...params: SqlValue[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  get<T = Record<string, unknown>>(sql: string, ...params: SqlValue[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  run(sql: string, ...params: SqlValue[]): { changes: number; lastInsertRowid: number } {
    const result = this.db.prepare(sql).run(...params);
    return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  transaction<T>(fn: () => T): T {
    if (this.inTransaction) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    this.inTransaction = true;
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  nextCounter(name: string): number {
    const row = this.get<{ value: number }>(
      `INSERT INTO counters (name, value) VALUES (?, 1)
       ON CONFLICT(name) DO UPDATE SET value = value + 1
       RETURNING value`,
      name,
    );
    return row ? Number(row.value) : 1;
  }

  isHealthy(): boolean {
    try {
      const row = this.get<{ ok: number }>('SELECT 1 AS ok');
      return row?.ok === 1;
    } catch {
      return false;
    }
  }

  onModuleDestroy(): void {
    try {
      this.db.close();
    } catch {
      // already closed
    }
  }
}

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../config';
import { POSTGRES_SCHEMA_SQL } from './postgres-schema';
import { createPgPool } from './pg';

const TABLES = [
  'users',
  'visitor_profiles',
  'appointment_requests',
  'notifications',
  'notification_templates',
  'app_settings',
  'audit_log',
  'idempotency_keys',
  'counters',
];

const TRUNCATE_SQL = `TRUNCATE TABLE
  sessions, notifications, appointment_requests, visitor_profiles,
  notification_templates, app_settings, audit_log, idempotency_keys, counters, users
RESTART IDENTITY CASCADE`;

function quote(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const config = loadConfig();
  if (!config.databaseUrl) {
    console.error('DATABASE_URL is not set. Add the Supabase connection string to .env.');
    process.exitCode = 1;
    return;
  }

  const pool = createPgPool(config.databaseUrl, { max: 1 });
  try {
    await pool.query(POSTGRES_SCHEMA_SQL);

    const target = await pool.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM users');
    const targetUsers = Number(target.rows[0]?.count ?? 0);
    if (targetUsers > 0) {
      if (!force) {
        console.error(
          'Target database already has users. Re-run with --force to replace its data with the local SQLite copy.',
        );
        process.exitCode = 1;
        return;
      }
      await pool.query(TRUNCATE_SQL);
      console.log('Cleared existing Postgres data.');
    }

    if (!fs.existsSync(config.dbPath)) {
      console.log(`Schema is ready. No local SQLite database at ${config.dbPath}, so nothing was copied.`);
      return;
    }

    const sqlite = new DatabaseSync(config.dbPath, { readOnly: true });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const table of TABLES) {
        const columns = sqlite
          .prepare(`PRAGMA table_info(${quote(table)})`)
          .all() as Array<{ name: string }>;
        if (columns.length === 0) continue;
        const names = columns.map((column) => column.name);
        const rows = sqlite
          .prepare(`SELECT ${names.map(quote).join(', ')} FROM ${quote(table)}`)
          .all() as Array<Record<string, unknown>>;
        if (rows.length === 0) {
          console.log(`${table}: 0 rows`);
          continue;
        }
        const batchSize = 100;
        for (let start = 0; start < rows.length; start += batchSize) {
          const batch = rows.slice(start, start + batchSize);
          const values: unknown[] = [];
          const placeholders = batch.map((row) => {
            const slots = names.map((name) => {
              const value = row[name];
              values.push(typeof value === 'bigint' ? value.toString() : value ?? null);
              return `$${values.length}`;
            });
            return `(${slots.join(', ')})`;
          });
          await client.query(
            `INSERT INTO ${quote(table)} (${names.map(quote).join(', ')})
             VALUES ${placeholders.join(', ')}
             ON CONFLICT DO NOTHING`,
            values,
          );
        }
        console.log(`${table}: ${rows.length} rows`);
      }

      await client.query(
        `SELECT setval(
           pg_get_serial_sequence('audit_log', 'seq'),
           GREATEST((SELECT COALESCE(MAX(seq), 1) FROM audit_log), 1)
         )`,
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      sqlite.close();
      client.release();
    }

    console.log('Import complete. Postgres now holds the local SQLite data.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

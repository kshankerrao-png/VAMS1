import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { loadConfig } from './config';
import { POSTGRES_SCHEMA_SQL } from './db/postgres-schema';
import { runDemoSeed } from './seed/demo';

const DROP_SQL = `DROP TABLE IF EXISTS
  sessions, notifications, appointment_requests, visitor_profiles,
  notification_templates, app_settings, audit_log, idempotency_keys, counters, users
CASCADE`;

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.databaseUrl) {
    if (!process.argv.includes('--force')) {
      console.error('Refusing to wipe the Postgres database without --force.');
      process.exitCode = 1;
      return;
    }
    const pool = new Pool({ connectionString: config.databaseUrl, max: 1 });
    try {
      await pool.query(DROP_SQL);
      await pool.query(POSTGRES_SCHEMA_SQL);
      console.log('Postgres schema reset.');
    } finally {
      await pool.end();
    }
  } else {
    for (const suffix of ['', '-wal', '-shm']) {
      const file = `${config.dbPath}${suffix}`;
      if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    }
    fs.rmSync(path.join(config.storageDir, 'outbox'), { recursive: true, force: true });
    console.log(`Database reset at ${config.dbPath}`);
  }

  await runDemoSeed((message) => {
    console.log(message);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

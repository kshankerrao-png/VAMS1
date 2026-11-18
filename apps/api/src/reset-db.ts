import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config';
import { runDemoSeed } from './seed/demo';

async function main(): Promise<void> {
  const config = loadConfig();
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${config.dbPath}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
  fs.rmSync(path.join(config.storageDir, 'outbox'), { recursive: true, force: true });
  // eslint-disable-next-line no-console
  console.log(`Database reset at ${config.dbPath}`);
  await runDemoSeed((message) => {
    // eslint-disable-next-line no-console
    console.log(message);
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});

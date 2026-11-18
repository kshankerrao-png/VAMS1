import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { setupApp, serveWeb } from './setup';
import { DatabaseService } from './db/database.service';
import { PasswordService } from './auth/password.service';
import { AuditService } from './audit/audit.service';
import { ensureBaseline } from './seed/baseline';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: ['error', 'warn', 'log'],
  });
  setupApp(app, config);

  await ensureBaseline(
    app.get(DatabaseService),
    app.get(PasswordService),
    app.get(AuditService),
  );

  serveWeb(app, config);
  await app.listen(config.port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(
    `VAMS is running at http://localhost:${config.port} (environment: ${config.nodeEnv}, worker: ${config.workerEnabled ? 'on' : 'off'})`,
  );
}

void bootstrap();

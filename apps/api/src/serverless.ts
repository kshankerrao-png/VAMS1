import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { setupApp } from './setup';
import { DatabaseService } from './db/database.service';
import { PasswordService } from './auth/password.service';
import { AuditService } from './audit/audit.service';
import { ensureBaseline } from './seed/baseline';

type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void;

let handlerPromise: Promise<NodeHandler> | null = null;

async function createHandler(): Promise<NodeHandler> {
  const config = loadConfig();
  if (!config.databaseUrl) {
    // eslint-disable-next-line no-console
    console.warn(
      'VAMS: DATABASE_URL is not set on Vercel; data is stored in the ephemeral /tmp SQLite file and is lost between cold starts.',
    );
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: ['error', 'warn'],
  });
  setupApp(app, config);
  await ensureBaseline(
    app.get(DatabaseService),
    app.get(PasswordService),
    app.get(AuditService),
  );
  await app.init();
  return app.getHttpAdapter().getInstance() as NodeHandler;
}

function getHandler(): Promise<NodeHandler> {
  handlerPromise ??= createHandler().catch((error: unknown) => {
    handlerPromise = null;
    throw error;
  });
  return handlerPromise;
}

function restoreOriginalUrl(req: IncomingMessage): void {
  const raw = req.url ?? '/api';
  const questionMark = raw.indexOf('?');
  const path = questionMark === -1 ? raw : raw.slice(0, questionMark);
  const params = new URLSearchParams(questionMark === -1 ? '' : raw.slice(questionMark + 1));
  const rewrittenPath = params.get('__vams_path');
  params.delete('__vams_path');
  if (rewrittenPath && (path === '/api' || path === '/')) {
    const suffix = rewrittenPath.replace(/^\/+/, '');
    req.url = `/api${suffix ? `/${suffix}` : ''}`;
  } else {
    req.url = path;
  }
  const query = params.toString();
  if (query) req.url += `?${query}`;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  restoreOriginalUrl(req);
  const handle = await getHandler();
  handle(req, res);
}

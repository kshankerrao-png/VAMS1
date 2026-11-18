import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppConfig } from './config';
import { ProblemFilter } from './common/problem.filter';

export function setupApp(app: NestExpressApplication, config: AppConfig): void {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header('x-request-id') ?? randomUUID();
    (req as express.Request & { requestId?: string }).requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }
    const origin = req.header('origin');
    if (!origin) return next();
    const requestHost = req.header('host');
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = '';
    }
    const allowedHosts = new Set<string>(requestHost ? [requestHost] : []);
    if (!config.isProd) {
      allowedHosts.add('localhost:5173');
      allowedHosts.add('127.0.0.1:5173');
    }
    if (originHost && allowedHosts.has(originHost)) return next();
    res
      .status(403)
      .type('application/problem+json')
      .json({
        type: 'https://vams.local/problems/csrf_blocked',
        title: 'Cross-origin request blocked',
        status: 403,
        detail: 'State-changing requests must originate from the VAMS application.',
        code: 'CSRF_BLOCKED',
      });
  });
  if (!config.isProd) {
    app.enableCors({ origin: true, credentials: true });
  }
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();
}

export function serveWeb(app: NestExpressApplication, config: AppConfig): void {
  const indexFile = path.join(config.webDist, 'index.html');
  if (!fs.existsSync(indexFile)) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      if (req.path === '/') {
        res
          .type('html')
          .send(
            '<!doctype html><html><body style="font-family:Segoe UI,sans-serif;padding:40px;max-width:760px;margin:auto"><h2>VAMS API is running</h2><p>The web interface has not been built yet.</p><p>Run <code>npm run build</code> from the repository root, then restart, or use <code>npm run dev:web</code> for development.</p><p>API health: <a href="/api/health">/api/health</a></p></body></html>',
          );
        return;
      }
      next();
    });
    return;
  }

  app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || path.extname(req.path)) {
      return next();
    }
    res.sendFile(indexFile);
  });
}

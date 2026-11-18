import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/db/database.service';
import { PasswordService } from '../src/auth/password.service';
import { AuditService } from '../src/audit/audit.service';
import { ensureBaseline } from '../src/seed/baseline';
import { ProblemFilter } from '../src/common/problem.filter';

export interface TestHarness {
  app: INestApplication;
  db: DatabaseService;
  dir: string;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestHarness> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vams-test-'));
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = path.join(dir, 'vams.db');
  process.env.WORKER_ENABLED = 'false';
  process.env.ALLOW_NOTIFICATION_SIMULATION = 'true';
  process.env.SMTP_HOST = '';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '';
  process.env.WHATSAPP_TOKEN = '';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalFilters(new ProblemFilter());
  await app.init();
  await ensureBaseline(
    app.get(DatabaseService),
    app.get(PasswordService),
    app.get(AuditService),
  );

  return {
    app,
    db: app.get(DatabaseService),
    dir,
    close: async () => {
      await app.close();
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
    },
  };
}

export async function login(
  app: INestApplication,
  username: string,
  password: string,
) {
  const agent = request.agent(app.getHttpServer());
  const response = await agent.post('/api/auth/login').send({ username, password });
  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Login failed for ${username}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return agent;
}

export function intakeBody(overrides: Record<string, unknown> = {}) {
  const suffix = String(Date.now()).slice(-6);
  return {
    visitorName: 'Test Visitor',
    designation: 'Deputy Director',
    organization: 'Test Organisation',
    address: 'Test Address, New Delhi',
    mobile: `98765${suffix}`.slice(0, 10),
    email: `visitor.${suffix}@example.com`,
    purpose: 'Discussion regarding the road maintenance programme',
    accompanyingCount: 1,
    accompanyingNames: 'A. Colleague',
    documentsReference: 'Reference note',
    remarks: 'Created by integration test',
    ...overrides,
  };
}

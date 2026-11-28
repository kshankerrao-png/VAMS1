import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, intakeBody, login, TestHarness } from './helpers';

let harness: TestHarness;
let admin: Awaited<ReturnType<typeof login>>;
let peshi: Awaited<ReturnType<typeof login>>;

beforeAll(async () => {
  harness = await createTestApp();
  admin = await login(harness.app, 'admin', 'Admin@123456');
  peshi = await login(harness.app, 'peshi', 'Peshi@123456');

  const created = await peshi.post('/api/requests').send(intakeBody());
  expect(created.status).toBe(201);
});

afterAll(async () => {
  await harness.close();
});

describe('administrator clear all data', () => {
  it('rejects a wrong password and keeps the data', async () => {
    const response = await admin.post('/api/admin/clear-data').send({ password: 'wrong-password' });
    expect(response.status).toBe(403);

    const list = await admin.get('/api/requests');
    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThan(0);
  });

  it('clears business data with the configured password', async () => {
    const response = await admin
      .post('/api/admin/clear-data')
      .send({ password: 'Tr&b@123' });
    expect(response.status).toBe(200);
    expect(response.body.requests).toBeGreaterThan(0);
    expect(response.body.visitors).toBeGreaterThan(0);

    const list = await admin.get('/api/requests');
    expect(list.body.total).toBe(0);

    const users = await admin.get('/api/admin/users');
    expect(users.status).toBe(200);
    expect(users.body.items).toHaveLength(3);

    const verify = await admin.get('/api/audit/verify');
    expect(verify.status).toBe(200);
    expect(verify.body.valid).toBe(true);
    expect(verify.body.checked).toBe(1);
  });
});

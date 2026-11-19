import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { addDays, istDay } from '../src/common/time';
import { NotificationWorker } from '../src/notifications/notification.worker';
import { createTestApp, intakeBody, login, TestHarness } from './helpers';

let harness: TestHarness;
let peshi: Awaited<ReturnType<typeof login>>;
let secretary: Awaited<ReturnType<typeof login>>;
let admin: Awaited<ReturnType<typeof login>>;
const futureDay = addDays(istDay(), 3);

beforeAll(async () => {
  harness = await createTestApp();
  peshi = await login(harness.app, 'peshi', 'Peshi@123456');
  secretary = await login(harness.app, 'secretary', 'Secretary@123');
  admin = await login(harness.app, 'admin', 'Admin@123456');
});

afterAll(async () => {
  await harness.close();
});

describe('authentication and RBAC', () => {
  it('exposes a public health endpoint', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('rejects invalid credentials', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'peshi', password: 'wrong-password' });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns the signed-in user with permissions', async () => {
    const response = await secretary.get('/api/auth/me');
    expect(response.status).toBe(200);
    expect(response.body.user.username).toBe('secretary');
    expect(response.body.user.permissions).toContain('request:decide');
    expect(response.body.user.permissions).not.toContain('admin:manage');
  });

  it('blocks peshi staff from audit, reports, admin and decisions', async () => {
    expect((await peshi.get('/api/audit')).status).toBe(403);
    expect((await peshi.get('/api/reports/summary')).status).toBe(403);
    expect((await peshi.get('/api/admin/users')).status).toBe(403);
    expect((await peshi.get('/api/register/export')).status).toBe(403);
  });

  it('allows only admin to list users', async () => {
    expect((await admin.get('/api/admin/users')).status).toBe(200);
    expect((await secretary.get('/api/admin/users')).status).toBe(403);
  });
});

describe('intake, lookup and history', () => {
  let createdId = '';
  const mobile = '9812300456';
  const email = 'lookup.visitor@example.com';

  it('validates required fields', async () => {
    const response = await peshi.post('/api/requests').send({ visitorName: 'X' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.errors.purpose).toBeTruthy();
  });

  it('creates a request and normalizes the mobile number', async () => {
    const response = await peshi
      .post('/api/requests')
      .send(
        intakeBody({
          visitorName: 'Meera Krishnan',
          designation: 'Director',
          organization: 'Metro Rail Corporation',
          mobile,
          email,
          purpose: 'Review of the metro extension alignment',
        }),
      );
    expect(response.status).toBe(201);
    expect(response.body.reference).toMatch(/^VAMS-\d{4}-\d{5}$/);
    expect(response.body.status).toBe('PENDING_APPROVAL');
    expect(response.body.visitorMobile).toBe('+919812300456');
    createdId = response.body.id;
  });

  it('finds the visitor by name, mobile and email with auto-fill', async () => {
    const byMobile = await peshi.get(`/api/visitors/lookup?q=${mobile.slice(-5)}`);
    expect(byMobile.status).toBe(200);
    expect(byMobile.body.matches[0].id).toBeTruthy();
    expect(byMobile.body.autoFillProfile).not.toBeNull();

    const byName = await peshi.get('/api/visitors/lookup?q=Meera');
    expect(byName.body.matches.length).toBeGreaterThan(0);

    const byEmail = await peshi.get('/api/visitors/lookup?q=lookup.visitor@example.com');
    expect(byEmail.body.matches[0].email).toBe(email);
  });

  it('updates a visitor profile from the register', async () => {
    const lookup = await peshi.get('/api/visitors/lookup?q=lookup.visitor@example.com');
    const visitorId = lookup.body.matches[0].id as string;

    const updated = await peshi.patch(`/api/visitors/${visitorId}`).send({
      name: 'Meera Krishnan',
      designation: 'Joint Director',
      organization: 'Metro Rail Corporation',
      address: 'Metro Bhavan, New Delhi',
      mobile,
      email,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.designation).toBe('Joint Director');
    expect(updated.body.address).toBe('Metro Bhavan, New Delhi');

    const detail = await peshi.get(`/api/visitors/${visitorId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.visitor.designation).toBe('Joint Director');
  });

  it('links a returning visitor to their existing profile and history', async () => {
    const second = await peshi
      .post('/api/requests')
      .send(
        intakeBody({
          visitorName: 'Meera Krishnan',
          designation: 'Director',
          organization: 'Metro Rail Corporation',
          mobile,
          email,
          purpose: 'Follow-up on the revised alignment drawings',
        }),
      );
    expect(second.status).toBe(201);
    expect(second.body.visitorId).toBeTruthy();

    const history = second.body.history as Array<{ id: string }>;
    expect(history.some((item) => item.id === createdId)).toBe(true);
    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  it('warns about duplicate open requests without blocking entry', async () => {
    const response = await peshi.get(`/api/requests/duplicates?mobile=${mobile}&email=${email}`);
    expect(response.status).toBe(200);
    expect(response.body.hasDuplicate).toBe(true);
  });
});

describe('review, scheduling and notifications', () => {
  let requestId = '';
  let reference = '';

  beforeAll(async () => {
    const created = await peshi
      .post('/api/requests')
      .send(
        intakeBody({
          visitorName: 'Anil Deshmukh',
          organization: 'Highway Builders Association',
          mobile: '9822200331',
          email: 'anil.deshmukh@example.com',
          purpose: 'Appointment for the expressway review meeting',
        }),
      );
    requestId = created.body.id;
    reference = created.body.reference;
  });

  it('prevents peshi staff from approving or rejecting', async () => {
    const response = await peshi
      .post(`/api/requests/${requestId}/approve`)
      .send({ assignedDate: futureDay, assignedTime: '10:30' });
    expect(response.status).toBe(403);
  });

  it('requires a future slot', async () => {
    const response = await secretary
      .post(`/api/requests/${requestId}/approve`)
      .send({ assignedDate: addDays(istDay(), -2), assignedTime: '10:30' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SLOT_IN_PAST');
  });

  it('approves with a slot and queues both notifications', async () => {
    const response = await secretary
      .post(`/api/requests/${requestId}/approve`)
      .set('idempotency-key', 'test-approve-001')
      .send({
        assignedDate: futureDay,
        assignedTime: '10:30',
        note: 'Bring the revised sanction file.',
      });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe('APPROVED');
    expect(response.body.assignedDate).toBe(futureDay);
    expect(response.body.assignedTime).toBe('10:30');
    expect(response.body.decisionNote).toBe('Bring the revised sanction file.');
    expect(response.body.notifications).toHaveLength(2);
    expect(response.body.notifications.map((item: { channel: string }) => item.channel).sort()).toEqual([
      'EMAIL',
      'WHATSAPP',
    ]);
  });

  it('replays the same idempotent approval without duplicating notifications', async () => {
    const replay = await secretary
      .post(`/api/requests/${requestId}/approve`)
      .set('idempotency-key', 'test-approve-001')
      .send({ assignedDate: futureDay, assignedTime: '10:30' });
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(requestId);
    expect(replay.body.notifications).toHaveLength(2);

    const count = await harness.db.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM notifications WHERE request_id = ?',
      requestId,
    );
    expect(Number(count?.count)).toBe(2);
  });

  it('rejects a second decision on the same request', async () => {
    const response = await secretary
      .post(`/api/requests/${requestId}/approve`)
      .send({ assignedDate: futureDay, assignedTime: '11:45' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ILLEGAL_TRANSITION');
  });

  it('dispatches queued notifications through the worker (simulated providers)', async () => {
    await harness.app.get(NotificationWorker).drainAll();
    const detail = await secretary.get(`/api/requests/${requestId}`);
    expect(detail.status).toBe(200);
    const notifications = detail.body.notifications as Array<{ status: string }>;
    expect(notifications.every((item) => item.status === 'DELIVERED')).toBe(true);
  });

  it('cannot materialize before the slot arrives', async () => {
    const response = await secretary.post(`/api/requests/${requestId}/materialize`).send({});
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SLOT_NOT_REACHED');
  });

  it('finds the record through combinable filters', async () => {
    const response = await secretary.get(
      `/api/requests?q=${encodeURIComponent(reference)}&status=APPROVED&assignedFrom=${futureDay}&assignedTo=${futureDay}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].id).toBe(requestId);
  });

  it('exports the filtered register and records the export in the audit log', async () => {
    const csv = await secretary.get('/api/register/export?status=APPROVED');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain(reference);
    const exportEntry = await harness.db.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM audit_log WHERE action = 'EXPORT_GENERATED'",
    );
    expect(Number(exportEntry?.count)).toBeGreaterThan(0);
  });
});

describe('rejection flow', () => {
  it('rejects a pending request with a reason and records it', async () => {
    const created = await peshi.post('/api/requests').send(
      intakeBody({
        visitorName: 'Rejected Visitor',
        mobile: '9833300442',
        email: 'rejected.visitor@example.com',
        purpose: 'Appointment request that will be rejected',
      }),
    );
    const response = await secretary
      .post(`/api/requests/${created.body.id}/reject`)
      .send({ reason: 'Please route this through the works division.' });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe('REJECTED');
    expect(response.body.rejectionReason).toContain('works division');
    expect(response.body.notifications).toHaveLength(0);

    const detail = await secretary.get(`/api/requests/${created.body.id}`);
    expect(detail.body.audits.some((entry: { action: string }) => entry.action === 'REQUEST_REJECTED')).toBe(true);
  });
});

describe('audit log integrity', () => {
  it('verifies the hash chain', async () => {
    const response = await secretary.get('/api/audit/verify');
    expect(response.status).toBe(200);
    expect(response.body.valid).toBe(true);
    expect(response.body.checked).toBeGreaterThan(0);
  });

  it('refuses updates and deletes at the database level', async () => {
    await expect(
      harness.db.run("UPDATE audit_log SET actor_name = 'tampered' WHERE seq = 1"),
    ).rejects.toThrow();
    await expect(harness.db.run('DELETE FROM audit_log WHERE seq = 1')).rejects.toThrow();
  });

  it('filters audit entries by action', async () => {
    const response = await secretary.get('/api/audit?action=REQUEST_APPROVED');
    expect(response.status).toBe(200);
    expect(response.body.items.length).toBeGreaterThan(0);
    expect(response.body.items[0].action).toBe('REQUEST_APPROVED');
  });
});

describe('notifications management', () => {
  it('exposes notification status and supports resend for a failed notification', async () => {
    const approved = await harness.db.get<{ id: string }>(
      "SELECT id FROM appointment_requests WHERE status = 'APPROVED' LIMIT 1",
    );
    expect(approved).toBeTruthy();
    const notifications = await secretary.get(`/api/notifications?requestId=${approved!.id}`);
    expect(notifications.status).toBe(200);
    const notificationId = notifications.body[0].id as string;
    await secretary.post(`/api/notifications/${notificationId}/simulate-delivery`).send({});
    const resend = await secretary
      .post(`/api/notifications/${notificationId}/resend`)
      .send({});
    expect(resend.status).toBe(201);
    expect(resend.body.status).toBe('QUEUED');
  });

  it('requires a requestId when listing notifications', async () => {
    const response = await secretary.get('/api/notifications');
    expect(response.status).toBe(400);
  });
});

describe('admin', () => {
  it('creates a user, prevents duplicates and resets a password', async () => {
    const create = await admin.post('/api/admin/users').send({
      username: 'test.operator',
      name: 'Test Operator',
      role: 'PESHI_STAFF',
      email: 'operator@example.com',
      password: 'Operator@12345',
    });
    expect(create.status).toBe(201);
    expect(create.body.mustChangePassword).toBe(true);

    const duplicate = await admin.post('/api/admin/users').send({
      username: 'test.operator',
      name: 'Duplicate',
      role: 'PESHI_STAFF',
      password: 'Operator@12345',
    });
    expect(duplicate.status).toBe(409);

    const reset = await admin
      .post(`/api/admin/users/${create.body.id}/reset-password`)
      .send({ password: 'NewOperator@123' });
    expect(reset.status).toBe(201);
  });

  it('prevents an administrator from deactivating their own account', async () => {
    const me = await admin.get('/api/auth/me');
    const response = await admin
      .patch(`/api/admin/users/${me.body.user.id}`)
      .send({ active: false });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('CANNOT_DEACTIVATE_SELF');
  });

  it('updates settings and templates with audit entries', async () => {
    const settings = await admin.put('/api/admin/settings').send({
      maxPerSlot: 2,
      allowStaffMaterialize: false,
      venue: 'Conference Room, T,R&B Department',
      instructions: 'Carry a photo ID.',
    });
    expect(settings.status).toBe(200);
    expect(settings.body.maxPerSlot).toBe(2);

    const template = await admin.put('/api/admin/templates/email').send({
      subject: 'Appointment confirmed {{reference}}',
      body: 'Dear {{visitor_name}}, your appointment is on {{assigned_date}} at {{assigned_time}}.',
    });
    expect(template.status).toBe(200);
    expect(template.body.version).toBeGreaterThan(0);

    const system = await admin.get('/api/admin/system');
    expect(system.status).toBe(200);
    expect(system.body.emailConfigured).toBe(false);
  });
});

describe('reports', () => {
  it('returns summary statistics and a printable daily schedule', async () => {
    const summary = await secretary.get('/api/reports/summary');
    expect(summary.status).toBe(200);
    expect(summary.body.totalRequests).toBeGreaterThan(0);
    expect(summary.body.notifications.delivered).toBeGreaterThan(0);

    const schedule = await secretary.get(`/api/reports/schedule?date=${futureDay}`);
    expect(schedule.status).toBe(200);
    expect(schedule.body.date).toBe(futureDay);
  });
});

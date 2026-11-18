import { NestFactory } from '@nestjs/core';
import { permissionsForRole } from '@vams/shared';
import type { AuthUser } from '@vams/shared';
import { AppModule } from '../app.module';
import { DatabaseService } from '../db/database.service';
import { PasswordService } from '../auth/password.service';
import { AuditService } from '../audit/audit.service';
import { RequestsService } from '../requests/requests.service';
import { NotificationWorker } from '../notifications/notification.worker';
import { toAuthUser, UserRow } from '../users/user.types';
import { addDays, istDay, nowIso } from '../common/time';
import { ensureBaseline } from './baseline';

interface DemoVisitor {
  name: string;
  designation: string;
  organization: string;
  address: string;
  mobile: string;
  email: string;
}

const CONTEXT = { ip: '127.0.0.1', userAgent: 'demo-seed', requestId: null };

const VISITORS = {
  ramesh: {
    name: 'Ramesh Kumar',
    designation: 'Joint Director',
    organization: 'National Highways Authority of India',
    address: 'Transport Bhawan, New Delhi',
    mobile: '9876543210',
    email: 'ramesh.kumar@example.gov.in',
  },
  sunita: {
    name: 'Sunita Rao',
    designation: 'Managing Director',
    organization: 'Rao Constructions Pvt Ltd',
    address: 'Banjara Hills, Hyderabad',
    mobile: '9812345678',
    email: 'sunita.rao@example.com',
  },
  arjun: {
    name: 'Arjun Mehta',
    designation: 'Chief Engineer',
    organization: 'State Road Development Corporation',
    address: 'Sector 12, Gandhinagar',
    mobile: '9823456781',
    email: 'arjun.mehta@example.gov.in',
  },
  fatima: {
    name: 'Fatima Begum',
    designation: 'President',
    organization: 'Transport Workers Union',
    address: 'Charminar, Hyderabad',
    mobile: '9834567892',
    email: 'fatima.begum@example.com',
  },
  vikram: {
    name: 'Vikram Singh',
    designation: 'Director',
    organization: 'Singh Logistics',
    address: 'Industrial Area, Ludhiana',
    mobile: '9845678903',
    email: 'vikram.singh@example.com',
  },
  ananya: {
    name: 'Ananya Iyer',
    designation: 'Architect',
    organization: 'Iyer & Associates',
    address: 'Adyar, Chennai',
    mobile: '9856789014',
    email: 'ananya.iyer@example.com',
  },
  rafi: {
    name: 'Mohammed Rafi',
    designation: 'Contractor',
    organization: 'Rafi Infra',
    address: 'Old City, Bengaluru',
    mobile: '9867890125',
    email: 'mohammed.rafi@example.com',
  },
  kavita: {
    name: 'Kavita Sharma',
    designation: 'Correspondent',
    organization: 'The Daily Chronicle',
    address: 'Press Enclave, New Delhi',
    mobile: '9878901236',
    email: 'kavita.sharma@example.com',
  },
  suresh: {
    name: 'Suresh Reddy',
    designation: 'Engineer-in-Chief',
    organization: 'Irrigation Department',
    address: 'Jubilee Hills, Hyderabad',
    mobile: '9889012347',
    email: 'suresh.reddy@example.gov.in',
  },
  neha: {
    name: 'Neha Gupta',
    designation: 'Consultant',
    organization: 'Urban Mobility Advisors',
    address: 'Koramangala, Bengaluru',
    mobile: '9890123458',
    email: 'neha.gupta@example.com',
  },
} satisfies Record<string, DemoVisitor>;

export async function runDemoSeed(log: (message: string) => void = console.log): Promise<void> {
  process.env.WORKER_ENABLED = 'false';

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const db = app.get(DatabaseService);
    await ensureBaseline(db, app.get(PasswordService), app.get(AuditService));

    const existing = db.get<{ count: number }>('SELECT COUNT(*) AS count FROM appointment_requests');
    if (Number(existing?.count ?? 0) > 0) {
      log('Demo data already present — skipping. Use "npm run db:reset" for a clean reseed.');
      return;
    }

    const audit = app.get(AuditService);
    const requests = app.get(RequestsService);
    const worker = app.get(NotificationWorker);

    const actor = (username: string): AuthUser => {
      const row = db.get<UserRow>('SELECT * FROM users WHERE username = ?', username);
      if (!row) throw new Error(`Seed user ${username} is missing.`);
      return toAuthUser(row, permissionsForRole(row.role));
    };
    const peshi = actor('peshi');
    const secretary = actor('secretary');
    const today = istDay();

    const create = (
      visitor: DemoVisitor,
      purpose: string,
      extra: {
        accompanyingCount?: number;
        accompanyingNames?: string;
        documentsReference?: string;
        remarks?: string;
      } = {},
    ) =>
      requests.create(
        {
          visitorName: visitor.name,
          designation: visitor.designation,
          organization: visitor.organization,
          address: visitor.address,
          mobile: visitor.mobile,
          email: visitor.email,
          purpose,
          accompanyingCount: extra.accompanyingCount,
          accompanyingNames: extra.accompanyingNames,
          documentsReference: extra.documentsReference,
          remarks: extra.remarks,
        },
        peshi,
        CONTEXT,
      );

    const approve = (id: string, date: string, time: string) =>
      requests.approve(
        id,
        { assignedDate: date, assignedTime: time },
        secretary,
        CONTEXT,
        undefined,
        { allowPast: true },
      );

    const materialize = (id: string, timeIn: string) =>
      requests.materialize(id, { timeIn }, secretary, CONTEXT);

    const reject = (id: string, reason: string) =>
      requests.reject(id, { reason }, secretary, CONTEXT);

    const ageRequest = (id: string, days: number) => {
      const day = addDays(today, -days);
      const timestamp = new Date(`${day}T10:00:00+05:30`).toISOString();
      db.run(
        'UPDATE appointment_requests SET request_date = ?, request_day = ? WHERE id = ?',
        timestamp,
        day,
        id,
      );
    };

    const rameshPending = create(
      VISITORS.ramesh,
      'Represent NHAI on the pending land acquisition proposal for the outer ring corridor',
    );
    const rameshApproved = create(
      VISITORS.ramesh,
      'Follow up on the corridor widening review minutes',
    );
    const rameshCompleted = create(
      VISITORS.ramesh,
      'Submit the revised DPR for the bypass alignment',
      { documentsReference: 'DPR Vol I & II' },
    );
    const sunitaCompleted = create(
      VISITORS.sunita,
      'Discuss pending payments for completed road works',
    );
    const sunitaRejected = create(
      VISITORS.sunita,
      'Request for an additional contract extension',
    );
    const arjunApproved = create(
      VISITORS.arjun,
      'Quarterly review of state highway maintenance contracts',
    );
    const arjunPending = create(
      VISITORS.arjun,
      'Proposal for bridge rehabilitation funds',
    );
    const fatimaPending = create(
      VISITORS.fatima,
      'Representation on the transport worker welfare scheme',
      { accompanyingCount: 3, accompanyingNames: 'R. Das, S. Ali, M. Khan' },
    );
    const vikramApproved = create(
      VISITORS.vikram,
      'Fleet permit discussion for inter-state transport operations',
    );
    const vikramCompleted = create(
      VISITORS.vikram,
      'Kick-off meeting for the logistics hub feasibility study',
    );
    const ananyaPending = create(
      VISITORS.ananya,
      'Presentation of the revised station design',
      { accompanyingCount: 2, accompanyingNames: 'R. Menon, P. Shah' },
    );
    const rafiRejected = create(
      VISITORS.rafi,
      'Reconsideration of tender disqualification',
    );
    const rafiPending = create(
      VISITORS.rafi,
      'Clarification on the new tender norms',
    );
    const kavitaPending = create(
      VISITORS.kavita,
      'Interview regarding the road safety programme',
    );
    const sureshApproved = create(
      VISITORS.suresh,
      'Coordination on canal road restoration',
    );
    const nehaApproved = create(
      VISITORS.neha,
      'Discussion on the urban mobility study findings',
      { documentsReference: 'Mobility study summary' },
    );
    const nehaCompleted = create(
      VISITORS.neha,
      'Presentation of the mobility study baseline',
    );

    approve(rameshApproved.id, addDays(today, 2), '10:30');
    approve(arjunApproved.id, addDays(today, 1), '15:00');
    approve(vikramApproved.id, addDays(today, 3), '12:00');
    approve(sureshApproved.id, today, '09:30');
    approve(nehaApproved.id, addDays(today, 4), '16:30');

    approve(rameshCompleted.id, addDays(today, -20), '11:15');
    materialize(rameshCompleted.id, '11:05');
    approve(sunitaCompleted.id, addDays(today, -12), '10:00');
    materialize(sunitaCompleted.id, '10:10');
    approve(vikramCompleted.id, addDays(today, -28), '14:30');
    materialize(vikramCompleted.id, '14:25');
    approve(nehaCompleted.id, addDays(today, -35), '11:00');
    materialize(nehaCompleted.id, '11:20');

    reject(sunitaRejected.id, 'Please route the request through the works division.');
    reject(rafiRejected.id, 'The matter is sub judice; refer to the legal cell.');

    ageRequest(arjunPending.id, 3);
    ageRequest(ananyaPending.id, 6);
    ageRequest(kavitaPending.id, 2);

    await worker.drainAll();

    const failureTarget = db.get<{ id: string; request_id: string; channel: string }>(
      `SELECT id, request_id, channel FROM notifications
       WHERE status = 'DELIVERED' AND channel = 'WHATSAPP'
       ORDER BY created_at DESC LIMIT 1`,
    );
    if (failureTarget) {
      db.run(
        `UPDATE notifications
         SET status = 'FAILED', delivered_at = NULL, error_message = ?, updated_at = ?
         WHERE id = ?`,
        'Recipient has not opted in to WhatsApp messages (simulated provider failure)',
        nowIso(),
        failureTarget.id,
      );
      audit.log({
        actor: { id: null, name: 'System (demo seed)' },
        action: 'NOTIFICATION_FAILED',
        entityType: 'notification',
        entityId: failureTarget.id,
        after: { requestId: failureTarget.request_id, channel: failureTarget.channel, simulated: true },
        ip: null,
        userAgent: 'demo-seed',
        requestId: null,
      });
    }

    const queuedTarget = db.get<{ id: string; request_id: string; channel: string }>(
      `SELECT id, request_id, channel FROM notifications
       WHERE status = 'DELIVERED' AND channel = 'EMAIL'
       ORDER BY created_at ASC LIMIT 1`,
    );
    if (queuedTarget) {
      const retryAt = new Date(Date.now() + 86_400_000).toISOString();
      db.run(
        `UPDATE notifications
         SET status = 'QUEUED', attempt = 0, next_attempt_at = ?, sent_at = NULL, delivered_at = NULL,
             provider_message_id = NULL, updated_at = ?
         WHERE id = ?`,
        retryAt,
        nowIso(),
        queuedTarget.id,
      );
    }

    const counts = db.all<{ status: string; count: number }>(
      'SELECT status, COUNT(*) AS count FROM appointment_requests GROUP BY status',
    );
    log('Demo data seeded.');
    log(`Visitors: ${Object.keys(VISITORS).length} · Requests: ${counts.reduce((sum, row) => sum + Number(row.count), 0)}`);
    for (const row of counts) log(`  ${row.status}: ${row.count}`);
    log('Sign in with: peshi / Peshi@123456 · secretary / Secretary@123 · admin / Admin@123456');
    void rameshPending;
    void fatimaPending;
    void rafiPending;
  } finally {
    await app.close();
  }
}

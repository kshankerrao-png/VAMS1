import { randomUUID } from 'node:crypto';
import type { Role } from '@vams/shared';
import { DEFAULT_TEMPLATES } from '@vams/shared';
import { DatabaseService } from '../db/database.service';
import { PasswordService } from '../auth/password.service';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_SETTINGS } from '../settings/settings.module';
import { nowIso } from '../common/time';

export interface DemoAccount {
  username: string;
  name: string;
  role: Role;
  password: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { username: 'peshi', name: 'Priya Nair', role: 'PESHI_STAFF', password: 'Peshi@123456' },
  { username: 'secretary', name: 'Secretary, T,R&B', role: 'SECRETARY', password: 'Secretary@123' },
  { username: 'admin', name: 'System Administrator', role: 'ADMIN', password: 'Admin@123456' },
];

export async function ensureBaseline(
  db: DatabaseService,
  passwords: PasswordService,
  audit: AuditService,
): Promise<void> {
  const timestamp = nowIso();

  for (const template of DEFAULT_TEMPLATES) {
    const existing = db.get<{ id: string }>(
      'SELECT id FROM notification_templates WHERE channel = ?',
      template.channel,
    );
    if (!existing) {
      db.run(
        `INSERT INTO notification_templates (id, channel, subject, body, version, active, updated_by, updated_at)
         VALUES (?, ?, ?, ?, 1, 1, NULL, ?)`,
        randomUUID(),
        template.channel,
        template.subject,
        template.body,
        timestamp,
      );
    }
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = db.get<{ key: string }>('SELECT key FROM app_settings WHERE key = ?', key);
    if (!existing) {
      db.run(
        'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
        key,
        JSON.stringify(value),
        timestamp,
      );
    }
  }

  const count = db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users');
  if (Number(count?.count ?? 0) === 0) {
    for (const account of DEMO_ACCOUNTS) {
      const hash = await passwords.hash(account.password);
      db.run(
        `INSERT INTO users
         (id, username, name, email, role, password_hash, active, must_change_password, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, 1, 0, ?, ?)`,
        randomUUID(),
        account.username,
        account.name,
        account.role,
        hash,
        timestamp,
        timestamp,
      );
    }
    audit.log({
      actor: { id: null, name: 'System (bootstrap)' },
      action: 'SEED_DATA',
      entityType: 'user',
      entityId: null,
      after: { accounts: DEMO_ACCOUNTS.map((account) => account.username) },
      ip: null,
      userAgent: 'bootstrap',
      requestId: null,
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AppSettings,
  AuthUser,
  Permission,
  Role,
  SystemInfo,
  UserRecord,
} from '@vams/shared';
import { permissionsForRole, ROLE_LABELS } from '@vams/shared';
import { APP_CONFIG, AppConfig } from '../config';
import { DatabaseService } from '../db/database.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.module';
import { PasswordService } from '../auth/password.service';
import { SessionService } from '../auth/session.service';
import { toUserRecord, UserRow } from '../users/user.types';
import { conflict, notFound, badRequest } from '../common/errors';
import { nowIso } from '../common/time';
import type { RequestContext } from '../common/decorators';

export interface CreateUserInput {
  username: string;
  name: string;
  role: Role;
  email?: string;
  password: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: Role;
  active?: boolean;
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  listUsers(): UserRecord[] {
    const rows = this.db.all<UserRow>('SELECT * FROM users ORDER BY created_at ASC');
    return rows.map(toUserRecord);
  }

  async createUser(
    input: CreateUserInput,
    actor: AuthUser,
    context: RequestContext,
  ): Promise<UserRecord> {
    const existing = this.db.get<{ id: string }>(
      'SELECT id FROM users WHERE username = ?',
      input.username,
    );
    if (existing) {
      throw conflict('DUPLICATE_USERNAME', 'That username is already in use.');
    }
    const id = randomUUID();
    const timestamp = nowIso();
    const hash = await this.passwords.hash(input.password);
    this.db.run(
      `INSERT INTO users
       (id, username, name, email, role, password_hash, active, must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      id,
      input.username,
      input.name,
      input.email ?? null,
      input.role,
      hash,
      timestamp,
      timestamp,
    );
    this.audit.log({
      actor: { id: actor.id, name: actor.name },
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: id,
      after: { username: input.username, role: input.role, roleLabel: ROLE_LABELS[input.role] },
      ...context,
    });
    const row = this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', id)!;
    return toUserRecord(row);
  }

  updateUser(
    id: string,
    input: UpdateUserInput,
    actor: AuthUser,
    context: RequestContext,
  ): UserRecord {
    const current = this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', id);
    if (!current) throw notFound('User', 'USER_NOT_FOUND');
    if (current.id === actor.id && input.active === false) {
      throw badRequest('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account.');
    }
    if (current.id === actor.id && input.role && input.role !== current.role) {
      throw badRequest('CANNOT_CHANGE_OWN_ROLE', 'You cannot change your own role.');
    }
    const losesSecretary =
      current.role === 'SECRETARY' &&
      current.active === 1 &&
      ((input.role !== undefined && input.role !== 'SECRETARY') || input.active === false);
    if (losesSecretary) {
      const others = this.db.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM users
         WHERE role = 'SECRETARY' AND active = 1 AND id != ?`,
        id,
      );
      if (Number(others?.count ?? 0) === 0) {
        throw conflict('LAST_SECRETARY', 'At least one active Secretary account is required.');
      }
    }

    const name = input.name ?? current.name;
    const email = input.email !== undefined ? input.email || null : current.email;
    const role = input.role ?? current.role;
    const active = input.active === undefined ? current.active : input.active ? 1 : 0;
    this.db.run(
      'UPDATE users SET name = ?, email = ?, role = ?, active = ?, updated_at = ? WHERE id = ?',
      name,
      email,
      role,
      active,
      nowIso(),
      id,
    );
    if (!active) this.sessions.destroyForUser(id);
    this.audit.log({
      actor: { id: actor.id, name: actor.name },
      action: 'USER_UPDATED',
      entityType: 'user',
      entityId: id,
      before: { name: current.name, role: current.role, active: Boolean(current.active) },
      after: { name, role, active: Boolean(active) },
      ...context,
    });
    return toUserRecord(this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', id)!);
  }

  async resetPassword(
    id: string,
    password: string,
    actor: AuthUser,
    context: RequestContext,
  ): Promise<UserRecord> {
    const user = this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', id);
    if (!user) throw notFound('User', 'USER_NOT_FOUND');
    const hash = await this.passwords.hash(password);
    this.db.run(
      'UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?',
      hash,
      nowIso(),
      id,
    );
    this.sessions.destroyForUser(id);
    this.audit.log({
      actor: { id: actor.id, name: actor.name },
      action: 'USER_PASSWORD_RESET',
      entityType: 'user',
      entityId: id,
      after: { username: user.username },
      ...context,
    });
    return toUserRecord(this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', id)!);
  }

  updateSettings(
    input: AppSettings,
    actor: AuthUser,
    context: RequestContext,
  ): AppSettings {
    const before = this.settings.get();
    const updated = this.settings.update(input);
    this.audit.log({
      actor: { id: actor.id, name: actor.name },
      action: 'SETTINGS_UPDATED',
      entityType: 'app_settings',
      entityId: 'settings',
      before,
      after: updated,
      ...context,
    });
    return updated;
  }

  systemInfo(): SystemInfo {
    return {
      appVersion: this.config.appVersion,
      environment: this.config.nodeEnv,
      dbFile: this.config.dbPath,
      storageDir: this.config.storageDir,
      workerEnabled: this.config.workerEnabled,
      emailConfigured: this.config.emailConfigured,
      whatsappConfigured: this.config.whatsappConfigured,
      uptimeSeconds: Math.floor(process.uptime()),
      serverTime: nowIso(),
    };
  }

  permissionsFor(user: { role: Role }): Permission[] {
    return permissionsForRole(user.role, {
      allowStaffMaterialize: this.settings.get().allowStaffMaterialize,
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type { AuthUser } from '@vams/shared';
import { DatabaseService } from '../db/database.service';
import { AuditService } from '../audit/audit.service';
import { apiError, unauthorized } from '../common/errors';
import { nowIso } from '../common/time';
import type { RequestContext } from '../common/decorators';
import { AuthzService } from './authz.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { toAuthUser, UserRow } from '../users/user.types';

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly attempts = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuthzService) private readonly authz: AuthzService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async login(
    username: string,
    password: string,
    context: RequestContext,
  ): Promise<{ token: string; user: AuthUser }> {
    const normalized = username.trim().toLowerCase();
    const key = `${context.ip ?? 'unknown'}|${normalized}`;
    const attempt = this.attempts.get(key);
    if (attempt && attempt.lockedUntil > Date.now()) {
      throw apiError(
        429,
        'RATE_LIMITED',
        'Too many sign-in attempts',
        'This account is temporarily locked. Try again in a few minutes.',
      );
    }

    const row = this.db.get<UserRow>('SELECT * FROM users WHERE username = ?', normalized);

    if (!row || !row.active) {
      this.registerFailure(key);
      this.audit.log({
        actor: { id: null, name: `anonymous:${normalized}` },
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'user',
        entityId: row?.id ?? null,
        after: { reason: row ? 'inactive' : 'unknown_user' },
        ...context,
      });
      throw unauthorized('INVALID_CREDENTIALS', 'Invalid username or password.');
    }

    const valid = await this.passwords.verify(row.password_hash, password);
    if (!valid) {
      this.registerFailure(key);
      this.audit.log({
        actor: { id: null, name: `anonymous:${normalized}` },
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'user',
        entityId: row.id,
        after: { reason: 'invalid_password' },
        ...context,
      });
      throw unauthorized('INVALID_CREDENTIALS', 'Invalid username or password.');
    }

    this.attempts.delete(key);
    this.sessions.cleanupExpired();
    const timestamp = nowIso();
    this.db.run('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?', timestamp, timestamp, row.id);
    const token = this.sessions.create(row.id, context.ip ?? null, context.userAgent ?? null);
    const user = toAuthUser(row, this.authz.permissionsFor(row));
    this.audit.log({
      actor: { id: row.id, name: row.name },
      action: 'AUTH_LOGIN',
      entityType: 'user',
      entityId: row.id,
      after: { role: row.role },
      ...context,
    });
    return { token, user };
  }

  logout(token: string | null, user: AuthUser, context: RequestContext): void {
    if (token) this.sessions.destroy(token);
    this.audit.log({
      actor: { id: user.id, name: user.name },
      action: 'AUTH_LOGOUT',
      entityType: 'user',
      entityId: user.id,
      ...context,
    });
  }

  async changePassword(
    user: AuthUser,
    currentPassword: string,
    newPassword: string,
    sessionId: string | null,
    context: RequestContext,
  ): Promise<void> {
    const row = this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', user.id);
    if (!row || !row.active) throw unauthorized('SESSION_EXPIRED', 'Your account is no longer active.');
    const valid = await this.passwords.verify(row.password_hash, currentPassword);
    if (!valid) throw unauthorized('INVALID_CREDENTIALS', 'The current password is incorrect.');

    const hash = await this.passwords.hash(newPassword);
    const timestamp = nowIso();
    this.db.run(
      'UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?',
      hash,
      timestamp,
      user.id,
    );
    this.sessions.destroyForUser(user.id, sessionId ?? undefined);
    this.audit.log({
      actor: { id: user.id, name: user.name },
      action: 'PASSWORD_CHANGED',
      entityType: 'user',
      entityId: user.id,
      ...context,
    });
  }

  private registerFailure(key: string): void {
    const current = this.attempts.get(key) ?? { count: 0, lockedUntil: 0 };
    const count = current.count + 1;
    this.attempts.set(key, {
      count: count >= MAX_FAILURES ? 0 : count,
      lockedUntil: count >= MAX_FAILURES ? Date.now() + LOCK_MINUTES * 60_000 : 0,
    });
  }
}

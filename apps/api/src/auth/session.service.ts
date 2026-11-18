import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AuthUser, Role } from '@vams/shared';
import { APP_CONFIG, AppConfig } from '../config';
import { DatabaseService } from '../db/database.service';
import { nowIso } from '../common/time';

export interface ResolvedSession {
  id: string;
  user: Omit<AuthUser, 'permissions'>;
}

interface SessionRow {
  id: string;
  user_id: string;
  expires_at: string;
  last_seen_at: string;
  username: string;
  name: string;
  role: Role;
  email: string | null;
  must_change_password: number;
  active: number;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  create(userId: string, ip: string | null, userAgent: string | null): string {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.sessionAbsoluteHours * 3_600_000);
    this.db.run(
      `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      token,
      userId,
      now.toISOString(),
      expiresAt.toISOString(),
      now.toISOString(),
      ip,
      userAgent,
    );
    return token;
  }

  resolve(token: string, ip: string | null, userAgent: string | null): ResolvedSession | null {
    const row = this.db.get<SessionRow>(
      `SELECT s.id, s.user_id, s.expires_at, s.last_seen_at,
              u.username, u.name, u.role, u.email, u.must_change_password, u.active
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
      token,
    );
    if (!row || !row.active) return null;

    const now = Date.now();
    const idleDeadline = Date.parse(row.last_seen_at) + this.config.sessionIdleMinutes * 60_000;
    if (Date.parse(row.expires_at) <= now || idleDeadline <= now) {
      this.destroy(token);
      return null;
    }

    if (now - Date.parse(row.last_seen_at) > 60_000) {
      this.db.run(
        'UPDATE sessions SET last_seen_at = ?, ip = ?, user_agent = ? WHERE id = ?',
        new Date(now).toISOString(),
        ip,
        userAgent,
        token,
      );
    }

    return {
      id: row.id,
      user: {
        id: row.user_id,
        username: row.username,
        name: row.name,
        role: row.role,
        email: row.email,
        mustChangePassword: Boolean(row.must_change_password),
      },
    };
  }

  destroy(token: string): void {
    this.db.run('DELETE FROM sessions WHERE id = ?', token);
  }

  destroyForUser(userId: string, exceptSessionId?: string): void {
    if (exceptSessionId) {
      this.db.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', userId, exceptSessionId);
    } else {
      this.db.run('DELETE FROM sessions WHERE user_id = ?', userId);
    }
  }

  cleanupExpired(): void {
    this.db.run(
      'DELETE FROM sessions WHERE expires_at <= ? OR last_seen_at <= ?',
      nowIso(),
      new Date(Date.now() - this.config.sessionIdleMinutes * 60_000).toISOString(),
    );
  }
}

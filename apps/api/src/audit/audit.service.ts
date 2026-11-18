import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AuditEntry, AuditQuery, AuditVerification, Paginated } from '@vams/shared';
import { DatabaseService } from '../db/database.service';
import { nowIso } from '../common/time';

export interface AuditActor {
  id: string | null;
  name: string;
}

export interface AuditLogInput {
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

interface AuditRow {
  seq: number;
  id: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_json: string | null;
  after_json: string | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  created_at: string;
  prev_hash: string;
  hash: string;
}

const DELIMITER = '\u241f';

function stableJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

@Injectable()
export class AuditService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  log(input: AuditLogInput): void {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    const beforeJson = stableJson(input.before);
    const afterJson = stableJson(input.after);
    const previous = this.db.get<{ hash: string }>('SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1');
    const prevHash = previous?.hash ?? 'GENESIS';
    const hash = this.hashRow({
      prevHash,
      id,
      actorId: input.actor.id,
      actorName: input.actor.name,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeJson,
      afterJson,
      createdAt,
    });
    this.db.run(
      `INSERT INTO audit_log
       (id, actor_id, actor_name, action, entity_type, entity_id, before_json, after_json, ip, user_agent, request_id, created_at, prev_hash, hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.actor.id,
      input.actor.name,
      input.action,
      input.entityType,
      input.entityId ?? null,
      beforeJson,
      afterJson,
      input.ip ?? null,
      input.userAgent ?? null,
      input.requestId ?? null,
      createdAt,
      prevHash,
      hash,
    );
  }

  list(query: AuditQuery): Paginated<AuditEntry> {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (query.actor) {
      where.push('(lower(actor_name) LIKE ?)');
      params.push(`%${query.actor.toLowerCase()}%`);
    }
    if (query.action) {
      where.push('action = ?');
      params.push(query.action);
    }
    if (query.entityType) {
      where.push('entity_type = ?');
      params.push(query.entityType);
    }
    if (query.entityId) {
      where.push('entity_id = ?');
      params.push(query.entityId);
    }
    if (query.from) {
      where.push("date(created_at, '+5 hours', '+30 minutes') >= ?");
      params.push(query.from);
    }
    if (query.to) {
      where.push("date(created_at, '+5 hours', '+30 minutes') <= ?");
      params.push(query.to);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRow = this.db.get<{ total: number }>(`SELECT COUNT(*) AS total FROM audit_log ${clause}`, ...params);
    const total = Number(totalRow?.total ?? 0);
    const offset = (query.page - 1) * query.pageSize;
    const rows = this.db.all<AuditRow>(
      `SELECT * FROM audit_log ${clause} ORDER BY seq DESC LIMIT ? OFFSET ?`,
      ...params,
      query.pageSize,
      offset,
    );
    return {
      items: rows.map((row) => this.toEntry(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  forEntity(entityType: string, entityId: string, limit = 50): AuditEntry[] {
    const rows = this.db.all<AuditRow>(
      'SELECT * FROM audit_log WHERE entity_type = ? AND entity_id = ? ORDER BY seq DESC LIMIT ?',
      entityType,
      entityId,
      limit,
    );
    return rows.map((row) => this.toEntry(row));
  }

  verify(): AuditVerification {
    const rows = this.db.all<AuditRow>('SELECT * FROM audit_log ORDER BY seq ASC');
    let prevHash = 'GENESIS';
    let checked = 0;
    for (const row of rows) {
      const expected = this.hashRow({
        prevHash,
        id: row.id,
        actorId: row.actor_id,
        actorName: row.actor_name,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        beforeJson: row.before_json,
        afterJson: row.after_json,
        createdAt: row.created_at,
      });
      if (row.prev_hash !== prevHash || row.hash !== expected) {
        return {
          valid: false,
          checked,
          brokenAtSeq: row.seq,
          message: 'Audit chain verification failed. The log may have been tampered with.',
        };
      }
      prevHash = row.hash;
      checked += 1;
    }
    return {
      valid: true,
      checked,
      brokenAtSeq: null,
      message: `Audit chain verified across ${checked} entries.`,
    };
  }

  private toEntry(row: AuditRow): AuditEntry {
    return {
      seq: row.seq,
      id: row.id,
      actorName: row.actor_name,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      before: parseJson(row.before_json),
      after: parseJson(row.after_json),
      ip: row.ip,
      createdAt: row.created_at,
    };
  }

  private hashRow(input: {
    prevHash: string;
    id: string;
    actorId: string | null;
    actorName: string;
    action: string;
    entityType: string;
    entityId: string | null;
    beforeJson: string | null;
    afterJson: string | null;
    createdAt: string;
  }): string {
    return createHash('sha256')
      .update(
        [
          input.prevHash,
          input.id,
          input.actorId ?? '',
          input.actorName,
          input.action,
          input.entityType,
          input.entityId ?? '',
          input.beforeJson ?? '',
          input.afterJson ?? '',
          input.createdAt,
        ].join(DELIMITER),
      )
      .digest('hex');
  }
}

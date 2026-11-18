import { Inject, Injectable } from '@nestjs/common';
import type { NotificationChannel, TemplateRecord } from '@vams/shared';
import { defaultTemplateFor } from '@vams/shared';
import { DatabaseService } from '../db/database.service';
import { AuditService } from '../audit/audit.service';
import { nowIso } from '../common/time';
import type { RequestContext } from '../common/decorators';
import type { AuthUser } from '@vams/shared';

interface TemplateRow {
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  version: number;
  updated_at: string;
  updated_by_name: string | null;
}

@Injectable()
export class TemplatesService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  get(channel: NotificationChannel): TemplateRecord {
    const row = this.db.get<TemplateRow>(
      `SELECT t.channel, t.subject, t.body, t.version, t.updated_at, u.name AS updated_by_name
       FROM notification_templates t
       LEFT JOIN users u ON u.id = t.updated_by
       WHERE t.channel = ? AND t.active = 1`,
      channel,
    );
    if (row) {
      return {
        channel: row.channel,
        subject: row.subject,
        body: row.body,
        version: row.version,
        updatedAt: row.updated_at,
        updatedByName: row.updated_by_name,
      };
    }
    const fallback = defaultTemplateFor(channel);
    return {
      channel,
      subject: fallback.subject,
      body: fallback.body,
      version: 0,
      updatedAt: nowIso(),
      updatedByName: null,
    };
  }

  update(
    channel: NotificationChannel,
    input: { subject?: string; body: string },
    actor: AuthUser,
    context: RequestContext,
  ): TemplateRecord {
    const before = this.get(channel);
    const timestamp = nowIso();
    this.db.run(
      `INSERT INTO notification_templates (id, channel, subject, body, version, active, updated_by, updated_at)
       VALUES (?, ?, ?, ?, 1, 1, ?, ?)
       ON CONFLICT(channel) DO UPDATE SET
         subject = excluded.subject,
         body = excluded.body,
         version = notification_templates.version + 1,
         active = 1,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
      crypto.randomUUID(),
      channel,
      input.subject ?? null,
      input.body,
      actor.id,
      timestamp,
    );
    this.audit.log({
      actor: { id: actor.id, name: actor.name },
      action: 'TEMPLATE_UPDATED',
      entityType: 'notification_template',
      entityId: channel,
      before: { version: before.version, subject: before.subject },
      after: { version: before.version + 1, subject: input.subject ?? null },
      ...context,
    });
    return this.get(channel);
  }
}

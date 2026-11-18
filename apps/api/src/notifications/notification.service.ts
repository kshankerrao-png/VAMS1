import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  DEPARTMENT_NAME,
  NotificationChannel,
  NotificationRecord,
  NotificationStatus,
  renderTemplate,
  RequestStatus,
} from '@vams/shared';
import type { AuthUser } from '@vams/shared';
import { APP_CONFIG, AppConfig } from '../config';
import { DatabaseService } from '../db/database.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.module';
import {
  formatDateIndian,
  formatTimeIndian,
  nowIso,
} from '../common/time';
import type { RequestContext } from '../common/decorators';
import { badRequest, forbidden, notFound } from '../common/errors';
import { EmailAdapter } from './email.adapter';
import { TemplatesService } from './templates.service';
import { WhatsappAdapter } from './whatsapp.adapter';

interface NotificationRow {
  id: string;
  request_id: string;
  channel: NotificationChannel;
  recipient: string;
  status: NotificationStatus;
  attempt: number;
  max_attempts: number;
  next_attempt_at: string | null;
  provider_message_id: string | null;
  error_message: string | null;
  template_version: number | null;
  rendered_subject: string | null;
  rendered_body: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  delivered_at: string | null;
}

interface ContextRow {
  id: string;
  reference: string;
  purpose: string;
  accompanying_count: number;
  assigned_date: string | null;
  assigned_time: string | null;
  status: RequestStatus;
  name: string;
  designation: string | null;
  organization: string | null;
  email: string;
  mobile: string;
}

const SYSTEM = { id: null, name: 'System (notification worker)' };
const WORKER_SOURCE = { ip: null, userAgent: 'notification-worker', requestId: null };

@Injectable()
export class NotificationService {
  private readonly logger = new Logger('Notifications');

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(TemplatesService) private readonly templates: TemplatesService,
    @Inject(EmailAdapter) private readonly email: EmailAdapter,
    @Inject(WhatsappAdapter) private readonly whatsapp: WhatsappAdapter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async queueForApproval(
    requestId: string,
    visitor: { email: string; mobile: string },
    actor: AuthUser,
    context: RequestContext,
  ): Promise<void> {
    const timestamp = nowIso();
    const recipients: Array<{ channel: NotificationChannel; recipient: string }> = [
      { channel: 'EMAIL', recipient: visitor.email },
      { channel: 'WHATSAPP', recipient: visitor.mobile },
    ];
    for (const entry of recipients) {
      const id = randomUUID();
      if (!entry.recipient) {
        await this.db.run(
          `INSERT INTO notifications
           (id, request_id, channel, recipient, status, attempt, max_attempts, next_attempt_at, error_message, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'SKIPPED', 0, 3, NULL, ?, ?, ?)`,
          id,
          requestId,
          entry.channel,
          '',
          `No ${entry.channel === 'EMAIL' ? 'email address' : 'mobile number'} on file`,
          timestamp,
          timestamp,
        );
        await this.audit.log({
          actor: { id: actor.id, name: actor.name },
          action: 'NOTIFICATION_SKIPPED',
          entityType: 'notification',
          entityId: id,
          after: { requestId, channel: entry.channel, reason: 'missing_contact' },
          ...context,
        });
        continue;
      }
      await this.db.run(
        `INSERT INTO notifications
         (id, request_id, channel, recipient, status, attempt, max_attempts, next_attempt_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'QUEUED', 0, 3, ?, ?, ?)`,
        id,
        requestId,
        entry.channel,
        entry.recipient,
        timestamp,
        timestamp,
        timestamp,
      );
      await this.audit.log({
        actor: { id: actor.id, name: actor.name },
        action: 'NOTIFICATION_QUEUED',
        entityType: 'notification',
        entityId: id,
        after: { requestId, channel: entry.channel },
        ...context,
      });
    }
  }

  async processDue(limit = 20): Promise<number> {
    const rows = await this.db.all<NotificationRow>(
      `SELECT * FROM notifications
       WHERE status = 'QUEUED' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
       ORDER BY created_at ASC
       LIMIT ?`,
      nowIso(),
      limit,
    );
    for (const row of rows) {
      await this.sendOne(row);
    }
    return rows.length;
  }

  async listByRequest(requestId: string): Promise<NotificationRecord[]> {
    const rows = await this.db.all<NotificationRow>(
      'SELECT * FROM notifications WHERE request_id = ? ORDER BY created_at ASC',
      requestId,
    );
    return rows.map((row) => this.toRecord(row));
  }

  async resend(id: string, actor: AuthUser, context: RequestContext): Promise<NotificationRecord> {
    const row = await this.db.get<NotificationRow>('SELECT * FROM notifications WHERE id = ?', id);
    if (!row) throw notFound('Notification', 'NOTIFICATION_NOT_FOUND');
    if (!row.recipient) throw badRequest('NO_RECIPIENT', 'No recipient on file', 'Update the visitor contact details and try again.');
    const timestamp = nowIso();
    await this.db.run(
      `UPDATE notifications
       SET status = 'QUEUED', attempt = 0, next_attempt_at = ?, error_message = NULL, updated_at = ?,
           sent_at = NULL, delivered_at = NULL, provider_message_id = NULL
       WHERE id = ?`,
      timestamp,
      timestamp,
      id,
    );
    await this.audit.log({
      actor: { id: actor.id, name: actor.name },
      action: 'NOTIFICATION_RESENT',
      entityType: 'notification',
      entityId: id,
      after: { requestId: row.request_id, channel: row.channel },
      ...context,
    });
    return this.toRecord((await this.db.get<NotificationRow>('SELECT * FROM notifications WHERE id = ?', id))!);
  }

  async simulateDelivery(id: string, actor: AuthUser, context: RequestContext): Promise<NotificationRecord> {
    if (!this.config.allowSimulation) {
      throw forbidden('Delivery simulation is disabled.');
    }
    const row = await this.db.get<NotificationRow>('SELECT * FROM notifications WHERE id = ?', id);
    if (!row) throw notFound('Notification', 'NOTIFICATION_NOT_FOUND');
    const timestamp = nowIso();
    await this.db.run(
      `UPDATE notifications
       SET status = 'DELIVERED', delivered_at = ?, sent_at = coalesce(sent_at, ?), updated_at = ?,
           provider_message_id = coalesce(provider_message_id, ?), error_message = NULL
       WHERE id = ?`,
      timestamp,
      timestamp,
      timestamp,
      `simulated-${row.id}`,
      id,
    );
    await this.audit.log({
      actor: { id: actor.id, name: actor.name },
      action: 'NOTIFICATION_DELIVERED',
      entityType: 'notification',
      entityId: id,
      after: { requestId: row.request_id, channel: row.channel, simulated: true },
      ...context,
    });
    return this.toRecord((await this.db.get<NotificationRow>('SELECT * FROM notifications WHERE id = ?', id))!);
  }

  async markByProviderMessageId(
    providerMessageId: string,
    status: NotificationStatus,
    errorMessage?: string,
  ): Promise<NotificationRecord | null> {
    const row = await this.db.get<NotificationRow>(
      'SELECT * FROM notifications WHERE provider_message_id = ?',
      providerMessageId,
    );
    if (!row) return null;
    const timestamp = nowIso();
    if (status === 'DELIVERED') {
      await this.db.run(
        `UPDATE notifications
         SET status = 'DELIVERED', delivered_at = coalesce(delivered_at, ?), sent_at = coalesce(sent_at, ?), updated_at = ?
         WHERE id = ?`,
        timestamp,
        timestamp,
        timestamp,
        row.id,
      );
      await this.audit.log({
        actor: SYSTEM,
        action: 'NOTIFICATION_DELIVERED',
        entityType: 'notification',
        entityId: row.id,
        after: { requestId: row.request_id, channel: row.channel, source: 'provider_webhook' },
        ...WORKER_SOURCE,
      });
    } else if (status === 'FAILED') {
      await this.db.run(
        `UPDATE notifications SET status = 'FAILED', error_message = ?, updated_at = ? WHERE id = ?`,
        errorMessage ?? 'Provider reported failure',
        timestamp,
        row.id,
      );
      await this.audit.log({
        actor: SYSTEM,
        action: 'NOTIFICATION_FAILED',
        entityType: 'notification',
        entityId: row.id,
        after: { requestId: row.request_id, channel: row.channel, source: 'provider_webhook' },
        ...WORKER_SOURCE,
      });
    } else if (status === 'SENT' && row.status !== 'DELIVERED') {
      await this.db.run(
        `UPDATE notifications SET status = 'SENT', sent_at = coalesce(sent_at, ?), updated_at = ? WHERE id = ?`,
        timestamp,
        timestamp,
        row.id,
      );
      await this.audit.log({
        actor: SYSTEM,
        action: 'NOTIFICATION_SENT',
        entityType: 'notification',
        entityId: row.id,
        after: { requestId: row.request_id, channel: row.channel, source: 'provider_webhook' },
        ...WORKER_SOURCE,
      });
    }
    return this.toRecord((await this.db.get<NotificationRow>('SELECT * FROM notifications WHERE id = ?', row.id))!);
  }

  private async sendOne(row: NotificationRow): Promise<void> {
    const context = await this.db.get<ContextRow>(
      `SELECT r.id, r.reference, r.purpose, r.accompanying_count, r.assigned_date, r.assigned_time, r.status,
              v.name, v.designation, v.organization, v.email, v.mobile
       FROM appointment_requests r
       JOIN visitor_profiles v ON v.id = r.visitor_id
       WHERE r.id = ?`,
      row.request_id,
    );

    if (!context || !context.assigned_date || !context.assigned_time) {
      await this.db.run(
        `UPDATE notifications SET status = 'FAILED', error_message = ?, updated_at = ? WHERE id = ?`,
        'Appointment details are incomplete',
        nowIso(),
        row.id,
      );
      await this.audit.log({
        actor: SYSTEM,
        action: 'NOTIFICATION_FAILED',
        entityType: 'notification',
        entityId: row.id,
        after: { requestId: row.request_id, channel: row.channel, reason: 'incomplete_request' },
        ...WORKER_SOURCE,
      });
      return;
    }

    const template = await this.templates.get(row.channel);
    const settings = (await this.settings.get());
    const variables = {
      visitor_name: context.name,
      designation: context.designation ?? '',
      organization: context.organization ?? '',
      purpose: context.purpose,
      assigned_date: formatDateIndian(context.assigned_date),
      assigned_time: formatTimeIndian(context.assigned_time),
      reference: context.reference,
      venue: settings.venue,
      department: DEPARTMENT_NAME,
      accompanying: context.accompanying_count > 0 ? `Accompanying persons: ${context.accompanying_count}` : '',
      instructions: settings.instructions ?? '',
    };
    const body = renderTemplate(template.body, variables);
    const subject = template.subject ? renderTemplate(template.subject, variables) : undefined;
    const adapter = row.channel === 'EMAIL' ? this.email : this.whatsapp;

    try {
      const result = await adapter.send({
        to: row.recipient,
        subject,
        body,
        reference: context.reference,
        templateVariables:
          row.channel === 'WHATSAPP'
            ? { '1': variables.assigned_date, '2': variables.assigned_time }
            : undefined,
      });
      const timestamp = nowIso();
      const status: NotificationStatus = result.deliveredImmediately ? 'DELIVERED' : 'SENT';
      await this.db.run(
        `UPDATE notifications
         SET status = ?, attempt = attempt + 1, provider_message_id = ?, error_message = NULL,
             template_version = ?, rendered_subject = ?, rendered_body = ?, next_attempt_at = NULL,
             sent_at = ?, delivered_at = ?, updated_at = ?
         WHERE id = ?`,
        status,
        result.providerMessageId,
        template.version,
        subject ?? null,
        body,
        timestamp,
        result.deliveredImmediately ? timestamp : null,
        timestamp,
        row.id,
      );
      await this.audit.log({
        actor: SYSTEM,
        action: 'NOTIFICATION_SENT',
        entityType: 'notification',
        entityId: row.id,
        after: {
          requestId: row.request_id,
          channel: row.channel,
          provider: result.simulated ? 'simulated' : 'provider',
        },
        ...WORKER_SOURCE,
      });
      if (result.deliveredImmediately) {
        await this.audit.log({
          actor: SYSTEM,
          action: 'NOTIFICATION_DELIVERED',
          entityType: 'notification',
          entityId: row.id,
          after: { requestId: row.request_id, channel: row.channel, simulated: true },
          ...WORKER_SOURCE,
        });
      }
    } catch (error) {
      const attempt = row.attempt + 1;
      const message = error instanceof Error ? error.message : String(error);
      const final = attempt >= row.max_attempts;
      const delay = [30_000, 120_000, 600_000][Math.min(attempt - 1, 2)];
      await this.db.run(
        `UPDATE notifications
         SET status = ?, attempt = ?, error_message = ?, next_attempt_at = ?, updated_at = ?
         WHERE id = ?`,
        final ? 'FAILED' : 'QUEUED',
        attempt,
        message.slice(0, 500),
        final ? null : new Date(Date.now() + delay).toISOString(),
        nowIso(),
        row.id,
      );
      await this.audit.log({
        actor: SYSTEM,
        action: 'NOTIFICATION_FAILED',
        entityType: 'notification',
        entityId: row.id,
        after: { requestId: row.request_id, channel: row.channel, attempt, final },
        ...WORKER_SOURCE,
      });
      this.logger.warn(
        `Notification ${row.id} (${row.channel}) attempt ${attempt} failed; retry ${final ? 'exhausted' : 'scheduled'}.`,
      );
    }
  }

  private toRecord(row: NotificationRow): NotificationRecord {
    return {
      id: row.id,
      requestId: row.request_id,
      channel: row.channel,
      recipient: row.recipient,
      status: row.status,
      attempt: row.attempt,
      maxAttempts: row.max_attempts,
      nextAttemptAt: row.next_attempt_at,
      providerMessageId: row.provider_message_id,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sentAt: row.sent_at,
      deliveredAt: row.delivered_at,
    };
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  type AppointmentRequestDetail,
  type AuthUser,
  type DuplicateWarning,
  type IntakePayload,
  type Paginated,
  type RequestListRow,
  type RequestQuery,
  type RequestStatus,
  type SlotAvailability,
  normalizeMobile,
} from '@vams/shared';
import { DatabaseService, SqlValue } from '../db/database.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.module';
import { VisitorsService } from '../visitors/visitors.service';
import { NotificationService } from '../notifications/notification.service';
import { NotificationWorker } from '../notifications/notification.worker';
import {
  badRequest,
  conflict,
  notFound,
} from '../common/errors';
import type { RequestContext } from '../common/decorators';
import {
  currentIstTime,
  daysSince,
  istDateTimeToEpoch,
  istDay,
  nowIso,
} from '../common/time';

export interface ApproveInput {
  assignedDate: string;
  assignedTime: string;
  note?: string;
}

export interface RejectInput {
  reason?: string;
}

export interface RescheduleInput {
  assignedDate: string;
  assignedTime: string;
  reason?: string;
}

export interface MaterializeInput {
  timeIn?: string;
}

interface RequestRow {
  id: string;
  reference: string;
  visitor_id: string;
  purpose: string;
  accompanying_count: number;
  accompanying_names: string | null;
  documents_reference: string | null;
  remarks: string | null;
  request_date: string;
  request_day: string;
  entered_by: string;
  status: RequestStatus;
  assigned_date: string | null;
  assigned_time: string | null;
  decided_by: string | null;
  decision_at: string | null;
  decision_day: string | null;
  decision_note: string | null;
  rejection_reason: string | null;
  materialized_at: string | null;
  time_in: string | null;
  version: number;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  visitor_name: string;
  visitor_designation: string | null;
  visitor_organization: string | null;
  visitor_mobile: string;
  visitor_email: string;
  entered_by_name: string;
  decided_by_name: string | null;
  notif_total: number;
  notif_delivered: number;
  notif_failed: number;
  notif_pending: number;
  notif_skipped: number;
}

const BASE_SELECT = `
  SELECT r.*,
    v.name AS visitor_name, v.designation AS visitor_designation,
    v.organization AS visitor_organization, v.mobile AS visitor_mobile,
    v.email AS visitor_email,
    u.name AS entered_by_name, d.name AS decided_by_name,
    (SELECT COUNT(*) FROM notifications n WHERE n.request_id = r.id) AS notif_total,
    (SELECT COUNT(*) FROM notifications n WHERE n.request_id = r.id AND n.status = 'DELIVERED') AS notif_delivered,
    (SELECT COUNT(*) FROM notifications n WHERE n.request_id = r.id AND n.status = 'FAILED') AS notif_failed,
    (SELECT COUNT(*) FROM notifications n WHERE n.request_id = r.id AND n.status IN ('QUEUED', 'SENT')) AS notif_pending,
    (SELECT COUNT(*) FROM notifications n WHERE n.request_id = r.id AND n.status = 'SKIPPED') AS notif_skipped
  FROM appointment_requests r
  JOIN visitor_profiles v ON v.id = r.visitor_id
  JOIN users u ON u.id = r.entered_by
  LEFT JOIN users d ON d.id = r.decided_by
`;

const SORT_COLUMNS: Record<RequestQuery['sort'], string> = {
  requestDate: 'r.request_date',
  assignedDate: 'r.assigned_date',
  status: 'r.status',
  visitorName: 'v.name',
  decisionAt: 'r.decision_at',
};

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(VisitorsService) private readonly visitors: VisitorsService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(NotificationWorker) private readonly worker: NotificationWorker,
  ) {}

  async list(query: RequestQuery): Promise<Paginated<RequestListRow>> {
    const { clause, params } = this.filter(query);
    const totalRow = await this.db.get<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM appointment_requests r
       JOIN visitor_profiles v ON v.id = r.visitor_id
       JOIN users u ON u.id = r.entered_by
       ${clause}`,
      ...params,
    );
    const total = Number(totalRow?.total ?? 0);
    const offset = (query.page - 1) * query.pageSize;
    const direction = query.dir.toUpperCase();
    const column = SORT_COLUMNS[query.sort];
    const orderBy =
      query.sort === 'assignedDate'
        ? `CASE WHEN r.assigned_date IS NULL THEN 1 ELSE 0 END ASC, ${column} ${direction}, r.request_date DESC`
        : `${column} ${direction}, r.request_date DESC`;

    const rows = await this.db.all<RequestRow>(
      `${BASE_SELECT} ${clause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      ...params,
      query.pageSize,
      offset,
    );

    return {
      items: rows.map((row) => this.mapRow(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async exportCsv(
    query: RequestQuery,
    actor: AuthUser,
    context: RequestContext,
  ): Promise<{ filename: string; content: string }> {
    const { clause, params } = this.filter(query);
    const rows = await this.db.all<RequestRow>(
      `${BASE_SELECT} ${clause} ORDER BY r.request_date DESC LIMIT 10000`,
      ...params,
    );
    const header = [
      'Reference',
      'Status',
      'Visitor',
      'Designation',
      'Organization',
      'Mobile',
      'Email',
      'Purpose',
      'Requested On',
      'Appointment Date',
      'Appointment Time',
      'Entered By',
      'Decided By',
      'Decision At',
    ];
    const lines = [header.map(csvCell).join(',')];
    for (const row of rows) {
      lines.push(
        [
          row.reference,
          row.status,
          row.visitor_name,
          row.visitor_designation ?? '',
          row.visitor_organization ?? '',
          row.visitor_mobile,
          row.visitor_email,
          row.purpose,
          row.request_day,
          row.assigned_date ?? '',
          row.assigned_time ?? '',
          row.entered_by_name,
          row.decided_by_name ?? '',
          row.decision_at ?? '',
        ]
          .map(csvCell)
          .join(','),
      );
    }
    await this.audit.log({
      actor: { id: actor.id, name: actor.name },
      action: 'EXPORT_GENERATED',
      entityType: 'register',
      entityId: null,
      after: { rowCount: rows.length, format: 'csv', filters: Object.keys(query).filter((key) => (query as Record<string, unknown>)[key] !== undefined && (query as Record<string, unknown>)[key] !== '') },
      ...context,
    });
    return {
      filename: `vams-register-${istDay()}.csv`,
      content: lines.join('\r\n'),
    };
  }

  async stats() {
    const statusRows = await this.db.all<{ status: RequestStatus; count: number }>(
      'SELECT status, COUNT(*) AS count FROM appointment_requests GROUP BY status',
    );
    const byStatus: Record<RequestStatus, number> = {
      PENDING_APPROVAL: 0,
      APPROVED: 0,
      REJECTED: 0,
      MATERIALIZED: 0,
    };
    for (const row of statusRows) byStatus[row.status] = Number(row.count);
    const total = Object.values(byStatus).reduce((sum, value) => sum + value, 0);
    const today = istDay();
    const todayRow = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM appointment_requests
       WHERE assigned_date = ? AND status IN ('APPROVED', 'MATERIALIZED')`,
      today,
    );
    const oldest = await this.db.get<{ oldest: string | null }>(
      `SELECT MIN(request_date) AS oldest FROM appointment_requests WHERE status = 'PENDING_APPROVAL'`,
    );
    const failures = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM notifications WHERE status = 'FAILED'`,
    );
    const pending = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM notifications WHERE status IN ('QUEUED', 'SENT')`,
    );
    return {
      byStatus,
      totalRequests: total,
      todayAppointments: Number(todayRow?.count ?? 0),
      pendingOldestDays: oldest?.oldest ? daysSince(oldest.oldest) : 0,
      notificationFailures: Number(failures?.count ?? 0),
      notificationsPending: Number(pending?.count ?? 0),
    };
  }

  async duplicates(mobile?: string, email?: string): Promise<DuplicateWarning> {
    const normalizedMobile = mobile ? normalizeMobile(mobile) : '';
    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    if (!normalizedMobile && !normalizedEmail) {
      return { hasDuplicate: false, requests: [] };
    }
    const rows = await this.db.all<{
      id: string;
      reference: string;
      status: RequestStatus;
      request_date: string;
      assigned_date: string | null;
      assigned_time: string | null;
    }>(
      `SELECT r.id, r.reference, r.status, r.request_date, r.assigned_date, r.assigned_time
       FROM appointment_requests r
       JOIN visitor_profiles v ON v.id = r.visitor_id
       WHERE r.status IN ('PENDING_APPROVAL', 'APPROVED')
         AND ((? != '' AND v.mobile = ?) OR (? != '' AND v.email_normalized = ?))
       ORDER BY r.request_date DESC
       LIMIT 5`,
      normalizedMobile,
      normalizedMobile,
      normalizedEmail,
      normalizedEmail,
    );
    return {
      hasDuplicate: rows.length > 0,
      requests: rows.map((row) => ({
        id: row.id,
        reference: row.reference,
        status: row.status,
        requestDate: row.request_date,
        assignedDate: row.assigned_date,
        assignedTime: row.assigned_time,
      })),
    };
  }

  async detail(id: string): Promise<AppointmentRequestDetail> {
    const row = await this.findRow(id);
    if (!row) throw notFound('Request', 'REQUEST_NOT_FOUND');
    const visitor = await this.visitors.profile(row.visitor_id);
    if (!visitor) throw notFound('Visitor', 'VISITOR_NOT_FOUND');
    return {
      ...this.mapRow(row),
      visitor,
      accompanyingCount: Number(row.accompanying_count),
      accompanyingNames: row.accompanying_names,
      documentsReference: row.documents_reference,
      remarks: row.remarks,
      rejectionReason: row.rejection_reason,
      decisionNote: row.decision_note,
      materializedAt: row.materialized_at,
      timeIn: row.time_in,
      updatedAt: row.updated_at,
      notifications: await this.notifications.listByRequest(id),
      history: await this.visitors.history(row.visitor_id),
      audits: await this.audit.forEntity('appointment_request', id),
      slotAvailability: await this.slotAvailability(row.assigned_date, row.assigned_time, row.id),
    };
  }

  async create(
    payload: IntakePayload,
    actor: AuthUser,
    context: RequestContext,
  ): Promise<AppointmentRequestDetail> {
    const timestamp = nowIso();
    const day = istDay();
    const id = randomUUID();
    const reference = await this.nextReference(day);

    await this.db.transaction(async () => {
      const visitorId = await this.resolveVisitor(payload, timestamp);
      await this.db.run(
        `INSERT INTO appointment_requests
         (id, reference, visitor_id, purpose, accompanying_count, accompanying_names, documents_reference, remarks,
          request_date, request_day, entered_by, status, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL', 1, ?, ?)`,
        id,
        reference,
        visitorId,
        payload.purpose,
        payload.accompanyingCount ?? 0,
        payload.accompanyingNames ?? null,
        payload.documentsReference ?? null,
        payload.remarks ?? null,
        timestamp,
        day,
        actor.id,
        timestamp,
        timestamp,
      );
      await this.audit.log({
        actor: { id: actor.id, name: actor.name },
        action: 'REQUEST_CREATED',
        entityType: 'appointment_request',
        entityId: id,
        after: { reference, status: 'PENDING_APPROVAL', visitorId },
        ...context,
      });
    });

    return await this.detail(id);
  }

  async approve(
    id: string,
    input: ApproveInput,
    actor: AuthUser,
    context: RequestContext,
    idempotencyKey?: string,
    options?: { allowPast?: boolean },
  ): Promise<AppointmentRequestDetail> {
    const scope = `request:${id}:approve`;
    if (idempotencyKey) {
      const existing = await this.db.get<{ scope: string; response_json: string }>(
        'SELECT scope, response_json FROM idempotency_keys WHERE key = ?',
        idempotencyKey,
      );
      if (existing) {
        if (existing.scope !== scope) {
          throw conflict('IDEMPOTENCY_CONFLICT', 'This idempotency key was used for another operation.');
        }
        return await this.detail(id);
      }
    }

    const slotEpoch = istDateTimeToEpoch(input.assignedDate, input.assignedTime);
    if (!options?.allowPast && (!Number.isFinite(slotEpoch) || slotEpoch <= Date.now())) {
      throw badRequest('SLOT_IN_PAST', 'Choose a future date and time', 'Appointment slots must be in the future.');
    }

    const result = await this.db.transaction(async () => {
      const row = await this.findRow(id);
      if (!row) throw notFound('Request', 'REQUEST_NOT_FOUND');
      if (row.status !== 'PENDING_APPROVAL') {
        throw conflict('ILLEGAL_TRANSITION', 'This request has already been decided.');
      }

      const capacity = (await this.settings.get()).maxPerSlot;
      if (capacity !== null) {
        const booked = await this.bookedCount(input.assignedDate, input.assignedTime, id);
        if (booked >= capacity) {
          throw conflict('SLOT_FULL', 'That slot is already full', 'Choose another time or date.');
        }
      }

      const timestamp = nowIso();
      const updated = await this.db.run(
        `UPDATE appointment_requests
         SET status = 'APPROVED', assigned_date = ?, assigned_time = ?, decided_by = ?, decision_at = ?,
             decision_day = ?, decision_note = ?, version = version + 1, idempotency_key = ?, updated_at = ?
         WHERE id = ? AND status = 'PENDING_APPROVAL'`,
        input.assignedDate,
        input.assignedTime,
        actor.id,
        timestamp,
        istDay(),
        input.note ?? null,
        idempotencyKey ?? null,
        timestamp,
        id,
      );
      if (updated.changes === 0) {
        throw conflict('ILLEGAL_TRANSITION', 'This request has already been decided.');
      }

      await this.notifications.queueForApproval(
        id,
        { email: row.visitor_email, mobile: row.visitor_mobile },
        actor,
        context,
      );

      await this.audit.log({
        actor: { id: actor.id, name: actor.name },
        action: 'REQUEST_APPROVED',
        entityType: 'appointment_request',
        entityId: id,
        before: { status: row.status },
        after: {
          status: 'APPROVED',
          assignedDate: input.assignedDate,
          assignedTime: input.assignedTime,
        },
        ...context,
      });

      const detail = await this.detail(id);
      if (idempotencyKey) {
        await this.db.run(
          'INSERT INTO idempotency_keys (key, scope, response_json, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO NOTHING',
          idempotencyKey,
          scope,
          JSON.stringify(detail),
          timestamp,
        );
      }
      return detail;
    });

    if (this.worker.enabled) {
      this.worker.kick();
      return result;
    }

    try {
      await this.worker.drainAll(4);
    } catch (error) {
      this.logger.error(
        `Inline notification dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return await this.detail(id);
  }

  async reject(
    id: string,
    input: RejectInput,
    actor: AuthUser,
    context: RequestContext,
  ): Promise<AppointmentRequestDetail> {
    const timestamp = nowIso();
    await this.db.transaction(async () => {
      const row = await this.findRow(id);
      if (!row) throw notFound('Request', 'REQUEST_NOT_FOUND');
      if (row.status !== 'PENDING_APPROVAL') {
        throw conflict('ILLEGAL_TRANSITION', 'This request has already been decided.');
      }
      await this.db.run(
        `UPDATE appointment_requests
         SET status = 'REJECTED', decided_by = ?, decision_at = ?, decision_day = ?,
             rejection_reason = ?, version = version + 1, updated_at = ?
         WHERE id = ? AND status = 'PENDING_APPROVAL'`,
        actor.id,
        timestamp,
        istDay(),
        input.reason ?? null,
        timestamp,
        id,
      );
      await this.audit.log({
        actor: { id: actor.id, name: actor.name },
        action: 'REQUEST_REJECTED',
        entityType: 'appointment_request',
        entityId: id,
        before: { status: row.status },
        after: { status: 'REJECTED', reason: input.reason ?? null },
        ...context,
      });
    });
    return await this.detail(id);
  }

  async reschedule(
    id: string,
    input: RescheduleInput,
    actor: AuthUser,
    context: RequestContext,
  ): Promise<AppointmentRequestDetail> {
    const slotEpoch = istDateTimeToEpoch(input.assignedDate, input.assignedTime);
    if (!Number.isFinite(slotEpoch) || slotEpoch <= Date.now()) {
      throw badRequest('SLOT_IN_PAST', 'Choose a future date and time', 'Appointment slots must be in the future.');
    }
    const timestamp = nowIso();
    await this.db.transaction(async () => {
      const row = await this.findRow(id);
      if (!row) throw notFound('Request', 'REQUEST_NOT_FOUND');
      if (row.status !== 'APPROVED') {
        throw conflict('ILLEGAL_TRANSITION', 'Only approved appointments can be rescheduled.');
      }
      const capacity = (await this.settings.get()).maxPerSlot;
      if (capacity !== null) {
        const booked = await this.bookedCount(input.assignedDate, input.assignedTime, id);
        if (booked >= capacity) {
          throw conflict('SLOT_FULL', 'That slot is already full', 'Choose another time or date.');
        }
      }
      await this.db.run(
        `UPDATE appointment_requests
         SET assigned_date = ?, assigned_time = ?, decision_note = ?, version = version + 1, updated_at = ?
         WHERE id = ?`,
        input.assignedDate,
        input.assignedTime,
        input.reason ?? row.decision_note,
        timestamp,
        id,
      );
      await this.audit.log({
        actor: { id: actor.id, name: actor.name },
        action: 'REQUEST_RESCHEDULED',
        entityType: 'appointment_request',
        entityId: id,
        before: { assignedDate: row.assigned_date, assignedTime: row.assigned_time },
        after: {
          assignedDate: input.assignedDate,
          assignedTime: input.assignedTime,
          reason: input.reason ?? null,
        },
        ...context,
      });
    });
    return await this.detail(id);
  }

  async materialize(
    id: string,
    input: MaterializeInput,
    actor: AuthUser,
    context: RequestContext,
  ): Promise<AppointmentRequestDetail> {
    const timestamp = nowIso();
    await this.db.transaction(async () => {
      const row = await this.findRow(id);
      if (!row) throw notFound('Request', 'REQUEST_NOT_FOUND');
      if (row.status !== 'APPROVED' || !row.assigned_date || !row.assigned_time) {
        throw conflict('ILLEGAL_TRANSITION', 'Only approved appointments can be marked as materialized.');
      }
      if (istDateTimeToEpoch(row.assigned_date, row.assigned_time) > Date.now()) {
        throw conflict('SLOT_NOT_REACHED', 'The appointment slot has not arrived yet.');
      }
      await this.db.run(
        `UPDATE appointment_requests
         SET status = 'MATERIALIZED', materialized_at = ?, time_in = ?, version = version + 1, updated_at = ?
         WHERE id = ? AND status = 'APPROVED'`,
        timestamp,
        input.timeIn ?? currentIstTime(),
        timestamp,
        id,
      );
      await this.audit.log({
        actor: { id: actor.id, name: actor.name },
        action: 'REQUEST_MATERIALIZED',
        entityType: 'appointment_request',
        entityId: id,
        before: { status: row.status, assignedDate: row.assigned_date, assignedTime: row.assigned_time },
        after: { status: 'MATERIALIZED', timeIn: input.timeIn ?? currentIstTime() },
        ...context,
      });
    });
    return await this.detail(id);
  }

  async slotCheck(id: string, date: string, time: string): Promise<SlotAvailability> {
    const row = await this.findRow(id);
    if (!row) throw notFound('Request', 'REQUEST_NOT_FOUND');
    return await this.slotAvailability(date, time, id);
  }

  private async resolveVisitor(payload: IntakePayload, timestamp: string): Promise<string> {
    let existing: { id: string } | undefined;
    if (payload.visitorId) {
      existing = await this.db.get<{ id: string }>(
        'SELECT id FROM visitor_profiles WHERE id = ?',
        payload.visitorId,
      );
      if (!existing) throw notFound('Visitor', 'VISITOR_NOT_FOUND');
    } else {
      existing = await this.db.get<{ id: string }>(
        'SELECT id FROM visitor_profiles WHERE mobile = ? OR email_normalized = ? ORDER BY updated_at DESC LIMIT 1',
        payload.mobile,
        payload.email,
      );
    }

    const values: SqlValue[] = [
      payload.visitorName,
      payload.visitorName.trim().replace(/\s+/g, ' ').toLowerCase(),
      payload.designation ?? null,
      payload.organization ?? null,
      payload.address ?? null,
      payload.mobile,
      payload.email,
      payload.email,
      timestamp,
    ];

    if (existing) {
      await this.db.run(
        `UPDATE visitor_profiles
         SET name = ?, name_normalized = ?, designation = ?, organization = ?, address = ?,
             mobile = ?, email = ?, email_normalized = ?, updated_at = ?
         WHERE id = ?`,
        ...values,
        existing.id,
      );
      return existing.id;
    }

    const id = randomUUID();
    await this.db.run(
      `INSERT INTO visitor_profiles
       (id, name, name_normalized, designation, organization, address, mobile, email, email_normalized, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      ...(values.slice(0, 8) as SqlValue[]),
      timestamp,
      timestamp,
    );
    return id;
  }

  private async nextReference(day: string): Promise<string> {
    const year = day.slice(0, 4);
    const sequence = await this.db.nextCounter(`request_ref_${year}`);
    return `VAMS-${year}-${String(sequence).padStart(5, '0')}`;
  }

  private async findRow(id: string): Promise<RequestRow | undefined> {
    return await this.db.get<RequestRow>(`${BASE_SELECT} WHERE r.id = ?`, id);
  }

  private async bookedCount(date: string, time: string, excludeId: string): Promise<number> {
    const row = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM appointment_requests
       WHERE assigned_date = ? AND assigned_time = ?
         AND status IN ('APPROVED', 'MATERIALIZED') AND id != ?`,
      date,
      time,
      excludeId,
    );
    return Number(row?.count ?? 0);
  }

  private async slotAvailability(
    date: string | null,
    time: string | null,
    excludeId: string,
  ): Promise<SlotAvailability> {
    const capacity = (await this.settings.get()).maxPerSlot;
    if (!date || !time) {
      return { booked: 0, capacity, available: true };
    }
    const booked = await this.bookedCount(date, time, excludeId);
    return { booked, capacity, available: capacity === null || booked < capacity };
  }

  private filter(query: RequestQuery): { clause: string; params: SqlValue[] } {
    const where: string[] = [];
    const params: SqlValue[] = [];
    const like = (value: string) => `%${value.trim().toLowerCase()}%`;

    if (query.q) {
      const pattern = like(query.q);
      const digits = query.q.replace(/\D/g, '');
      const mobilePattern = digits.length >= 3 ? `%${digits}%` : '\u0000';
      where.push(
        `(lower(v.name) LIKE ? OR lower(coalesce(v.organization, '')) LIKE ?
          OR lower(coalesce(v.designation, '')) LIKE ? OR lower(r.purpose) LIKE ?
          OR lower(coalesce(r.remarks, '')) LIKE ? OR lower(r.reference) LIKE ?
          OR v.mobile LIKE ? OR v.email_normalized LIKE ?)`,
      );
      params.push(pattern, pattern, pattern, pattern, pattern, pattern, mobilePattern, pattern);
    }
    if (query.name) {
      where.push('lower(v.name) LIKE ?');
      params.push(like(query.name));
    }
    if (query.designation) {
      where.push("lower(coalesce(v.designation, '')) LIKE ?");
      params.push(like(query.designation));
    }
    if (query.organization) {
      where.push("lower(coalesce(v.organization, '')) LIKE ?");
      params.push(like(query.organization));
    }
    if (query.mobile) {
      const digits = query.mobile.replace(/\D/g, '');
      where.push('v.mobile LIKE ?');
      params.push(digits.length >= 3 ? `%${digits}%` : like(query.mobile));
    }
    if (query.email) {
      where.push('v.email_normalized LIKE ?');
      params.push(like(query.email));
    }
    if (query.status) {
      const statuses = query.status
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (statuses.length > 0) {
        for (const status of statuses) {
          if (!(status in { PENDING_APPROVAL: 1, APPROVED: 1, REJECTED: 1, MATERIALIZED: 1 })) {
            throw badRequest('INVALID_STATUS', 'Unknown status filter', `"${status}" is not a valid status.`);
          }
        }
        where.push(`r.status IN (${statuses.map(() => '?').join(', ')})`);
        params.push(...statuses);
      }
    }
    if (query.notificationStatus) {
      where.push(
        'EXISTS (SELECT 1 FROM notifications n WHERE n.request_id = r.id AND n.status = ?)',
      );
      params.push(query.notificationStatus);
    }
    if (query.from) {
      where.push('r.request_day >= ?');
      params.push(query.from);
    }
    if (query.to) {
      where.push('r.request_day <= ?');
      params.push(query.to);
    }
    if (query.assignedFrom) {
      where.push('r.assigned_date >= ?');
      params.push(query.assignedFrom);
    }
    if (query.assignedTo) {
      where.push('r.assigned_date <= ?');
      params.push(query.assignedTo);
    }
    if (query.decidedFrom) {
      where.push('r.decision_day >= ?');
      params.push(query.decidedFrom);
    }
    if (query.decidedTo) {
      where.push('r.decision_day <= ?');
      params.push(query.decidedTo);
    }
    if (query.enteredBy) {
      const pattern = like(query.enteredBy);
      where.push('(lower(u.name) LIKE ? OR lower(u.username) LIKE ?)');
      params.push(pattern, pattern);
    }

    return {
      clause: where.length ? `WHERE ${where.join(' AND ')}` : '',
      params,
    };
  }

  private mapRow(row: RequestRow): RequestListRow {
    return {
      id: row.id,
      reference: row.reference,
      status: row.status,
      purpose: row.purpose,
      visitorId: row.visitor_id,
      visitorName: row.visitor_name,
      visitorDesignation: row.visitor_designation,
      visitorOrganization: row.visitor_organization,
      visitorMobile: row.visitor_mobile,
      visitorEmail: row.visitor_email,
      requestDate: row.request_date,
      requestDay: row.request_day,
      enteredById: row.entered_by,
      enteredByName: row.entered_by_name,
      decidedByName: row.decided_by_name,
      decisionAt: row.decision_at,
      assignedDate: row.assigned_date,
      assignedTime: row.assigned_time,
      createdAt: row.created_at,
      notificationSummary: {
        total: Number(row.notif_total ?? 0),
        delivered: Number(row.notif_delivered ?? 0),
        failed: Number(row.notif_failed ?? 0),
        pending: Number(row.notif_pending ?? 0),
        skipped: Number(row.notif_skipped ?? 0),
      },
    };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type {
  ReportSummary,
  RequestStatus,
  ScheduleAppointment,
  ScheduleResponse,
} from '@vams/shared';
import { DatabaseService } from '../db/database.service';
import { SettingsService } from '../settings/settings.module';
import {
  addDays,
  dayRange,
  istDay,
  isValidDay,
  monthStart,
} from '../common/time';
import { badRequest } from '../common/errors';

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  summary(fromInput?: string, toInput?: string): ReportSummary {
    const to = toInput ?? istDay();
    const from = fromInput ?? addDays(to, -29);
    if (!isValidDay(from) || !isValidDay(to)) {
      throw badRequest('INVALID_DATE_RANGE', 'Invalid date range', 'Use YYYY-MM-DD dates.');
    }
    if (from > to) {
      throw badRequest('INVALID_DATE_RANGE', 'Invalid date range', 'The start date must be before the end date.');
    }

    const byStatus: Record<RequestStatus, number> = {
      PENDING_APPROVAL: 0,
      APPROVED: 0,
      REJECTED: 0,
      MATERIALIZED: 0,
    };
    const statusRows = this.db.all<{ status: RequestStatus; count: number }>(
      `SELECT status, COUNT(*) AS count FROM appointment_requests
       WHERE request_day BETWEEN ? AND ? GROUP BY status`,
      from,
      to,
    );
    for (const row of statusRows) byStatus[row.status] = Number(row.count);
    const totalRequests = Object.values(byStatus).reduce((sum, value) => sum + value, 0);

    const decisionRow = this.db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM appointment_requests WHERE decision_day BETWEEN ? AND ?`,
      from,
      to,
    );
    const today = istDay();
    const todayRow = this.db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM appointment_requests
       WHERE assigned_date = ? AND status IN ('APPROVED', 'MATERIALIZED')`,
      today,
    );
    const monthRow = this.db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM appointment_requests
       WHERE status = 'MATERIALIZED' AND materialized_at IS NOT NULL
         AND date(materialized_at, '+5 hours', '+30 minutes') BETWEEN ? AND ?`,
      monthStart(today),
      today,
    );

    const notificationRows = this.db.all<{ status: string; count: number }>(
      `SELECT status, COUNT(*) AS count FROM notifications
       WHERE date(created_at, '+5 hours', '+30 minutes') BETWEEN ? AND ?
       GROUP BY status`,
      from,
      to,
    );
    const notificationCounts = {
      queued: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      skipped: 0,
    };
    for (const row of notificationRows) {
      const key = row.status.toLowerCase() as keyof typeof notificationCounts;
      if (key in notificationCounts) notificationCounts[key] = Number(row.count);
    }
    const denominator =
      notificationCounts.delivered + notificationCounts.sent + notificationCounts.failed;
    const successRate =
      denominator === 0 ? 0 : Math.round((notificationCounts.delivered / denominator) * 1000) / 10;

    const requestDayRows = this.db.all<{ day: string; count: number }>(
      `SELECT request_day AS day, COUNT(*) AS count FROM appointment_requests
       WHERE request_day BETWEEN ? AND ? GROUP BY request_day`,
      from,
      to,
    );
    const decisionDayRows = this.db.all<{ day: string; count: number }>(
      `SELECT decision_day AS day, COUNT(*) AS count FROM appointment_requests
       WHERE decision_day BETWEEN ? AND ? GROUP BY decision_day`,
      from,
      to,
    );
    const requestDays = new Map(requestDayRows.map((row) => [row.day, Number(row.count)]));
    const decisionDays = new Map(decisionDayRows.map((row) => [row.day, Number(row.count)]));
    const byDay = dayRange(from, to).map((date) => ({
      date,
      requests: requestDays.get(date) ?? 0,
      decisions: decisionDays.get(date) ?? 0,
    }));

    const organizations = this.db.all<{ organization: string; count: number }>(
      `SELECT v.organization AS organization, COUNT(*) AS count
       FROM appointment_requests r
       JOIN visitor_profiles v ON v.id = r.visitor_id
       WHERE r.request_day BETWEEN ? AND ? AND v.organization IS NOT NULL AND trim(v.organization) != ''
       GROUP BY v.organization ORDER BY count DESC LIMIT 5`,
      from,
      to,
    );

    const upcomingRows = this.db.all<{ date: string; count: number }>(
      `SELECT assigned_date AS date, COUNT(*) AS count FROM appointment_requests
       WHERE assigned_date BETWEEN ? AND ? AND status = 'APPROVED'
       GROUP BY assigned_date`,
      addDays(today, 1),
      addDays(today, 7),
    );
    const upcomingMap = new Map(upcomingRows.map((row) => [row.date, Number(row.count)]));

    return {
      from,
      to,
      byStatus,
      totalRequests,
      decisions: Number(decisionRow?.count ?? 0),
      appointmentsToday: Number(todayRow?.count ?? 0),
      materializedThisMonth: Number(monthRow?.count ?? 0),
      notifications: { ...notificationCounts, successRate },
      byDay,
      topOrganizations: organizations.map((row) => ({
        organization: row.organization,
        count: Number(row.count),
      })),
      upcoming: Array.from({ length: 7 }, (_, index) => addDays(today, index + 1)).map((date) => ({
        date,
        count: upcomingMap.get(date) ?? 0,
      })),
    };
  }

  schedule(dateInput?: string): ScheduleResponse {
    const day = dateInput ?? istDay();
    if (!isValidDay(day)) {
      throw badRequest('INVALID_DATE', 'Invalid date', 'Use the YYYY-MM-DD date format.');
    }
    const rows = this.db.all<{
      reference: string;
      assigned_time: string;
      visitor_name: string;
      visitor_designation: string | null;
      visitor_organization: string | null;
      visitor_mobile: string;
      purpose: string;
      accompanying_count: number;
      status: RequestStatus;
    }>(
      `SELECT r.reference, r.assigned_time, v.name AS visitor_name, v.designation AS visitor_designation,
              v.organization AS visitor_organization, v.mobile AS visitor_mobile,
              r.purpose, r.accompanying_count, r.status
       FROM appointment_requests r
       JOIN visitor_profiles v ON v.id = r.visitor_id
       WHERE r.assigned_date = ? AND r.status IN ('APPROVED', 'MATERIALIZED')
       ORDER BY r.assigned_time ASC`,
      day,
    );
    const items: ScheduleAppointment[] = rows.map((row) => ({
      reference: row.reference,
      time: row.assigned_time,
      visitorName: row.visitor_name,
      designation: row.visitor_designation,
      organization: row.visitor_organization,
      mobile: row.visitor_mobile,
      purpose: row.purpose,
      accompanyingCount: Number(row.accompanying_count),
      status: row.status,
    }));
    return {
      date: day,
      venue: this.settings.get().venue,
      items,
    };
  }
}

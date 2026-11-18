import { Inject, Injectable } from '@nestjs/common';
import type {
  RequestStatus,
  VisitorHistoryItem,
  VisitorLookupMatch,
  VisitorLookupResponse,
  VisitorProfile,
} from '@vams/shared';
import { DatabaseService, SqlValue } from '../db/database.service';

interface VisitorRow {
  id: string;
  name: string;
  name_normalized: string;
  email_normalized: string;
  designation: string | null;
  organization: string | null;
  address: string | null;
  mobile: string;
  email: string;
  created_at: string;
  updated_at: string;
  request_count?: number;
  last_visit?: string | null;
}

interface HistoryRow {
  id: string;
  reference: string;
  status: RequestStatus;
  purpose: string;
  request_date: string;
  assigned_date: string | null;
  assigned_time: string | null;
  decided_by_name: string | null;
  rejection_reason: string | null;
}

const VISITOR_SELECT = `
  SELECT v.*,
    (SELECT COUNT(*) FROM appointment_requests r WHERE r.visitor_id = v.id) AS request_count,
    (SELECT MAX(r.request_day) FROM appointment_requests r WHERE r.visitor_id = v.id) AS last_visit
  FROM visitor_profiles v
`;

@Injectable()
export class VisitorsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  lookup(rawQuery: string): VisitorLookupResponse {
    const query = rawQuery.trim().toLowerCase();
    if (query.length < 2) return { query: rawQuery, matches: [], autoFillProfile: null };

    const digits = query.replace(/\D/g, '');
    const pattern = `%${query}%`;
    const digitPattern = digits.length >= 3 ? `%${digits}%` : pattern;
    const params: SqlValue[] = [
      pattern,
      pattern,
      pattern,
      digitPattern,
      digitPattern,
      pattern,
    ];

    const rows = this.db.all<VisitorRow>(
      `${VISITOR_SELECT}
       WHERE v.name_normalized LIKE ?
          OR lower(coalesce(v.designation, '')) LIKE ?
          OR lower(coalesce(v.organization, '')) LIKE ?
          OR v.mobile LIKE ?
          OR v.email_normalized LIKE ?
          OR lower(coalesce(v.address, '')) LIKE ?
       ORDER BY v.updated_at DESC
       LIMIT 200`,
      ...params,
    );

    const matches = rows
      .map((row) => this.score(row, query, digits))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8);

    let autoFillProfile: VisitorLookupMatch | null = null;
    if (matches.length === 1) autoFillProfile = matches[0];
    else if (
      matches.length > 1 &&
      matches[0].score >= 100 &&
      matches[0].score >= matches[1].score * 1.4
    ) {
      autoFillProfile = matches[0];
    }

    return { query: rawQuery, matches, autoFillProfile };
  }

  get(visitorId: string): { visitor: VisitorProfile; history: VisitorHistoryItem[] } | null {
    const row = this.db.get<VisitorRow>(`${VISITOR_SELECT} WHERE v.id = ?`, visitorId);
    if (!row) return null;
    return {
      visitor: this.mapProfile(row),
      history: this.history(visitorId),
    };
  }

  history(visitorId: string, limit = 25): VisitorHistoryItem[] {
    const rows = this.db.all<HistoryRow>(
      `SELECT r.id, r.reference, r.status, r.purpose, r.request_date,
              r.assigned_date, r.assigned_time, d.name AS decided_by_name, r.rejection_reason
       FROM appointment_requests r
       LEFT JOIN users d ON d.id = r.decided_by
       WHERE r.visitor_id = ?
       ORDER BY r.request_date DESC
       LIMIT ?`,
      visitorId,
      limit,
    );
    return rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      status: row.status,
      purpose: row.purpose,
      requestDate: row.request_date,
      assignedDate: row.assigned_date,
      assignedTime: row.assigned_time,
      decidedByName: row.decided_by_name,
      rejectionReason: row.rejection_reason,
    }));
  }

  profile(visitorId: string): VisitorProfile | null {
    const row = this.db.get<VisitorRow>(`${VISITOR_SELECT} WHERE v.id = ?`, visitorId);
    return row ? this.mapProfile(row) : null;
  }

  private mapProfile(row: VisitorRow): VisitorProfile {
    return {
      id: row.id,
      name: row.name,
      designation: row.designation,
      organization: row.organization,
      address: row.address,
      mobile: row.mobile,
      email: row.email,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      requestCount: Number(row.request_count ?? 0),
      lastVisitDate: row.last_visit ?? null,
    };
  }

  private score(row: VisitorRow, query: string, digits: string): VisitorLookupMatch {
    let score = 0;
    const fields = new Set<string>();
    const name = row.name_normalized;
    const designation = (row.designation ?? '').toLowerCase();
    const organization = (row.organization ?? '').toLowerCase();
    const email = row.email.toLowerCase();

    if (name === query) {
      score += 130;
      fields.add('name');
    } else if (name.startsWith(query)) {
      score += 95;
      fields.add('name');
    } else if (name.includes(query)) {
      score += 65;
      fields.add('name');
    }

    if (digits.length >= 3 && row.mobile.endsWith(digits)) {
      score += digits.length >= 10 ? 140 : 85;
      fields.add('mobile');
    }

    if (email === query) {
      score += 135;
      fields.add('email');
    } else if (email.startsWith(query)) {
      score += 90;
      fields.add('email');
    } else if (email.includes(query)) {
      score += 60;
      fields.add('email');
    }

    if (organization && organization === query) {
      score += 80;
      fields.add('organization');
    } else if (organization.includes(query) && query.length >= 3) {
      score += 45;
      fields.add('organization');
    }

    if (designation && designation === query) {
      score += 75;
      fields.add('designation');
    } else if (designation.includes(query) && query.length >= 3) {
      score += 40;
      fields.add('designation');
    }

    return {
      ...this.mapProfile(row),
      score,
      matchFields: [...fields],
      autoFill: false,
    };
  }
}

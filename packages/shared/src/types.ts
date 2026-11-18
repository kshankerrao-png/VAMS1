import {
  AuditAction,
  NotificationChannel,
  NotificationStatus,
  Permission,
  RequestStatus,
  Role,
} from './constants';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  email: string | null;
  mustChangePassword: boolean;
  permissions: Permission[];
}

export interface VisitorProfile {
  id: string;
  name: string;
  designation: string | null;
  organization: string | null;
  address: string | null;
  mobile: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  requestCount: number;
  lastVisitDate: string | null;
}

export interface VisitorLookupMatch extends VisitorProfile {
  score: number;
  matchFields: string[];
  autoFill: boolean;
}

export interface VisitorLookupResponse {
  query: string;
  matches: VisitorLookupMatch[];
  autoFillProfile: VisitorLookupMatch | null;
}

export interface NotificationSummary {
  total: number;
  delivered: number;
  failed: number;
  pending: number;
  skipped: number;
}

export interface RequestListRow {
  id: string;
  reference: string;
  status: RequestStatus;
  purpose: string;
  visitorId: string;
  visitorName: string;
  visitorDesignation: string | null;
  visitorOrganization: string | null;
  visitorMobile: string;
  visitorEmail: string;
  requestDate: string;
  requestDay: string;
  enteredById: string;
  enteredByName: string;
  decidedByName: string | null;
  decisionAt: string | null;
  assignedDate: string | null;
  assignedTime: string | null;
  createdAt: string;
  notificationSummary: NotificationSummary;
}

export interface NotificationRecord {
  id: string;
  requestId: string;
  channel: NotificationChannel;
  recipient: string;
  status: NotificationStatus;
  attempt: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  providerMessageId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
}

export interface VisitorHistoryItem {
  id: string;
  reference: string;
  status: RequestStatus;
  purpose: string;
  requestDate: string;
  assignedDate: string | null;
  assignedTime: string | null;
  decidedByName: string | null;
  rejectionReason: string | null;
}

export interface AuditEntry {
  seq: number;
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

export interface SlotAvailability {
  booked: number;
  capacity: number | null;
  available: boolean;
}

export interface AppointmentRequestDetail extends RequestListRow {
  visitor: VisitorProfile;
  accompanyingCount: number;
  accompanyingNames: string | null;
  documentsReference: string | null;
  remarks: string | null;
  rejectionReason: string | null;
  decisionNote: string | null;
  materializedAt: string | null;
  timeIn: string | null;
  updatedAt: string;
  notifications: NotificationRecord[];
  history: VisitorHistoryItem[];
  audits: AuditEntry[];
  slotAvailability: SlotAvailability;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DashboardStats {
  byStatus: Record<RequestStatus, number>;
  totalRequests: number;
  todayAppointments: number;
  pendingOldestDays: number;
  notificationFailures: number;
  notificationsPending: number;
}

export interface ReportDay {
  date: string;
  requests: number;
  decisions: number;
}

export interface ReportSummary {
  from: string;
  to: string;
  byStatus: Record<RequestStatus, number>;
  totalRequests: number;
  decisions: number;
  appointmentsToday: number;
  materializedThisMonth: number;
  notifications: {
    queued: number;
    sent: number;
    delivered: number;
    failed: number;
    skipped: number;
    successRate: number;
  };
  byDay: ReportDay[];
  topOrganizations: Array<{ organization: string; count: number }>;
  upcoming: Array<{ date: string; count: number }>;
}

export interface UserRecord {
  id: string;
  username: string;
  name: string;
  role: Role;
  email: string | null;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface TemplateRecord {
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  version: number;
  updatedAt: string;
  updatedByName: string | null;
}

export interface AppSettings {
  maxPerSlot: number | null;
  allowStaffMaterialize: boolean;
  venue: string;
  instructions: string;
}

export interface SystemInfo {
  appVersion: string;
  environment: string;
  dbFile: string;
  storageDir: string;
  workerEnabled: boolean;
  emailConfigured: boolean;
  whatsappConfigured: boolean;
  uptimeSeconds: number;
  serverTime: string;
}

export interface ScheduleAppointment {
  reference: string;
  time: string;
  visitorName: string;
  designation: string | null;
  organization: string | null;
  mobile: string;
  purpose: string;
  accompanyingCount: number;
  status: RequestStatus;
}

export interface ScheduleResponse {
  date: string;
  venue: string;
  items: ScheduleAppointment[];
}

export interface DuplicateWarning {
  hasDuplicate: boolean;
  requests: Array<{
    id: string;
    reference: string;
    status: RequestStatus;
    requestDate: string;
    assignedDate: string | null;
    assignedTime: string | null;
  }>;
}

export interface AuditResponse extends Paginated<AuditEntry> {}

export interface AuditVerification {
  valid: boolean;
  checked: number;
  brokenAtSeq: number | null;
  message: string;
}

export interface LoginResponse {
  user: AuthUser;
}

export type AuditActionName = AuditAction;

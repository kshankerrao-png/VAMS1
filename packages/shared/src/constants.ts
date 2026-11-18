export const ROLES = ['PESHI_STAFF', 'SECRETARY', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  PESHI_STAFF: 'Peshi Staff',
  SECRETARY: 'Secretary, T,R&B',
  ADMIN: 'System Administrator',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  PESHI_STAFF: 'Enter appointment requests, verify returning visitors and track statuses.',
  SECRETARY: 'Review pending requests, approve or reject, assign appointment slots.',
  ADMIN: 'Manage users, templates, settings and system configuration.',
};

export const PERMISSIONS = [
  'request:create',
  'request:read',
  'request:decide',
  'request:schedule',
  'request:materialize',
  'register:export',
  'report:read',
  'audit:read',
  'notification:resend',
  'admin:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  PESHI_STAFF: ['request:create', 'request:read'],
  SECRETARY: [
    'request:read',
    'request:decide',
    'request:schedule',
    'request:materialize',
    'register:export',
    'report:read',
    'audit:read',
    'notification:resend',
  ],
  ADMIN: [
    'request:read',
    'register:export',
    'report:read',
    'audit:read',
    'notification:resend',
    'admin:manage',
  ],
};

export const REQUEST_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'MATERIALIZED'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Appointment Approved',
  REJECTED: 'Appointment Rejected',
  MATERIALIZED: 'Appointment Materialized',
};

export const STATUS_SHORT_LABELS: Record<RequestStatus, string> = {
  PENDING_APPROVAL: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  MATERIALIZED: 'Materialized',
};

export const NOTIFICATION_CHANNELS = ['EMAIL', 'WHATSAPP'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp',
};

export const NOTIFICATION_STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_STATUS_LABELS: Record<NotificationStatus, string> = {
  QUEUED: 'Queued',
  SENT: 'Sent',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
  SKIPPED: 'Skipped',
};

export const TEMPLATE_VARIABLES = [
  'visitor_name',
  'designation',
  'organization',
  'purpose',
  'assigned_date',
  'assigned_time',
  'reference',
  'venue',
  'department',
  'accompanying',
  'instructions',
] as const;

export const DEPARTMENT_NAME = 'Transport, Roads & Buildings Department';
export const TIMEZONE = 'Asia/Kolkata';
export const DATE_FORMAT_HINT = 'DD-MM-YYYY';
export const REFERENCE_PREFIX = 'VAMS';

export const AUDIT_ACTIONS = [
  'AUTH_LOGIN',
  'AUTH_LOGIN_FAILED',
  'AUTH_LOGOUT',
  'PASSWORD_CHANGED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_PASSWORD_RESET',
  'REQUEST_CREATED',
  'REQUEST_APPROVED',
  'REQUEST_REJECTED',
  'REQUEST_RESCHEDULED',
  'REQUEST_MATERIALIZED',
  'NOTIFICATION_QUEUED',
  'NOTIFICATION_SENT',
  'NOTIFICATION_DELIVERED',
  'NOTIFICATION_FAILED',
  'NOTIFICATION_SKIPPED',
  'NOTIFICATION_RESENT',
  'EXPORT_GENERATED',
  'AUDIT_VERIFIED',
  'TEMPLATE_UPDATED',
  'SETTINGS_UPDATED',
  'SEED_DATA',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

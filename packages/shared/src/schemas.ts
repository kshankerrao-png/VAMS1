import { z } from 'zod';
import { NOTIFICATION_CHANNELS, REQUEST_STATUSES, ROLES } from './constants';
import { normalizeMobile } from './utils';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD date format');

const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time such as 10:30');

const optionalText = (max: number, label: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value),
    z.string().max(max, `${label} must be at most ${max} characters`).optional(),
  );

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number');

export const loginSchema = z.object({
  username: z.string().trim().min(3, 'Username is required').max(60),
  password: z.string().min(1, 'Password is required').max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  });

const mobileField = z
  .string()
  .min(1, 'Mobile number is required')
  .superRefine((value, ctx) => {
    if (!normalizeMobile(value)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a valid 10-digit Indian mobile number',
      });
    }
  })
  .transform((value) => normalizeMobile(value));

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(160, 'Email must be at most 160 characters');

export const intakeSchema = z.object({
  visitorId: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().uuid('Invalid visitor reference').optional(),
  ),
  visitorName: z.string().trim().min(2, 'Visitor name is required').max(120),
  designation: optionalText(120, 'Designation'),
  organization: optionalText(160, 'Organization'),
  address: optionalText(300, 'Address'),
  mobile: mobileField,
  email: emailField,
  purpose: z.string().trim().min(3, 'Purpose of visit is required').max(1000),
  accompanyingCount: z.number().int().min(0).max(50).optional(),
  accompanyingNames: optionalText(300, 'Accompanying names'),
  documentsReference: optionalText(300, 'Documents reference'),
  remarks: optionalText(500, 'Remarks'),
});
export type IntakePayload = z.infer<typeof intakeSchema>;

export const clearDataSchema = z.object({
  password: z.string().min(1, 'Password is required').max(200),
});
export type ClearDataInput = z.infer<typeof clearDataSchema>;

export const visitorUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Visitor name is required').max(120),
  designation: optionalText(120, 'Designation'),
  organization: optionalText(160, 'Organization'),
  address: optionalText(300, 'Address'),
  mobile: mobileField,
  email: emailField,
});
export type VisitorUpdatePayload = z.infer<typeof visitorUpdateSchema>;

export const approveSchema = z.object({
  assignedDate: dateString,
  assignedTime: timeString,
  note: optionalText(500, 'Note'),
});

export const rejectSchema = z.object({
  reason: optionalText(500, 'Reason'),
});

export const rescheduleSchema = z.object({
  assignedDate: dateString,
  assignedTime: timeString,
  reason: optionalText(500, 'Reason'),
});

export const materializeSchema = z.object({
  timeIn: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    timeString.optional(),
  ),
});

export const requestQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  name: z.string().trim().max(120).optional(),
  designation: z.string().trim().max(120).optional(),
  organization: z.string().trim().max(160).optional(),
  mobile: z.string().trim().max(20).optional(),
  email: z.string().trim().max(160).optional(),
  status: z.string().trim().optional(),
  notificationStatus: z.enum(['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED']).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  assignedFrom: dateString.optional(),
  assignedTo: dateString.optional(),
  decidedFrom: dateString.optional(),
  decidedTo: dateString.optional(),
  enteredBy: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['requestDate', 'assignedDate', 'status', 'visitorName', 'decisionAt']).default('requestDate'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});
export type RequestQuery = z.infer<typeof requestQuerySchema>;

export const auditQuerySchema = z.object({
  actor: z.string().trim().max(120).optional(),
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(80).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const userCreateSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,60}$/, 'Username must be 3-60 characters (letters, numbers, dot, dash, underscore)'),
  name: z.string().trim().min(2, 'Name is required').max(120),
  role: z.enum(ROLES),
  email: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().trim().toLowerCase().email('Enter a valid email address').max(160).optional(),
  ),
  password: passwordSchema,
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().trim().toLowerCase().email('Enter a valid email address').max(160).optional(),
  ),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});

export const templateSchema = z.object({
  subject: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value),
    z.string().max(200, 'Subject must be at most 200 characters').optional(),
  ),
  body: z.string().trim().min(10, 'Template body is required').max(5000),
});

export const settingsSchema = z.object({
  maxPerSlot: z.union([z.number().int().min(1).max(100), z.null()]),
  allowStaffMaterialize: z.boolean(),
  venue: z.string().trim().min(2, 'Venue is required').max(200),
  instructions: z.string().trim().max(500).optional().default(''),
});

export const channelParamSchema = z.enum(NOTIFICATION_CHANNELS);
export const statusFilterSchema = z.array(z.enum(REQUEST_STATUSES));

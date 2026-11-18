import { describe, expect, it } from 'vitest';
import {
  canTransition,
  defaultTemplateFor,
  hasPermission,
  intakeSchema,
  normalizeMobile,
  permissionsForRole,
  renderTemplate,
  requestQuerySchema,
  approveSchema,
  DEFAULT_TEMPLATES,
} from '../src';

describe('status machine', () => {
  it('allows the documented transitions', () => {
    expect(canTransition('PENDING_APPROVAL', 'APPROVED')).toBe(true);
    expect(canTransition('PENDING_APPROVAL', 'REJECTED')).toBe(true);
    expect(canTransition('APPROVED', 'MATERIALIZED')).toBe(true);
  });

  it('blocks illegal and terminal transitions', () => {
    expect(canTransition('PENDING_APPROVAL', 'MATERIALIZED')).toBe(false);
    expect(canTransition('REJECTED', 'APPROVED')).toBe(false);
    expect(canTransition('MATERIALIZED', 'APPROVED')).toBe(false);
  });
});

describe('permissions', () => {
  it('grants approval rights only to the Secretary role', () => {
    expect(hasPermission({ role: 'SECRETARY' }, 'request:decide')).toBe(true);
    expect(hasPermission({ role: 'PESHI_STAFF' }, 'request:decide')).toBe(false);
    expect(hasPermission({ role: 'ADMIN' }, 'request:decide')).toBe(false);
  });

  it('allows staff to materialize only when the setting is enabled', () => {
    expect(hasPermission({ role: 'PESHI_STAFF' }, 'request:materialize')).toBe(false);
    expect(
      hasPermission({ role: 'PESHI_STAFF' }, 'request:materialize', {
        allowStaffMaterialize: true,
      }),
    ).toBe(true);
    expect(
      permissionsForRole('PESHI_STAFF', { allowStaffMaterialize: true }),
    ).toContain('request:materialize');
  });

  it('keeps admin user management away from other roles', () => {
    expect(hasPermission({ role: 'ADMIN' }, 'admin:manage')).toBe(true);
    expect(hasPermission({ role: 'SECRETARY' }, 'admin:manage')).toBe(false);
    expect(hasPermission({ role: 'PESHI_STAFF' }, 'audit:read')).toBe(false);
  });
});

describe('mobile and email normalisation', () => {
  it('normalises common Indian mobile formats', () => {
    expect(normalizeMobile('98765 43210')).toBe('+919876543210');
    expect(normalizeMobile('+91 98765-43210')).toBe('+919876543210');
    expect(normalizeMobile('09876543210')).toBe('+919876543210');
    expect(normalizeMobile('12345')).toBe('');
    expect(normalizeMobile('5123456789')).toBe('');
  });

  it('normalises intake input and rejects invalid contact details', () => {
    const parsed = intakeSchema.safeParse({
      visitorName: 'Asha Verma',
      mobile: '+91 98765 43210',
      email: ' Asha.Verma@Example.COM ',
      purpose: 'Discussion on pending road works',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.mobile).toBe('+919876543210');
      expect(parsed.data.email).toBe('asha.verma@example.com');
      expect(parsed.data.visitorId).toBeUndefined();
    }

    const invalid = intakeSchema.safeParse({
      visitorName: 'A',
      mobile: '123',
      email: 'not-an-email',
      purpose: '',
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      const fields = invalid.error.issues.map((issue) => issue.path[0]);
      expect(fields).toContain('mobile');
      expect(fields).toContain('email');
      expect(fields).toContain('purpose');
      expect(fields).toContain('visitorName');
    }
  });
});

describe('query and decision validation', () => {
  it('applies list defaults and rejects oversized pages', () => {
    const parsed = requestQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
    expect(parsed.sort).toBe('requestDate');
    expect(parsed.dir).toBe('desc');
    expect(requestQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });

  it('requires a valid future-style slot format for approvals', () => {
    expect(
      approveSchema.safeParse({ assignedDate: '2027-01-04', assignedTime: '10:30' }).success,
    ).toBe(true);
    expect(
      approveSchema.safeParse({ assignedDate: '04-01-2027', assignedTime: '10:30' }).success,
    ).toBe(false);
    expect(
      approveSchema.safeParse({ assignedDate: '2027-01-04', assignedTime: '25:99' }).success,
    ).toBe(false);
  });
});

describe('templates', () => {
  it('renders all supported variables and leaves unknown ones blank', () => {
    const rendered = renderTemplate(
      'Hello {{visitor_name}} — {{reference}} at {{unknown}}',
      { visitor_name: 'Asha', reference: 'VAMS-2026-00001' },
    );
    expect(rendered).toBe('Hello Asha — VAMS-2026-00001 at ');
  });

  it('ships default Email and WhatsApp templates with the core variables', () => {
    expect(DEFAULT_TEMPLATES).toHaveLength(2);
    const email = defaultTemplateFor('EMAIL');
    expect(email.subject).toContain('{{reference}}');
    expect(email.body).toContain('{{visitor_name}}');
    expect(email.body).toContain('{{assigned_date}}');
    const whatsapp = defaultTemplateFor('WHATSAPP');
    expect(whatsapp.subject).toBeNull();
    expect(whatsapp.body).toContain('{{assigned_time}}');
  });
});

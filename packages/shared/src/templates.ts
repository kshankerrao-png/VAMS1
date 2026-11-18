import { NotificationChannel } from './constants';

export interface DefaultTemplate {
  channel: NotificationChannel;
  subject: string | null;
  body: string;
}

const DEPARTMENT_FOOTER = `Office of the Secretary
Transport, Roads & Buildings Department`;

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    channel: 'EMAIL',
    subject: 'Appointment Confirmed — {{reference}} | Transport, Roads & Buildings Department',
    body: `Dear {{visitor_name}},

Your appointment with the Secretary, Transport, Roads & Buildings Department has been confirmed.

Reference: {{reference}}
Date: {{assigned_date}}
Time: {{assigned_time}}
Venue: {{venue}}
Purpose: {{purpose}}

Please carry this reference number and a valid photo ID when you visit. If the slot needs to be changed, contact the Peshi office.

Regards,
${DEPARTMENT_FOOTER}`,
  },
  {
    channel: 'WHATSAPP',
    subject: null,
    body: `*Appointment Confirmed*
Transport, Roads & Buildings Department

Dear {{visitor_name}},
Your appointment with the Secretary has been approved.

*Reference:* {{reference}}
*Date:* {{assigned_date}}
*Time:* {{assigned_time}}
*Venue:* {{venue}}

Please carry this reference and a valid photo ID.`,
  },
];

export function defaultTemplateFor(channel: NotificationChannel): DefaultTemplate {
  return DEFAULT_TEMPLATES.find((template) => template.channel === channel) ?? DEFAULT_TEMPLATES[0];
}

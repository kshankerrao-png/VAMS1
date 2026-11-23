import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { OutboundMessage, SendResult } from './email.adapter';

interface MetaResponse {
  messages?: Array<{ id?: string }>;
  error?: { message?: string };
}

interface TwilioResponse {
  sid?: string;
  status?: string;
  message?: string;
  code?: number;
}

interface ZavuResponse {
  message?: { id?: string; status?: string } | string;
  routing?: { channel?: string };
  code?: string;
  details?: { connect?: unknown[]; errors?: unknown[] };
}

function whatsappAddress(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('whatsapp:')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  return digits ? `whatsapp:+${digits}` : trimmed;
}

function e164Address(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits ? `+${digits}` : value.trim();
}

function cleanTemplateVariables(values: Record<string, string>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const compact = value.replace(/[\t\r\n]+/g, ' ').replace(/ {5,}/g, '    ').trim();
    cleaned[key] = compact || '-';
  }
  return cleaned;
}

@Injectable()
export class WhatsappAdapter {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get simulated(): boolean {
    return !this.config.whatsappConfigured;
  }

  private e164(mobile: string): string {
    let digits = mobile.replace(/\D/g, '');
    if (digits.length === 10) {
      digits = `${this.config.whatsappCountryCode}${digits}`;
    } else if (digits.length === 11 && digits.startsWith('0')) {
      digits = `${this.config.whatsappCountryCode}${digits.slice(1)}`;
    }
    return digits;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (!this.config.whatsappConfigured) {
      const dir = path.join(this.config.storageDir, 'outbox');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `whatsapp-${message.reference}-${Date.now()}.json`);
      fs.writeFileSync(
        file,
        JSON.stringify(
          { to: message.to, type: 'text', text: { body: message.body }, raw: message },
          null,
          2,
        ),
        'utf8',
      );
      return {
        providerMessageId: `dev-wa-${randomUUID()}`,
        deliveredImmediately: true,
        simulated: true,
      };
    }

    if (this.config.whatsapp.phoneNumberId && this.config.whatsapp.token) {
      return this.sendViaMeta(message);
    }

    if (this.config.twilio.accountSid && this.config.twilio.authToken && this.config.twilio.from) {
      return this.sendViaTwilio(message);
    }

    return this.sendViaZavu(message);
  }
  private async sendViaZavu(message: OutboundMessage): Promise<SendResult> {
    const { apiKey, apiUrl, from, templateId } = this.config.zavu;
    const variables = message.namedTemplateVariables ?? message.templateVariables;
    const payload: Record<string, unknown> = {
      to: `+${this.e164(message.to)}`,
      channel: 'whatsapp',
    };
    if (templateId) {
      payload.messageType = 'template';
      payload.content = {
        templateId,
        ...(variables ? { templateVariables: cleanTemplateVariables(variables) } : {}),
      };
    } else {
      payload.text = message.body;
    }
    if (from) {
      payload.from = e164Address(from);
    }

    const response = await fetch(`${apiUrl}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => null)) as ZavuResponse | null;
    if (!response.ok) {
      const code = data?.code ? `${data.code}: ` : '';
      const detail = typeof data?.message === 'string' ? data.message : `Zavu WhatsApp error (${response.status})`;
      throw new Error(`${code}${detail}`);
    }
    const accepted = typeof data?.message === 'object' ? data.message : undefined;
    return {
      providerMessageId: accepted?.id ?? `zavu-${randomUUID()}`,
      deliveredImmediately: false,
    };
  }

  private async sendViaTwilio(message: OutboundMessage): Promise<SendResult> {
    const { accountSid, authToken, from, contentSid } = this.config.twilio;
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
    const payload = new URLSearchParams({
      To: `whatsapp:+${this.e164(message.to)}`,
      From: whatsappAddress(from),
    });
    if (contentSid) {
      payload.set('ContentSid', contentSid);
      if (message.templateVariables) {
        payload.set('ContentVariables', JSON.stringify(message.templateVariables));
      }
    } else {
      payload.set('Body', message.body);
    }
    const authorization = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload,
    });

    const data = (await response.json().catch(() => null)) as TwilioResponse | null;
    if (!response.ok) {
      throw new Error(data?.message ?? `Twilio WhatsApp error (${response.status})`);
    }
    return {
      providerMessageId: data?.sid ?? `twilio-${randomUUID()}`,
      deliveredImmediately: false,
    };
  }

  private async sendViaMeta(message: OutboundMessage): Promise<SendResult> {
    const { whatsapp } = this.config;
    const endpoint = `${whatsapp.apiUrl.replace(/\/+$/, '')}/${whatsapp.phoneNumberId}/messages`;
    const payload = whatsapp.templateName
      ? {
          messaging_product: 'whatsapp',
          to: this.e164(message.to),
          type: 'template',
          template: {
            name: whatsapp.templateName,
            language: { code: whatsapp.templateLang },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: message.body }],
              },
            ],
          },
        }
      : {
          messaging_product: 'whatsapp',
          to: this.e164(message.to),
          type: 'text',
          text: { body: message.body },
        };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${whatsapp.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => null)) as MetaResponse | null;
    if (!response.ok) {
      throw new Error(data?.error?.message ?? `WhatsApp provider error (${response.status})`);
    }
    return {
      providerMessageId: data?.messages?.[0]?.id ?? `wa-${randomUUID()}`,
      deliveredImmediately: false,
    };
  }
}

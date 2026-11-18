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

function whatsappAddress(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('whatsapp:')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  return digits ? `whatsapp:+${digits}` : trimmed;
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

    return this.config.twilio.accountSid && this.config.twilio.authToken && this.config.twilio.from
      ? this.sendViaTwilio(message)
      : this.sendViaMeta(message);
  }

  private async sendViaTwilio(message: OutboundMessage): Promise<SendResult> {
    const { accountSid, authToken, from } = this.config.twilio;
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
    const payload = new URLSearchParams({
      To: `whatsapp:+${this.e164(message.to)}`,
      From: whatsappAddress(from),
      Body: message.body,
    });
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

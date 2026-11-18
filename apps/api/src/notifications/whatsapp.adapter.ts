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

@Injectable()
export class WhatsappAdapter {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get simulated(): boolean {
    return !this.config.whatsappConfigured;
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

    const { whatsapp } = this.config;
    const endpoint = `${whatsapp.apiUrl.replace(/\/+$/, '')}/${whatsapp.phoneNumberId}/messages`;
    const to = message.to.replace(/\D/g, '');
    const payload = whatsapp.templateName
      ? {
          messaging_product: 'whatsapp',
          to,
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
          to,
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

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { APP_CONFIG, AppConfig } from '../config';

export interface OutboundMessage {
  to: string;
  subject?: string;
  body: string;
  reference: string;
}

export interface SendResult {
  providerMessageId: string;
  deliveredImmediately: boolean;
  simulated?: boolean;
}

@Injectable()
export class EmailAdapter {
  private readonly transporter: Transporter | null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.transporter = config.emailConfigured
      ? nodemailer.createTransport({
          host: config.smtp.host,
          port: config.smtp.port,
          secure: config.smtp.secure,
          auth: config.smtp.user
            ? { user: config.smtp.user, pass: config.smtp.password }
            : undefined,
        })
      : null;
  }

  get simulated(): boolean {
    return this.transporter === null;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (!this.transporter) {
      const dir = path.join(this.config.storageDir, 'outbox');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `email-${message.reference}-${Date.now()}.eml`);
      fs.writeFileSync(
        file,
        [
          `From: ${this.config.smtp.from}`,
          `To: ${message.to}`,
          `Subject: ${message.subject ?? 'Appointment confirmation'}`,
          `X-VAMS-Reference: ${message.reference}`,
          'Content-Type: text/plain; charset=utf-8',
          '',
          message.body,
        ].join('\n'),
        'utf8',
      );
      return {
        providerMessageId: `dev-email-${randomUUID()}`,
        deliveredImmediately: true,
        simulated: true,
      };
    }

    const info = await this.transporter.sendMail({
      from: this.config.smtp.from,
      to: message.to,
      subject: message.subject ?? 'Appointment confirmation',
      text: message.body,
    });
    return {
      providerMessageId: info.messageId ?? `smtp-${randomUUID()}`,
      deliveredImmediately: false,
    };
  }
}

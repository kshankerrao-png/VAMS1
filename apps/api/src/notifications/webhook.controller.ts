import { Body, Controller, Get, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { NotificationStatus } from '@vams/shared';
import { APP_CONFIG, AppConfig } from '../config';
import { Public } from '../common/decorators';
import { forbidden, unauthorized } from '../common/errors';
import { NotificationService } from './notification.service';

interface StatusEntry {
  id?: string;
  status?: string;
  errors?: Array<{ title?: string; message?: string }>;
}

interface WebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: StatusEntry[];
      };
    }>;
  }>;
}

@Controller('webhooks')
export class WebhookController {
  constructor(
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('whatsapp')
  verify(@Query() query: Record<string, string>, @Res() response: Response) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'] ?? '';
    const expected = this.config.whatsapp.verifyToken;
    if (mode === 'subscribe' && expected && token === expected) {
      return response.type('text/plain').send(challenge);
    }
    throw forbidden('WhatsApp webhook verification failed.');
  }

  @Public()
  @Post('whatsapp')
  async receive(@Req() request: Request & { rawBody?: Buffer }, @Body() body: WebhookBody) {
    this.verifySignature(request, body);

    const statuses = (body.entry ?? []).flatMap((entry) =>
      (entry.changes ?? []).flatMap((change) => change.value?.statuses ?? []),
    );

    let processed = 0;
    for (const entry of statuses) {
      if (!entry.id || !entry.status) continue;
      const mapped = this.mapStatus(entry.status);
      if (!mapped) continue;
      const reason = entry.errors?.[0]?.message ?? entry.errors?.[0]?.title;
      const result = await this.notifications.markByProviderMessageId(entry.id, mapped, reason);
      if (result) processed += 1;
    }
    return { received: true, processed };
  }

  private mapStatus(status: string): NotificationStatus | null {
    switch (status) {
      case 'sent':
        return 'SENT';
      case 'delivered':
      case 'read':
        return 'DELIVERED';
      case 'failed':
        return 'FAILED';
      default:
        return null;
    }
  }

  private verifySignature(request: Request & { rawBody?: Buffer }, body: WebhookBody): void {
    const secret = this.config.whatsapp.appSecret;
    if (!secret) return;
    const header = request.header('x-hub-signature-256');
    const raw = request.rawBody;
    if (!header || !raw) {
      throw unauthorized('WEBHOOK_SIGNATURE_MISSING', 'Missing webhook signature.');
    }
    const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    const provided = Buffer.from(header);
    const computed = Buffer.from(expected);
    if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) {
      throw forbidden('Invalid webhook signature.');
    }
    void body;
  }
}

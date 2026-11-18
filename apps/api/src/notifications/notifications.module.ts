import { Module } from '@nestjs/common';
import { EmailAdapter } from './email.adapter';
import { NotificationService } from './notification.service';
import { NotificationWorker } from './notification.worker';
import { NotificationsController } from './notifications.controller';
import { TemplatesService } from './templates.service';
import { WebhookController } from './webhook.controller';
import { WhatsappAdapter } from './whatsapp.adapter';

@Module({
  controllers: [NotificationsController, WebhookController],
  providers: [
    EmailAdapter,
    WhatsappAdapter,
    TemplatesService,
    NotificationService,
    NotificationWorker,
  ],
  exports: [NotificationService, TemplatesService, NotificationWorker],
})
export class NotificationsModule {}

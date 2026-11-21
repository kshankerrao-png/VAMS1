import { Controller, Get, Inject, Logger, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '@vams/shared';
import { CurrentUser, RequirePermissions, requestContext } from '../common/decorators';
import { parseOrThrow } from '../common/validate';
import { notificationChannelQuerySchema } from './notification.schemas';
import { NotificationService } from './notification.service';
import { NotificationWorker } from './notification.worker';

@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(NotificationWorker) private readonly worker: NotificationWorker,
  ) {}

  @Get()
  @RequirePermissions('request:read')
  list(@Query() query: Record<string, unknown>) {
    const { requestId } = parseOrThrow(notificationChannelQuerySchema, query);
    return this.notifications.listByRequest(requestId);
  }

  @Post(':id/resend')
  @RequirePermissions('notification:resend')
  async resend(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() request: Request) {
    const record = await this.notifications.resend(id, user, requestContext(request));
    if (this.worker.enabled) {
      this.worker.kick();
      return record;
    }
    try {
      await this.worker.drainAll(4);
    } catch (error) {
      this.logger.error(
        `Inline notification dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return record;
  }

  @Post(':id/simulate-delivery')
  @RequirePermissions('notification:resend')
  simulate(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() request: Request) {
    return this.notifications.simulateDelivery(id, user, requestContext(request));
  }
}

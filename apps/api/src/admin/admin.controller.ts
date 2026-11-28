import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  NOTIFICATION_CHANNELS,
  clearDataSchema,
  resetPasswordSchema,
  settingsSchema,
  templateSchema,
  userCreateSchema,
  userUpdateSchema,
} from '@vams/shared';
import type { AuthUser, NotificationChannel } from '@vams/shared';
import { CurrentUser, RequirePermissions, requestContext } from '../common/decorators';
import { parseOrThrow } from '../common/validate';
import { badRequest } from '../common/errors';
import { SettingsService } from '../settings/settings.module';
import { TemplatesService } from '../notifications/templates.service';
import { AdminService } from './admin.service';

@Controller('admin')
@RequirePermissions('admin:manage')
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly admin: AdminService,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(TemplatesService) private readonly templates: TemplatesService,
  ) {}

  @Get('users')
  async users() {
    return { items: await this.admin.listUsers() };
  }

  @Post('users')
  async createUser(
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    const input = parseOrThrow(userCreateSchema, body);
    return this.admin.createUser(input, user, requestContext(request));
  }

  @Patch('users/:id')
  updateUser(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    const input = parseOrThrow(userUpdateSchema, body);
    return this.admin.updateUser(id, input, user, requestContext(request));
  }

  @Post('users/:id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    const input = parseOrThrow(resetPasswordSchema, body);
    return this.admin.resetPassword(id, input.password, user, requestContext(request));
  }

  @Get('templates')
  async templatesList() {
    const [email, whatsapp] = await Promise.all([
      this.templates.get('EMAIL'),
      this.templates.get('WHATSAPP'),
    ]);
    return { items: [email, whatsapp] };
  }

  @Put('templates/:channel')
  updateTemplate(
    @Param('channel') channel: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    if (!NOTIFICATION_CHANNELS.includes(channel.toUpperCase() as NotificationChannel)) {
      throw badRequest('INVALID_CHANNEL', 'Unsupported notification channel');
    }
    const input = parseOrThrow(templateSchema, body);
    return this.templates.update(
      channel.toUpperCase() as NotificationChannel,
      input,
      user,
      requestContext(request),
    );
  }

  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Put('settings')
  updateSettings(
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    const input = parseOrThrow(settingsSchema, body);
    return this.admin.updateSettings(input, user, requestContext(request));
  }

  @Get('system')
  system() {
    return this.admin.systemInfo();
  }

  @Post('clear-data')
  @HttpCode(200)
  clearData(
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    const input = parseOrThrow(clearDataSchema, body);
    return this.admin.clearAllData(input.password, user, requestContext(request));
  }
}

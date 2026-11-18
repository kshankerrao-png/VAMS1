import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  approveSchema,
  intakeSchema,
  materializeSchema,
  rejectSchema,
  requestQuerySchema,
  rescheduleSchema,
} from '@vams/shared';
import type { AuthUser } from '@vams/shared';
import { CurrentUser, RequirePermissions, requestContext } from '../common/decorators';
import { parseOrThrow } from '../common/validate';
import { badRequest } from '../common/errors';
import { RequestsService } from './requests.service';

const slotQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD date format'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time such as 10:30'),
});

@Controller('requests')
export class RequestsController {
  constructor(@Inject(RequestsService) private readonly requests: RequestsService) {}

  @Get()
  @RequirePermissions('request:read')
  list(@Query() query: Record<string, unknown>) {
    return this.requests.list(parseOrThrow(requestQuerySchema, query));
  }

  @Get('stats')
  @RequirePermissions('request:read')
  stats() {
    return this.requests.stats();
  }

  @Get('duplicates')
  @RequirePermissions('request:read')
  duplicates(@Query('mobile') mobile?: string, @Query('email') email?: string) {
    return this.requests.duplicates(mobile, email);
  }

  @Post()
  @RequirePermissions('request:create')
  create(
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    const payload = parseOrThrow(intakeSchema, body);
    return this.requests.create(payload, user, requestContext(request));
  }

  @Get(':id')
  @RequirePermissions('request:read')
  detail(@Param('id') id: string) {
    return this.requests.detail(id);
  }

  @Get(':id/slot-check')
  @RequirePermissions('request:read')
  slotCheck(@Param('id') id: string, @Query() query: Record<string, unknown>) {
    const { date, time } = parseOrThrow(slotQuerySchema, query);
    return this.requests.slotCheck(id, date, time);
  }

  @Post(':id/approve')
  @RequirePermissions('request:decide', 'request:schedule')
  approve(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    if (idempotencyKey && idempotencyKey.length > 100) {
      throw badRequest('INVALID_IDEMPOTENCY_KEY', 'Idempotency key is too long');
    }
    const input = parseOrThrow(approveSchema, body);
    return this.requests.approve(id, input, user, requestContext(request), idempotencyKey);
  }

  @Post(':id/reject')
  @RequirePermissions('request:decide')
  reject(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    const input = parseOrThrow(rejectSchema, body);
    return this.requests.reject(id, input, user, requestContext(request));
  }

  @Post(':id/reschedule')
  @RequirePermissions('request:decide', 'request:schedule')
  reschedule(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    const input = parseOrThrow(rescheduleSchema, body);
    return this.requests.reschedule(id, input, user, requestContext(request));
  }

  @Post(':id/materialize')
  @RequirePermissions('request:materialize')
  materialize(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    const input = parseOrThrow(materializeSchema, body);
    return this.requests.materialize(id, input, user, requestContext(request));
  }
}

@Controller('register')
export class RegisterController {
  constructor(@Inject(RequestsService) private readonly requests: RequestsService) {}

  @Get('export')
  @RequirePermissions('register:export')
  async export(
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const parsed = parseOrThrow(requestQuerySchema, query);
    const { filename, content } = await this.requests.exportCsv(
      parsed,
      user,
      requestContext(request),
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.send(`\uFEFF${content}`);
  }
}

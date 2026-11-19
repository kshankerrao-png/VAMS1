import { Body, Controller, Get, Inject, Param, Patch, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { visitorUpdateSchema } from '@vams/shared';
import type { AuthUser } from '@vams/shared';
import { VisitorsService } from './visitors.service';
import { CurrentUser, RequirePermissions, requestContext } from '../common/decorators';
import { parseOrThrow } from '../common/validate';
import { notFound } from '../common/errors';

@Controller('visitors')
export class VisitorsController {
  constructor(@Inject(VisitorsService) private readonly visitors: VisitorsService) {}

  @Get('lookup')
  @RequirePermissions('request:read')
  lookup(@Query('q') query?: string) {
    return this.visitors.lookup(query ?? '');
  }

  @Get(':id')
  @RequirePermissions('request:read')
  async get(@Param('id') id: string) {
    const result = await this.visitors.get(id);
    if (!result) throw notFound('Visitor', 'VISITOR_NOT_FOUND');
    return result;
  }

  @Patch(':id')
  @RequirePermissions('visitor:update')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    const input = parseOrThrow(visitorUpdateSchema, body);
    return this.visitors.update(id, input, user, requestContext(request));
  }
}

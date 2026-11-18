import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { VisitorsService } from './visitors.service';
import { RequirePermissions } from '../common/decorators';
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
  get(@Param('id') id: string) {
    const result = this.visitors.get(id);
    if (!result) throw notFound('Visitor', 'VISITOR_NOT_FOUND');
    return result;
  }
}

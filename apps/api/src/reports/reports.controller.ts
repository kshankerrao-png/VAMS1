import { Controller, Get, Inject, Query } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators';
import { ReportsService } from './reports.service';

@Controller('reports')
@RequirePermissions('report:read')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get('summary')
  summary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.summary(from, to);
  }

  @Get('schedule')
  schedule(@Query('date') date?: string) {
    return this.reports.schedule(date);
  }
}

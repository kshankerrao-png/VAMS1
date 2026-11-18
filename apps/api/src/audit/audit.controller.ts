import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { auditQuerySchema } from '@vams/shared';
import type { Request } from 'express';
import { AuditService } from './audit.service';
import { CurrentUser, RequirePermissions, requestContext } from '../common/decorators';
import { parseOrThrow } from '../common/validate';
import type { AuthUser } from '@vams/shared';

@Controller('audit')
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit:read')
  list(@Query() query: Record<string, unknown>) {
    const parsed = parseOrThrow(auditQuerySchema, query);
    return this.audit.list(parsed);
  }

  @Get('verify')
  @RequirePermissions('audit:read')
  verify(@CurrentUser() user: AuthUser, @Req() request: Request) {
    const result = this.audit.verify();
    this.audit.log({
      actor: { id: user.id, name: user.name },
      action: 'AUDIT_VERIFIED',
      entityType: 'audit_log',
      entityId: null,
      after: { operation: 'verify', valid: result.valid, checked: result.checked },
      ...requestContext(request),
    });
    return result;
  }
}

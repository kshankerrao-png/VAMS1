import { Injectable, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser, Permission } from '@vams/shared';
import type { Request } from 'express';
import { APP_CONFIG, AppConfig } from '../config';
import { PERMISSIONS_METADATA, PUBLIC_METADATA } from '../common/metadata';
import { forbidden, unauthorized } from '../common/errors';
import { AuthzService } from './authz.service';
import { SessionService } from './session.service';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuthzService) private readonly authz: AuthzService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser; sessionId?: string; cookies?: Record<string, string> }>();

    const token = request.cookies?.[this.config.cookieName];
    if (!token) throw unauthorized('AUTH_REQUIRED', 'Sign in to continue.');

    const session = this.sessions.resolve(
      token,
      request.ip ?? null,
      request.header('user-agent') ?? null,
    );
    if (!session) {
      throw unauthorized('SESSION_EXPIRED', 'Your session has expired. Sign in again.');
    }

    const permissions = this.authz.permissionsFor(session.user);
    request.user = { ...session.user, permissions };
    request.sessionId = session.id;

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && required.length > 0) {
      for (const permission of required) {
        if (!this.authz.hasPermission(session.user, permission)) {
          throw forbidden(`Missing permission: ${permission}`);
        }
      }
    }
    return true;
  }
}

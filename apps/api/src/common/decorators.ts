import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthUser, Permission } from '@vams/shared';
import type { Request } from 'express';
import { PERMISSIONS_METADATA, PUBLIC_METADATA } from './metadata';

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const Public = () => SetMetadata(PUBLIC_METADATA, true);

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_METADATA, permissions);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<Request & { user: AuthUser }>();
    return request.user;
  },
);

export function requestContext(request: Request): RequestContext {
  const decorated = request as Request & { requestId?: string };
  return {
    ip: request.ip ?? null,
    userAgent: request.header('user-agent') ?? null,
    requestId: decorated.requestId ?? null,
  };
}

import { HttpException } from '@nestjs/common';

export function apiError(
  status: number,
  code: string,
  title: string,
  detail?: string,
  errors?: Record<string, string>,
): HttpException {
  return new HttpException(
    {
      status,
      code,
      title,
      detail: detail ?? title,
      ...(errors ? { errors } : {}),
    },
    status,
  );
}

export function unauthorized(code = 'UNAUTHENTICATED', detail = 'Sign in to continue'): HttpException {
  return apiError(401, code, 'Authentication required', detail);
}

export function forbidden(detail = 'You do not have permission to perform this action'): HttpException {
  return apiError(403, 'FORBIDDEN', 'Access denied', detail);
}

export function badRequest(
  code: string,
  title: string,
  detail?: string,
  errors?: Record<string, string>,
): HttpException {
  return apiError(400, code, title, detail, errors);
}

export function notFound(entity = 'Record', code = 'NOT_FOUND'): HttpException {
  return apiError(404, code, `${entity} not found`, `The requested ${entity.toLowerCase()} does not exist.`);
}

export function conflict(code: string, title: string, detail?: string): HttpException {
  return apiError(409, code, title, detail);
}

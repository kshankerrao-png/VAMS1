import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ProblemBody {
  status?: number;
  code?: string;
  title?: string;
  detail?: string;
  errors?: Record<string, string>;
}

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
};

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal server error';
    let detail = 'An unexpected error occurred. Please try again.';
    let code = 'INTERNAL_ERROR';
    let errors: Record<string, string> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        title = body;
        detail = body;
      } else if (body && typeof body === 'object') {
        const problem = body as ProblemBody;
        title = problem.title ?? exception.message;
        detail = problem.detail ?? exception.message;
        code = problem.code ?? DEFAULT_CODES[status] ?? 'ERROR';
        errors = problem.errors;
      }
      code = code && code !== 'ERROR' ? code : DEFAULT_CODES[status] ?? 'ERROR';
    } else {
      this.logger.error(
        exception instanceof Error ? exception.stack ?? exception.message : String(exception),
      );
    }

    response.status(status).type('application/problem+json').json({
      type: `https://vams.local/problems/${String(code).toLowerCase()}`,
      title,
      status,
      detail,
      code,
      requestId: request.requestId ?? null,
      ...(errors ? { errors } : {}),
    });
  }
}

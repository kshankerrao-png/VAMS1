import { z } from 'zod';
import { badRequest } from './errors';

export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.map(String).join('.') || '_';
      if (!errors[key]) errors[key] = issue.message;
    }
    throw badRequest('VALIDATION_ERROR', 'Validation failed', 'Some fields need attention.', errors);
  }
  return result.data;
}

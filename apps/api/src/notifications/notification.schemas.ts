import { z } from 'zod';

export const notificationChannelQuerySchema = z.object({
  requestId: z.string().uuid('A valid requestId is required'),
});

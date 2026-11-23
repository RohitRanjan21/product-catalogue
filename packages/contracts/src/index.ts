import { z } from 'zod';

export * from './catalogue';
export * from './enquiry';
export * from './errors';

export const HealthResponseSchema = z.object({ status: z.literal('ok') });
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

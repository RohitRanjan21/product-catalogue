import { z } from 'zod';

/**
 * `POST /api/enquiries` body (A5). Strict: unknown fields are rejected.
 * Optional fields are omitted when empty; the client must not send "".
 */
export const EnquiryRequestSchema = z.strictObject({
  productId: z.number().int().positive(),
  name: z.string().trim().min(1, 'Enter your name').max(100, 'Name is too long'),
  email: z.string().trim().max(254).pipe(z.email('Enter a valid email address')),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{6,20}$/, 'Enter a valid phone number')
    .optional(),
  message: z.string().trim().max(1000, 'Message must be 1000 characters or fewer').optional(),
});
export type EnquiryRequest = z.infer<typeof EnquiryRequestSchema>;

export const EnquiryResponseSchema = z.object({
  enquiryId: z.uuid(),
});
export type EnquiryResponse = z.infer<typeof EnquiryResponseSchema>;

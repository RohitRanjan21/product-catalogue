import { EnquiryRequestSchema, type EnquiryResponse } from '@catalogue/contracts';
import type { FastifyInstance } from 'fastify';
import type { EnquiryService } from '../services/enquiry-service';
import { parseInput } from '../validation';

export function registerEnquiryRoutes(
  app: FastifyInstance,
  enquiries: EnquiryService,
  options: { rateLimitPerMinute: number },
): void {
  app.post(
    '/api/enquiries',
    // Checked in onRequest, before the body is parsed. Keyed by client IP (see TRUST_PROXY).
    { config: { rateLimit: { max: options.rateLimitPerMinute, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const enquiry = parseInput(EnquiryRequestSchema, request.body);
      const result: EnquiryResponse = await enquiries.submit(enquiry);
      // Ids only: customer contact details are never logged.
      request.log.info({ enquiryId: result.enquiryId, productId: enquiry.productId }, 'Enquiry sent');
      return reply.status(202).send(result);
    },
  );
}

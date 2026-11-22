import { randomUUID } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import type { HealthResponse } from '@catalogue/contracts';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { RateLimitError } from './errors';
import { handleError, handleNotFound } from './http/error-handler';
import type { EmailSender, ProductSource } from './ports';
import { registerCatalogueRoutes } from './routes/catalogue-routes';
import { registerEnquiryRoutes } from './routes/enquiry-routes';
import { CatalogueService } from './services/catalogue-service';
import { EnquiryService } from './services/enquiry-service';

export interface AppDeps {
  productSource: ProductSource;
  emailSender: EmailSender;
  config: {
    featuredProductIds: readonly number[];
    salesInboxEmail: string;
    enquiryRateLimitPerMinute: number;
    /** Trust X-Forwarded-For (only behind our own proxy), so rate limits see the real client IP. */
    trustProxy: boolean;
  };
  /** A pino logger. Omit it (tests) to log nothing. */
  logger?: FastifyBaseLogger;
}

/** Enquiries are a few hundred bytes; anything near this is not a real request. */
const BODY_LIMIT_BYTES = 16 * 1024;

/** Composition root: the one place ports, services and routes are wired together. */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    ...(deps.logger ? { loggerInstance: deps.logger } : { logger: false }),
    genReqId: () => randomUUID(),
    trustProxy: deps.config.trustProxy,
    bodyLimit: BODY_LIMIT_BYTES,
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
  app.setErrorHandler(handleError);
  app.setNotFoundHandler(handleNotFound);

  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      new RateLimitError(`Too many enquiries. Please try again in ${context.after}.`),
  });

  const catalogue = new CatalogueService({
    productSource: deps.productSource,
    featuredProductIds: deps.config.featuredProductIds,
    log: app.log,
  });
  const enquiries = new EnquiryService({
    productSource: deps.productSource,
    emailSender: deps.emailSender,
    salesInboxEmail: deps.config.salesInboxEmail,
  });

  app.get('/api/health', (): HealthResponse => ({ status: 'ok' }));
  registerCatalogueRoutes(app, catalogue);
  registerEnquiryRoutes(app, enquiries, { rateLimitPerMinute: deps.config.enquiryRateLimitPerMinute });

  return app;
}

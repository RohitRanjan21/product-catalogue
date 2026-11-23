import { pino } from 'pino';
import { FakeStoreProductSource } from './adapters/fake-store-product-source';
import { SmtpEmailSender } from './adapters/smtp-email-sender';
import { buildApp } from './app';
import { ConfigError, loadConfig, type Config } from './config';

async function main(config: Config): Promise<void> {
  const logger = pino({ level: config.server.logLevel, base: { service: 'catalogue-api' } });

  const app = await buildApp({
    productSource: new FakeStoreProductSource({ ...config.fakeStore, log: logger }),
    emailSender: SmtpEmailSender.fromConfig(config.smtp),
    config: {
      featuredProductIds: config.catalogue.featuredProductIds,
      salesInboxEmail: config.enquiries.salesInboxEmail,
      enquiryRateLimitPerMinute: config.enquiries.rateLimitPerMinute,
      trustProxy: config.server.trustProxy,
    },
    logger,
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, 'Shutting down');
      app.close().then(
        () => process.exit(0),
        (error: unknown) => {
          app.log.error({ err: error }, 'Shutdown failed');
          process.exit(1);
        },
      );
    });
  }

  await app.listen({ host: config.server.host, port: config.server.port });
}

try {
  await main(loadConfig(process.env));
} catch (error) {
  // Config errors are printed plainly (no logger exists yet); they name variables, never values.
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
}

import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
const positiveInt = z.coerce.number().int().positive();

const featuredIds = z
  .string()
  .default('3,5,11,12,18')
  .transform((value) => value.split(',').map((id) => id.trim()))
  .pipe(z.array(z.string().regex(/^[1-9]\d*$/, 'must be a comma-separated list of product ids')))
  .transform((ids) => ids.map(Number))
  .pipe(
    z
      .array(z.number())
      .length(5, 'must list exactly 5 product ids')
      .refine((ids) => new Set(ids).size === ids.length, 'must not repeat a product id'),
  );

const EnvSchema = z
  .object({
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: port.default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    TRUST_PROXY: z.stringbool().default(false),

    FAKESTORE_BASE_URL: z.url().default('https://fakestoreapi.com'),
    UPSTREAM_TIMEOUT_MS: positiveInt.default(5000),
    CATALOGUE_CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(300),
    FEATURED_PRODUCT_IDS: featuredIds,

    SALES_INBOX_EMAIL: z.email().default('sales@example.com'),
    ENQUIRY_FROM_EMAIL: z.email().default('catalogue@example.com'),
    ENQUIRY_RATE_LIMIT_PER_MINUTE: positiveInt.default(5),

    SMTP_HOST: z.string().min(1).default('localhost'),
    SMTP_PORT: port.default(1025),
    SMTP_SECURE: z.stringbool().default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_TIMEOUT_MS: positiveInt.default(10000),
  })
  .refine((env) => (env.SMTP_USER === undefined) === (env.SMTP_PASS === undefined), {
    message: 'set both SMTP_USER and SMTP_PASS, or neither',
    path: ['SMTP_USER'],
  });

export interface Config {
  server: { host: string; port: number; logLevel: string; trustProxy: boolean };
  catalogue: { featuredProductIds: number[] };
  fakeStore: { baseUrl: string; timeoutMs: number; cacheTtlMs: number };
  enquiries: { salesInboxEmail: string; rateLimitPerMinute: number };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
    timeoutMs: number;
    from: string;
  };
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/**
 * Validate the environment once at startup. Empty values count as unset, so `SMTP_USER=` in a
 * .env file falls back to the default. Error messages name the variable, never its value.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const provided = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const result = EnvSchema.safeParse(provided);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigError(`Invalid configuration:\n${problems.join('\n')}`);
  }
  const e = result.data;
  return {
    server: { host: e.HOST, port: e.PORT, logLevel: e.LOG_LEVEL, trustProxy: e.TRUST_PROXY },
    catalogue: { featuredProductIds: e.FEATURED_PRODUCT_IDS },
    fakeStore: {
      baseUrl: e.FAKESTORE_BASE_URL,
      timeoutMs: e.UPSTREAM_TIMEOUT_MS,
      cacheTtlMs: e.CATALOGUE_CACHE_TTL_SECONDS * 1000,
    },
    enquiries: {
      salesInboxEmail: e.SALES_INBOX_EMAIL,
      rateLimitPerMinute: e.ENQUIRY_RATE_LIMIT_PER_MINUTE,
    },
    smtp: {
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE,
      ...(e.SMTP_USER !== undefined && e.SMTP_PASS !== undefined
        ? { auth: { user: e.SMTP_USER, pass: e.SMTP_PASS } }
        : {}),
      timeoutMs: e.SMTP_TIMEOUT_MS,
      from: e.ENQUIRY_FROM_EMAIL,
    },
  };
}

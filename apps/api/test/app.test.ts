import { Writable } from 'node:stream';
import {
  CategoryProductsSchema,
  CategorySchema,
  EnquiryResponseSchema,
  ErrorResponseSchema,
  HealthResponseSchema,
  ProductSchema,
} from '@catalogue/contracts';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppDeps } from '../src/app';
import { UpstreamError } from '../src/errors';
import { FAKE_PNG, InMemoryProductSource, RecordingEmailSender } from './fakes';

const ProductListSchema = ProductSchema.array();

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function setup(overrides: Partial<AppDeps['config']> = {}, logger?: AppDeps['logger']) {
  const productSource = new InMemoryProductSource();
  const emailSender = new RecordingEmailSender();
  app = await buildApp({
    productSource,
    emailSender,
    config: {
      featuredProductIds: [8, 3, 4, 6, 1],
      salesInboxEmail: 'sales@example.com',
      enquiryRateLimitPerMinute: 100,
      trustProxy: false,
      ...overrides,
    },
    ...(logger ? { logger } : {}),
  });
  return { app, productSource, emailSender };
}

function expectError(response: { statusCode: number; json: () => unknown }, status: number, code: string) {
  expect(response.statusCode).toBe(status);
  const body = ErrorResponseSchema.parse(response.json());
  expect(body.error.code).toBe(code);
  return body.error;
}

const ids = (products: { id: number }[]) => products.map((p) => p.id);

describe('GET /api/health', () => {
  it('reports ok and returns a request id', async () => {
    const { app } = await setup();
    const response = await app.inject('/api/health');
    expect(response.statusCode).toBe(200);
    expect(HealthResponseSchema.parse(response.json())).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('GET /api/categories', () => {
  it('lists categories by name', async () => {
    const { app } = await setup();
    const response = await app.inject('/api/categories');
    expect(response.statusCode).toBe(200);
    expect(CategorySchema.array().parse(response.json()).map((c) => c.slug)).toEqual([
      'electronics',
      'jewelery',
      'mens-clothing',
    ]);
  });
});

describe('GET /api/products/featured', () => {
  it('returns the 5 configured products in order', async () => {
    const { app } = await setup();
    const response = await app.inject('/api/products/featured');
    expect(response.statusCode).toBe(200);
    expect(ids(ProductListSchema.parse(response.json()))).toEqual([8, 3, 4, 6, 1]);
  });
});

describe('GET /api/categories/:slug/products', () => {
  it('splits a category into top rated and more', async () => {
    const { app } = await setup();
    const response = await app.inject('/api/categories/electronics/products');
    expect(response.statusCode).toBe(200);
    const body = CategoryProductsSchema.parse(response.json());
    expect(body.category.name).toBe('Electronics');
    expect(ids(body.topRated)).toEqual([6, 4, 7]);
    expect(ids(body.more)).toEqual([5]);
  });

  it('404s for an unknown category', async () => {
    const { app } = await setup();
    expectError(await app.inject('/api/categories/garden/products'), 404, 'NOT_FOUND');
  });

  it('400s for a malformed slug', async () => {
    const { app } = await setup();
    expectError(await app.inject('/api/categories/Not%20A%20Slug/products'), 400, 'VALIDATION_ERROR');
  });
});

describe('GET /api/products/search', () => {
  it('returns only matching products', async () => {
    const { app } = await setup();
    const response = await app.inject({ url: '/api/products/search', query: { q: '  JACKET ' } });
    expect(response.statusCode).toBe(200);
    expect(ids(ProductListSchema.parse(response.json()))).toEqual([3]);
  });

  it('returns an empty list when nothing matches', async () => {
    const { app } = await setup();
    const response = await app.inject({ url: '/api/products/search', query: { q: 'kettle' } });
    expect(response.json()).toEqual([]);
  });

  it.each([
    ['missing', '/api/products/search'],
    ['blank', '/api/products/search?q=%20%20'],
    ['too long', `/api/products/search?q=${'x'.repeat(101)}`],
    ['repeated', '/api/products/search?q=a&q=b'],
  ])('400s when the term is %s', async (_label, url) => {
    const { app } = await setup();
    const error = expectError(await app.inject(url), 400, 'VALIDATION_ERROR');
    expect(error.details?.[0]?.path).toBe('q');
  });
});

describe('GET /api/products/:id', () => {
  it('returns the product', async () => {
    const { app } = await setup();
    const response = await app.inject('/api/products/3');
    expect(response.statusCode).toBe(200);
    expect(ProductSchema.parse(response.json()).title).toBe('Cotton Jacket');
  });

  it('404s for an unknown id', async () => {
    const { app } = await setup();
    expectError(await app.inject('/api/products/999'), 404, 'NOT_FOUND');
  });

  it.each(['abc', '0', '1.5'])('400s for id %j', async (id) => {
    const { app } = await setup();
    expectError(await app.inject(`/api/products/${id}`), 400, 'VALIDATION_ERROR');
  });
});

describe('product images', () => {
  it("never exposes the source's image URL: every product points at our image endpoint", async () => {
    const { app } = await setup();
    const featured = ProductListSchema.parse((await app.inject('/api/products/featured')).json());
    expect(featured.map((p) => p.imageUrl)).toEqual([8, 3, 4, 6, 1].map((id) => `/api/products/${id}/image`));
    const response = await app.inject('/api/products/3');
    expect(response.body).not.toContain('images.example.com');
  });

  it('serves the image bytes with a safe content type and caching', async () => {
    const { app } = await setup();
    const response = await app.inject('/api/products/3/image');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['cache-control']).toBe('public, max-age=86400');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(new Uint8Array(response.rawPayload)).toEqual(FAKE_PNG);
  });

  it('404s for an unknown product and 400s for a bad id', async () => {
    const { app } = await setup();
    expectError(await app.inject('/api/products/999/image'), 404, 'NOT_FOUND');
    expectError(await app.inject('/api/products/abc/image'), 400, 'VALIDATION_ERROR');
  });

  it('502s when the source cannot provide the image', async () => {
    const { app, productSource } = await setup();
    productSource.failWith = new UpstreamError('The product image is unavailable right now.');
    expectError(await app.inject('/api/products/3/image'), 502, 'UPSTREAM_ERROR');
  });
});

describe('upstream and unexpected failures', () => {
  it('502s with a safe message when the product source is down', async () => {
    const { app, productSource } = await setup();
    productSource.failWith = new UpstreamError('The product catalogue is unavailable right now.', {
      cause: new Error('Fake Store responded with HTTP 503: <html>secret upstream page</html>'),
    });
    const response = await app.inject('/api/products/featured');
    expectError(response, 502, 'UPSTREAM_ERROR');
    expect(response.body).not.toContain('secret upstream page');
  });

  it('500s without leaking the error or stack trace', async () => {
    const { app, productSource } = await setup();
    productSource.failWith = new Error('db password is hunter2');
    const response = await app.inject('/api/categories');
    const error = expectError(response, 500, 'INTERNAL_ERROR');
    expect(error.message).toBe('Something went wrong');
    expect(response.body).not.toContain('hunter2');
    expect(response.body).not.toContain('at ');
  });

  it('404s unknown routes with the standard error shape', async () => {
    const { app } = await setup();
    expectError(await app.inject('/api/nope'), 404, 'NOT_FOUND');
  });
});

describe('POST /api/enquiries', () => {
  const enquiry = {
    productId: 3,
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '0412 345 678',
    message: 'Do you have this in blue?',
  };

  it('emails the sales inbox once and returns 202 with an enquiry id', async () => {
    const { app, emailSender } = await setup();
    const response = await app.inject({ method: 'POST', url: '/api/enquiries', payload: enquiry });

    expect(response.statusCode).toBe(202);
    const { enquiryId } = EnquiryResponseSchema.parse(response.json());
    expect(emailSender.sent).toHaveLength(1);
    const [email] = emailSender.sent;
    expect(email?.to).toBe('sales@example.com');
    expect(email?.replyTo).toEqual({ name: 'Ada Lovelace', address: 'ada@example.com' });
    expect(email?.subject).toBe('Product enquiry: Cotton Jacket');
    expect(email?.text).toContain('Do you have this in blue?');
    expect(email?.text).toContain(enquiryId);
  });

  it('rejects unknown fields, such as a client-supplied product title', async () => {
    const { app, emailSender } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/enquiries',
      payload: { ...enquiry, productTitle: 'FREE PRIZE' },
    });
    expectError(response, 400, 'VALIDATION_ERROR');
    expect(emailSender.sent).toEqual([]);
  });

  it('returns field-level details for invalid contact details', async () => {
    const { app } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/enquiries',
      payload: { ...enquiry, name: ' ', email: 'nope' },
    });
    const error = expectError(response, 400, 'VALIDATION_ERROR');
    expect(error.details?.map((d) => d.path).sort()).toEqual(['email', 'name']);
  });

  it('rejects an enquiry for a product that does not exist', async () => {
    const { app, emailSender } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/enquiries',
      payload: { ...enquiry, productId: 999 },
    });
    const error = expectError(response, 400, 'VALIDATION_ERROR');
    expect(error.details).toEqual([{ path: 'productId', message: 'This product is no longer available' }]);
    expect(emailSender.sent).toEqual([]);
  });

  it('400s on malformed JSON with the standard error shape', async () => {
    const { app } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/enquiries',
      headers: { 'content-type': 'application/json' },
      payload: '{"productId": 3,',
    });
    expectError(response, 400, 'BAD_REQUEST');
  });

  it('rejects oversized bodies', async () => {
    const { app } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/enquiries',
      payload: { ...enquiry, message: 'x'.repeat(20_000) },
    });
    expectError(response, 413, 'BAD_REQUEST');
  });

  it('502s when the email provider fails', async () => {
    const { app, emailSender } = await setup();
    emailSender.failWith = new UpstreamError('We could not send your enquiry. Please try again later.');
    const response = await app.inject({ method: 'POST', url: '/api/enquiries', payload: enquiry });
    const error = expectError(response, 502, 'UPSTREAM_ERROR');
    expect(error.message).toBe('We could not send your enquiry. Please try again later.');
  });

  it('429s after the per-minute limit, before sending more email', async () => {
    const { app, emailSender } = await setup({ enquiryRateLimitPerMinute: 2 });
    const send = () => app.inject({ method: 'POST', url: '/api/enquiries', payload: enquiry });

    expect((await send()).statusCode).toBe(202);
    expect((await send()).statusCode).toBe(202);
    const limited = await send();
    expectError(limited, 429, 'RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();
    expect(emailSender.sent).toHaveLength(2);
  });

  it('does not rate limit catalogue reads', async () => {
    const { app } = await setup({ enquiryRateLimitPerMinute: 1 });
    for (let i = 0; i < 3; i += 1) {
      expect((await app.inject('/api/products/featured')).statusCode).toBe(200);
    }
  });

  it('never writes customer contact details to the logs', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const { app, emailSender } = await setup({}, pino({ level: 'trace' }, stream));

    const ok = await app.inject({ method: 'POST', url: '/api/enquiries', payload: enquiry });
    await app.inject({ method: 'POST', url: '/api/enquiries', payload: { ...enquiry, email: 'bad' } });
    emailSender.failWith = new UpstreamError('We could not send your enquiry.');
    await app.inject({ method: 'POST', url: '/api/enquiries', payload: enquiry });

    const logs = lines.join('');
    expect(logs).toContain(EnquiryResponseSchema.parse(ok.json()).enquiryId);
    for (const secret of [enquiry.name, enquiry.email, enquiry.phone, enquiry.message]) {
      expect(logs).not.toContain(secret);
    }
  });
});

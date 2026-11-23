import { describe, expect, it, vi } from 'vitest';
import { RecordingLogger } from '../../test/fakes';
import { UpstreamError } from '../errors';
import { FakeStoreProductSource, MAX_IMAGE_BYTES, toCategory } from './fake-store-product-source';

/** Trimmed copies of real Fake Store items (checked 2026-11-22), including the trailing space. */
const upstreamProducts = [
  {
    id: 2,
    title: 'Mens Casual Premium Slim Fit T-Shirts ',
    price: 22.3,
    description: 'Slim-fitting style.',
    category: "men's clothing",
    image: 'https://fakestoreapi.com/img/71-3HjGNDUL._AC_SY879._SX._UX._SY._UY_t.png',
    rating: { rate: 4.1, count: 259 },
  },
  {
    id: 9,
    title: 'WD 2TB Elements Portable External Hard Drive - USB 3.0',
    price: 64,
    description: 'USB 3.0 and USB 2.0 compatibility.',
    category: 'electronics',
    image: 'https://fakestoreapi.com/img/61IBBVJvSDL._AC_SY879_t.png',
    rating: { rate: 3.3, count: 203 },
  },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function setup(fetchFn: typeof fetch, { timeoutMs = 1000, cacheTtlMs = 60_000 } = {}) {
  let now = 0;
  const log = new RecordingLogger();
  const source = new FakeStoreProductSource({
    baseUrl: 'https://fakestore.test',
    timeoutMs,
    cacheTtlMs,
    log,
    fetchFn,
    now: () => now,
  });
  return { source, log, advance: (ms: number) => (now += ms) };
}

describe('FakeStoreProductSource mapping', () => {
  it('maps Fake Store products to our Product shape', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json(upstreamProducts));
    const { source } = setup(fetchFn);

    expect(await source.getProduct(2)).toEqual({
      id: 2,
      title: 'Mens Casual Premium Slim Fit T-Shirts',
      price: 22.3,
      description: 'Slim-fitting style.',
      category: { slug: 'mens-clothing', name: "Men's clothing" },
      imageUrl: 'https://fakestoreapi.com/img/71-3HjGNDUL._AC_SY879._SX._UX._SY._UY_t.png',
      rating: { rate: 4.1, count: 259 },
    });
    expect(fetchFn).toHaveBeenCalledWith(new URL('https://fakestore.test/products'), expect.anything());
  });

  it('derives categories from the products, sorted by name', async () => {
    const { source } = setup(vi.fn<typeof fetch>().mockResolvedValue(json(upstreamProducts)));
    expect(await source.listCategories()).toEqual([
      { slug: 'electronics', name: 'Electronics' },
      { slug: 'mens-clothing', name: "Men's clothing" },
    ]);
  });

  it('returns undefined for an unknown id', async () => {
    const { source } = setup(vi.fn<typeof fetch>().mockResolvedValue(json(upstreamProducts)));
    expect(await source.getProduct(999)).toBeUndefined();
  });

  it('skips invalid items and logs them instead of failing the whole catalogue', async () => {
    const broken = { ...upstreamProducts[1], image: 'not a url' };
    const { source, log } = setup(vi.fn<typeof fetch>().mockResolvedValue(json([upstreamProducts[0], broken])));
    expect((await source.listProducts()).map((p) => p.id)).toEqual([2]);
    expect(log.entries).toEqual([expect.objectContaining({ level: 'warn', details: { index: 1, issues: 1 } })]);
  });

  it.each([
    ["men's clothing", { slug: 'mens-clothing', name: "Men's clothing" }],
    ['jewelery', { slug: 'jewelery', name: 'Jewelery' }],
    ['Home & Garden ', { slug: 'home-garden', name: 'Home & Garden ' }],
  ])('turns %j into a category', (raw, expected) => {
    expect(toCategory(raw)).toEqual(expected);
  });
});

describe('FakeStoreProductSource caching', () => {
  it('calls Fake Store once within the TTL and again after it', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(json(upstreamProducts)));
    const { source, advance } = setup(fetchFn, { cacheTtlMs: 1000 });

    await source.listProducts();
    await source.getProduct(2);
    await source.listCategories();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    advance(1000);
    await source.listProducts();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('shares one request between concurrent cache misses', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(json(upstreamProducts)));
    const { source } = setup(fetchFn);
    await Promise.all([source.listProducts(), source.getProduct(9), source.listCategories()]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure: the next call tries again', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(json(upstreamProducts));
    const { source } = setup(fetchFn);
    await expect(source.listProducts()).rejects.toBeInstanceOf(UpstreamError);
    expect(await source.listProducts()).toHaveLength(2);
  });

  it('serves the stale catalogue when a refresh fails', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(upstreamProducts))
      .mockResolvedValueOnce(json({ message: 'down' }, 503));
    const { source, log, advance } = setup(fetchFn, { cacheTtlMs: 1000 });

    await source.listProducts();
    advance(5000);
    expect(await source.listProducts()).toHaveLength(2);
    expect(log.entries).toEqual([expect.objectContaining({ level: 'warn' })]);
  });
});

describe('FakeStoreProductSource failures', () => {
  const failures: [string, typeof fetch][] = [
    ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
    ['a non-2xx status', () => Promise.resolve(json({ message: 'nope' }, 500))],
    ['a body that is not JSON', () => Promise.resolve(new Response('<html>oops</html>', { status: 200 }))],
    ['an empty body', () => Promise.resolve(new Response('', { status: 200 }))],
    ['JSON that is not a list', () => Promise.resolve(json({ products: [] }))],
  ];

  it.each(failures)('turns %s into an UpstreamError with a safe message', async (_label, fetchFn) => {
    const { source } = setup(fetchFn);
    const error = await source.listProducts().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect((error as UpstreamError).message).toBe(
      'The product catalogue is unavailable right now. Please try again later.',
    );
    expect((error as UpstreamError).cause).toBeDefined();
  });

  it('gives up after the timeout', async () => {
    // A fetch that never answers, but honours the abort signal like the real one.
    const hangingFetch: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => {
          const reason: unknown = signal.reason;
          reject(reason instanceof Error ? reason : new Error('aborted'));
        });
      });
    const { source } = setup(hangingFetch, { timeoutMs: 20 });

    const error = await source.listProducts().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect((error as UpstreamError).cause).toMatchObject({ name: 'TimeoutError' });
  });
});

describe('FakeStoreProductSource.getProductImage', () => {
  const imageUrl = upstreamProducts[0]!.image;
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  /** Serves the catalogue from /products and answers image requests with `image()`. */
  function withImage(image: () => Response | Promise<Response>) {
    return vi.fn<typeof fetch>((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      return Promise.resolve(url.endsWith('/products') ? json(upstreamProducts) : image());
    });
  }

  it("fetches the image from the URL in the catalogue and returns its bytes and type", async () => {
    const fetchFn = withImage(() => new Response(png, { headers: { 'content-type': 'image/png; charset=binary' } }));
    const { source } = setup(fetchFn);

    expect(await source.getProductImage(2)).toEqual({ contentType: 'image/png', data: png });
    expect(fetchFn).toHaveBeenLastCalledWith(imageUrl, expect.anything());
  });

  it('returns undefined for an unknown product without fetching anything else', async () => {
    const fetchFn = withImage(() => new Response(png));
    const { source } = setup(fetchFn);
    expect(await source.getProductImage(999)).toBeUndefined();
    expect(fetchFn).toHaveBeenCalledTimes(1); // only the catalogue
  });

  const failures: [string, () => Response | Promise<Response>][] = [
    ['an SVG (could carry script)', () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })],
    ['an HTML error page', () => new Response('<html/>', { headers: { 'content-type': 'text/html' } })],
    ['no content type', () => new Response(png)],
    ['a non-2xx status', () => new Response('gone', { status: 404, headers: { 'content-type': 'image/png' } })],
    [
      'a declared size over the limit',
      () => new Response(png, { headers: { 'content-type': 'image/png', 'content-length': String(MAX_IMAGE_BYTES + 1) } }),
    ],
    [
      'an actual size over the limit',
      () => new Response(new Uint8Array(MAX_IMAGE_BYTES + 1), { headers: { 'content-type': 'image/jpeg' } }),
    ],
    ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
  ];

  it.each(failures)('refuses %s with an UpstreamError', async (_label, image) => {
    const { source } = setup(withImage(image));
    const error = await source.getProductImage(2).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect((error as UpstreamError).message).toBe('The product image is unavailable right now.');
  });
});

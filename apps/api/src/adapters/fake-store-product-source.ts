import type { Category, Product } from '@catalogue/contracts';
import { z } from 'zod';
import { UpstreamError } from '../errors';
import type { Logger, ProductSource } from '../ports';

/** Fake Store's product shape. It is used in this file only and mapped to our `Product`. */
const FakeStoreProductSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(1),
  price: z.number().nonnegative(),
  description: z.string(),
  category: z.string().trim().min(1),
  image: z.url(),
  rating: z.object({
    rate: z.number().min(0).max(5),
    count: z.number().int().nonnegative(),
  }),
});
type FakeStoreProduct = z.infer<typeof FakeStoreProductSchema>;

const UNAVAILABLE = 'The product catalogue is unavailable right now. Please try again later.';

export interface FakeStoreOptions {
  baseUrl: string;
  timeoutMs: number;
  cacheTtlMs: number;
  log: Logger;
  fetchFn?: typeof fetch;
  now?: () => number;
}

/**
 * Reads the whole catalogue (20 products) with one call and keeps it in memory for `cacheTtlMs`.
 * Single products are served from that list: Fake Store answers `/products/<unknown id>` with
 * 200 and an empty body, so its per-product endpoint can't tell us "not found" reliably.
 * Concurrent cache misses share one request; if a refresh fails, the stale list is served.
 */
export class FakeStoreProductSource implements ProductSource {
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private cache: { products: Product[]; expiresAt: number } | undefined;
  private inFlight: Promise<Product[]> | undefined;

  constructor(private readonly options: FakeStoreOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? Date.now;
  }

  listProducts(): Promise<Product[]> {
    return this.load();
  }

  async listCategories(): Promise<Category[]> {
    const bySlug = new Map<string, Category>();
    for (const { category } of await this.load()) bySlug.set(category.slug, category);
    return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getProduct(id: number): Promise<Product | undefined> {
    return (await this.load()).find((product) => product.id === id);
  }

  private load(): Promise<Product[]> {
    if (this.cache && this.now() < this.cache.expiresAt) return Promise.resolve(this.cache.products);

    this.inFlight ??= this.fetchProducts()
      .then((products) => {
        this.cache = { products, expiresAt: this.now() + this.options.cacheTtlMs };
        return products;
      })
      .catch((error: unknown) => {
        if (!this.cache) throw error;
        this.options.log.warn({ err: error }, 'Fake Store refresh failed; serving stale catalogue');
        return this.cache.products;
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }

  private async fetchProducts(): Promise<Product[]> {
    const url = new URL('/products', this.options.baseUrl);
    let body: unknown;
    try {
      const response = await this.fetchFn(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
      if (!response.ok) {
        throw new UpstreamError(UNAVAILABLE, {
          cause: new Error(`Fake Store responded with HTTP ${response.status}`),
        });
      }
      body = await response.json();
    } catch (error) {
      if (error instanceof UpstreamError) throw error;
      throw new UpstreamError(UNAVAILABLE, { cause: error });
    }

    if (!Array.isArray(body)) {
      throw new UpstreamError(UNAVAILABLE, { cause: new Error('Fake Store did not return a list') });
    }

    const products: Product[] = [];
    body.forEach((item: unknown, index) => {
      const parsed = FakeStoreProductSchema.safeParse(item);
      if (parsed.success) products.push(toProduct(parsed.data));
      else this.options.log.warn({ index, issues: parsed.error.issues.length }, 'Skipping invalid Fake Store product');
    });
    return products;
  }
}

function toProduct(raw: FakeStoreProduct): Product {
  return {
    id: raw.id,
    title: raw.title,
    price: raw.price,
    description: raw.description.trim(),
    category: toCategory(raw.category),
    imageUrl: raw.image,
    rating: raw.rating,
  };
}

/** "men's clothing" -> { slug: "mens-clothing", name: "Men's clothing" } */
export function toCategory(raw: string): Category {
  const slug = raw
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return { slug, name: raw.charAt(0).toUpperCase() + raw.slice(1) };
}

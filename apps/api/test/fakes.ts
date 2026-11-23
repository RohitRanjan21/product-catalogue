import type { Category } from '@catalogue/contracts';
import type { EmailMessage, EmailSender, Logger, ProductImage, ProductSource, SourceProduct } from '../src/ports';

const categories = {
  electronics: { slug: 'electronics', name: 'Electronics' },
  jewelery: { slug: 'jewelery', name: 'Jewelery' },
  mens: { slug: 'mens-clothing', name: "Men's clothing" },
} satisfies Record<string, Category>;

export function makeProduct(
  id: number,
  category: Category,
  rate: number,
  count: number,
  overrides: Partial<SourceProduct> = {},
): SourceProduct {
  return {
    id,
    title: `Product ${id}`,
    price: 10 + id,
    description: `Description of product ${id}`,
    category,
    imageUrl: `https://images.example.com/${id}.png`,
    rating: { rate, count },
    ...overrides,
  };
}

/**
 * A small catalogue with more than 3 products in one category and a rating tie (4 and 6) where
 * the higher id has more reviews, so only the review-count rule (not the id fallback) orders them.
 */
export const fixtureProducts: SourceProduct[] = [
  makeProduct(1, categories.mens, 3.9, 120, { title: 'Everyday Backpack' }),
  makeProduct(2, categories.mens, 4.1, 259, { title: 'Slim Fit T-Shirt' }),
  makeProduct(3, categories.mens, 4.7, 500, { title: 'Cotton Jacket' }),
  makeProduct(4, categories.electronics, 4.8, 100, { title: 'Portable SSD' }),
  makeProduct(5, categories.electronics, 2.9, 250, { title: 'Gaming Monitor' }),
  makeProduct(6, categories.electronics, 4.8, 300, {
    title: 'Wireless Mouse',
    description: 'Quiet clicks, long battery life',
  }),
  makeProduct(7, categories.electronics, 3.3, 203, { title: 'USB Hub' }),
  makeProduct(8, categories.jewelery, 4.6, 400, { title: 'Silver Ring' }),
];

/** The 8-byte PNG signature: enough to recognise in a response. */
export const FAKE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class InMemoryProductSource implements ProductSource {
  /** When set, every call rejects with this error (simulates the upstream being down). */
  failWith: Error | undefined;

  constructor(public products: SourceProduct[] = fixtureProducts) {}

  listProducts(): Promise<SourceProduct[]> {
    return this.result(() => this.products);
  }

  listCategories(): Promise<Category[]> {
    return this.result(() => {
      const bySlug = new Map(this.products.map((p) => [p.category.slug, p.category]));
      return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  getProduct(id: number): Promise<SourceProduct | undefined> {
    return this.result(() => this.products.find((p) => p.id === id));
  }

  /** Every product has the same tiny "image"; unknown ids resolve to undefined. */
  getProductImage(id: number): Promise<ProductImage | undefined> {
    return this.result(() =>
      this.products.some((p) => p.id === id) ? { contentType: 'image/png', data: FAKE_PNG } : undefined,
    );
  }

  private result<T>(value: () => T): Promise<T> {
    return this.failWith ? Promise.reject(this.failWith) : Promise.resolve(value());
  }
}

export class RecordingEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  failWith: Error | undefined;

  send(message: EmailMessage): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.sent.push(message);
    return Promise.resolve();
  }
}

export class RecordingLogger implements Logger {
  readonly entries: { level: 'info' | 'warn' | 'error'; details: object; message: string }[] = [];

  info(details: object, message: string): void {
    this.entries.push({ level: 'info', details, message });
  }
  warn(details: object, message: string): void {
    this.entries.push({ level: 'warn', details, message });
  }
  error(details: object, message: string): void {
    this.entries.push({ level: 'error', details, message });
  }
}

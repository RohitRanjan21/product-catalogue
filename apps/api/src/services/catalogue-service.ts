import type { Category, CategoryProducts, Product } from '@catalogue/contracts';
import { NotFoundError } from '../errors';
import type { Logger, ProductSource } from '../ports';

/** How many products a category page shows as "Top rated" (A2). */
export const TOP_RATED_PER_CATEGORY = 3;

export interface CatalogueServiceDeps {
  productSource: ProductSource;
  /** Owner-chosen products for the home page, in display order (A1). */
  featuredProductIds: readonly number[];
  log: Logger;
}

export class CatalogueService {
  constructor(private readonly deps: CatalogueServiceDeps) {}

  listCategories(): Promise<Category[]> {
    return this.deps.productSource.listCategories();
  }

  /** Featured products in configured order. Ids the source no longer has are skipped and logged. */
  async getFeatured(): Promise<Product[]> {
    const byId = new Map((await this.deps.productSource.listProducts()).map((p) => [p.id, p]));
    const featured = this.deps.featuredProductIds.flatMap((id) => byId.get(id) ?? []);
    const missingIds = this.deps.featuredProductIds.filter((id) => !byId.has(id));
    if (missingIds.length > 0) {
      this.deps.log.warn({ missingIds }, 'Featured products not found in product source');
    }
    return featured;
  }

  /** The best rated products of a category as "topRated", the rest as "more", all by rating (A2). */
  async getCategoryProducts(slug: string): Promise<CategoryProducts> {
    const [categories, products] = await Promise.all([
      this.deps.productSource.listCategories(),
      this.deps.productSource.listProducts(),
    ]);
    const category = categories.find((c) => c.slug === slug);
    if (!category) throw new NotFoundError(`Category "${slug}" was not found`);

    const ranked = products.filter((p) => p.category.slug === slug).sort(byRatingDesc);
    return {
      category,
      topRated: ranked.slice(0, TOP_RATED_PER_CATEGORY),
      more: ranked.slice(TOP_RATED_PER_CATEGORY),
    };
  }

  /** Products whose title, description or category contain the term, ignoring case (A3). */
  async search(term: string): Promise<Product[]> {
    const products = await this.deps.productSource.listProducts();
    return products.filter((product) => matchesSearchTerm(product, term));
  }

  async getProduct(id: number): Promise<Product> {
    const product = await this.deps.productSource.getProduct(id);
    if (!product) throw new NotFoundError(`Product ${id} was not found`);
    return product;
  }
}

/** Higher rating first; ties go to the product with more reviews, then the lower id. */
export function byRatingDesc(a: Product, b: Product): number {
  return b.rating.rate - a.rating.rate || b.rating.count - a.rating.count || a.id - b.id;
}

export function matchesSearchTerm(product: Product, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (needle === '') return false;
  return [product.title, product.description, product.category.name].some((text) =>
    text.toLowerCase().includes(needle),
  );
}

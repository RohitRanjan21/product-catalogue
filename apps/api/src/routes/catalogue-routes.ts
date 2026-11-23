import {
  CategorySlugParamsSchema,
  ProductIdParamsSchema,
  SearchQuerySchema,
  type Category,
  type CategoryProducts,
  type Product,
} from '@catalogue/contracts';
import type { FastifyInstance } from 'fastify';
import type { SourceProduct } from '../ports';
import type { CatalogueService } from '../services/catalogue-service';
import { parseInput } from '../validation';

/** Browsers may keep product images for a day; they change far less often than that. */
const IMAGE_CACHE_CONTROL = 'public, max-age=86400';

/**
 * The source's image URL never leaves the API: clients get our own image endpoint instead, so the
 * browser only ever talks to us, and the CSP can forbid every other origin.
 */
export function toPublicProduct(product: SourceProduct): Product {
  return { ...product, imageUrl: `/api/products/${product.id}/image` };
}

export function registerCatalogueRoutes(app: FastifyInstance, catalogue: CatalogueService): void {
  app.get('/api/categories', (): Promise<Category[]> => catalogue.listCategories());

  app.get('/api/categories/:slug/products', async (request): Promise<CategoryProducts> => {
    const { slug } = parseInput(CategorySlugParamsSchema, request.params);
    const { category, topRated, more } = await catalogue.getCategoryProducts(slug);
    return { category, topRated: topRated.map(toPublicProduct), more: more.map(toPublicProduct) };
  });

  // Static paths win over `/:id` in Fastify's router, so "featured" and "search" are never read as ids.
  app.get('/api/products/featured', async (): Promise<Product[]> => {
    return (await catalogue.getFeatured()).map(toPublicProduct);
  });

  app.get('/api/products/search', async (request): Promise<Product[]> => {
    const { q } = parseInput(SearchQuerySchema, request.query);
    return (await catalogue.search(q)).map(toPublicProduct);
  });

  app.get('/api/products/:id', async (request): Promise<Product> => {
    const { id } = parseInput(ProductIdParamsSchema, request.params);
    return toPublicProduct(await catalogue.getProduct(id));
  });

  app.get('/api/products/:id/image', async (request, reply) => {
    const { id } = parseInput(ProductIdParamsSchema, request.params);
    const image = await catalogue.getProductImage(id);
    return reply
      .header('content-type', image.contentType)
      .header('cache-control', IMAGE_CACHE_CONTROL)
      .header('x-content-type-options', 'nosniff')
      .send(Buffer.from(image.data));
  });
}

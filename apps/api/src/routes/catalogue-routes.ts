import {
  CategorySlugParamsSchema,
  ProductIdParamsSchema,
  SearchQuerySchema,
  type Category,
  type CategoryProducts,
  type Product,
} from '@catalogue/contracts';
import type { FastifyInstance } from 'fastify';
import type { CatalogueService } from '../services/catalogue-service';
import { parseInput } from '../validation';

export function registerCatalogueRoutes(app: FastifyInstance, catalogue: CatalogueService): void {
  app.get('/api/categories', (): Promise<Category[]> => catalogue.listCategories());

  app.get('/api/categories/:slug/products', (request): Promise<CategoryProducts> => {
    const { slug } = parseInput(CategorySlugParamsSchema, request.params);
    return catalogue.getCategoryProducts(slug);
  });

  // Static paths win over `/:id` in Fastify's router, so "featured" and "search" are never read as ids.
  app.get('/api/products/featured', (): Promise<Product[]> => catalogue.getFeatured());

  app.get('/api/products/search', (request): Promise<Product[]> => {
    const { q } = parseInput(SearchQuerySchema, request.query);
    return catalogue.search(q);
  });

  app.get('/api/products/:id', (request): Promise<Product> => {
    const { id } = parseInput(ProductIdParamsSchema, request.params);
    return catalogue.getProduct(id);
  });
}

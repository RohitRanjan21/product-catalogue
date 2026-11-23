import { z } from 'zod';

export const CategorySchema = z.object({
  /** URL-safe id, e.g. "mens-clothing". */
  slug: z.string().min(1),
  /** Display name, e.g. "Men's clothing". */
  name: z.string().min(1),
});
export type Category = z.infer<typeof CategorySchema>;

export const ProductSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  price: z.number().nonnegative(),
  description: z.string(),
  category: CategorySchema,
  /**
   * Where the client loads the image from: our own API (`/api/products/:id/image`), never the
   * product source's host, so the browser only talks to us (DECISIONS.md A12).
   */
  imageUrl: z.string().regex(/^\/api\/products\/\d+\/image$/, 'Image must be served by our API'),
  rating: z.object({
    rate: z.number().min(0).max(5),
    count: z.number().int().nonnegative(),
  }),
});
export type Product = z.infer<typeof ProductSchema>;

export const CategoryProductsSchema = z.object({
  category: CategorySchema,
  topRated: z.array(ProductSchema),
  more: z.array(ProductSchema),
});
export type CategoryProducts = z.infer<typeof CategoryProductsSchema>;

/** `GET /api/products/search?q=`: trimmed, 1-100 characters (A3). */
export const SearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Enter a search term').max(100, 'Search term is too long'),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

/** `GET /api/products/:id`: digits only, so "1e2" or "-1" are rejected rather than coerced. */
export const ProductIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d{0,9}$/, 'Product id must be a positive whole number')
    .transform(Number),
});

/** `GET /api/categories/:slug/products`. */
export const CategorySlugParamsSchema = z.object({
  slug: z
    .string()
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid category'),
});

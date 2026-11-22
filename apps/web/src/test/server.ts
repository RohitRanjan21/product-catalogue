import type { Category, CategoryProducts, ErrorResponse, Product } from '@catalogue/contracts';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const electronics: Category = { slug: 'electronics', name: 'Electronics' };
const jewelery: Category = { slug: 'jewelery', name: 'Jewelery' };

function product(id: number, title: string, category: Category, rate: number, price = 10): Product {
  return {
    id,
    title,
    price,
    description: `About ${title}`,
    category,
    imageUrl: `https://images.example.com/${id}.png`,
    rating: { rate, count: 100 + id },
  };
}

export const products = {
  ssd: product(1, 'Portable SSD', electronics, 4.8, 64),
  mouse: product(2, 'Wireless Mouse', electronics, 4.7),
  hub: product(3, 'USB Hub', electronics, 4.1),
  monitor: product(4, 'Gaming Monitor', electronics, 2.9, 599),
  ring: product(5, 'Silver Ring', jewelery, 4.6, 168),
};

export const featured = [products.ring, products.ssd, products.mouse, products.hub, products.monitor];

export function errorBody(code: ErrorResponse['error']['code'], message: string, details?: ErrorResponse['error']['details']) {
  return { error: { code, message, ...(details ? { details } : {}) } } satisfies ErrorResponse;
}

/** Default happy-path handlers. Tests override one with `server.use(...)` to simulate failures. */
export const server = setupServer(
  http.get('/api/categories', () => HttpResponse.json([electronics, jewelery])),
  http.get('/api/products/featured', () => HttpResponse.json(featured)),
  http.get('/api/categories/:slug/products', ({ params }) => {
    if (params.slug !== 'electronics') {
      return HttpResponse.json(errorBody('NOT_FOUND', 'Category not found'), { status: 404 });
    }
    const body: CategoryProducts = {
      category: electronics,
      topRated: [products.ssd, products.mouse, products.hub],
      more: [products.monitor],
    };
    return HttpResponse.json(body);
  }),
  http.get('/api/products/search', ({ request }) => {
    const q = new URL(request.url).searchParams.get('q')?.toLowerCase() ?? '';
    return HttpResponse.json(Object.values(products).filter((p) => p.title.toLowerCase().includes(q)));
  }),
  http.get('/api/products/:id', ({ params }) => {
    const found = Object.values(products).find((p) => String(p.id) === params.id);
    return found
      ? HttpResponse.json(found)
      : HttpResponse.json(errorBody('NOT_FOUND', 'Product not found'), { status: 404 });
  }),
  http.post('/api/enquiries', () =>
    HttpResponse.json({ enquiryId: '5a7606f7-d354-42b8-9d9a-28e5877a64db' }, { status: 202 }),
  ),
);

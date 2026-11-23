import {
  CategoryProductsSchema,
  CategorySchema,
  EnquiryResponseSchema,
  ProductSchema,
  type EnquiryRequest,
} from '@catalogue/contracts';
import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, apiRequest } from './client';

const ProductListSchema = ProductSchema.array();

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        // A 4xx will not fix itself; retry only network and server failures, once.
        retry: (failureCount, error) =>
          failureCount < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => apiRequest('/api/categories', CategorySchema.array(), { signal }),
    staleTime: 5 * 60_000,
  });
}

export function useFeaturedProducts() {
  return useQuery({
    queryKey: ['products', 'featured'],
    queryFn: ({ signal }) => apiRequest('/api/products/featured', ProductListSchema, { signal }),
  });
}

export function useCategoryProducts(slug: string) {
  return useQuery({
    queryKey: ['categories', slug, 'products'],
    queryFn: ({ signal }) =>
      apiRequest(`/api/categories/${encodeURIComponent(slug)}/products`, CategoryProductsSchema, { signal }),
  });
}

/** `term` must already be trimmed and non-empty; the page decides when a search is valid. */
export function useProductSearch(term: string, enabled: boolean) {
  return useQuery({
    queryKey: ['products', 'search', term],
    queryFn: ({ signal }) =>
      apiRequest(`/api/products/search?${new URLSearchParams({ q: term }).toString()}`, ProductListSchema, {
        signal,
      }),
    enabled,
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['products', id],
    queryFn: ({ signal }) => apiRequest(`/api/products/${encodeURIComponent(id)}`, ProductSchema, { signal }),
  });
}

export function useSubmitEnquiry() {
  return useMutation({
    mutationFn: (enquiry: EnquiryRequest) =>
      apiRequest('/api/enquiries', EnquiryResponseSchema, { method: 'POST', body: enquiry }),
  });
}

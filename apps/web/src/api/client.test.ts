import { ProductSchema } from '@catalogue/contracts';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { errorBody, server } from '../test/server';
import { ApiError, apiRequest } from './client';

describe('apiRequest', () => {
  it('turns a contract error body into an ApiError with the same code and details', async () => {
    server.use(
      http.get('/api/products/7', () =>
        HttpResponse.json(errorBody('VALIDATION_ERROR', 'Bad', [{ path: 'id', message: 'Nope' }]), { status: 400 }),
      ),
    );
    await expect(apiRequest('/api/products/7', ProductSchema)).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ path: 'id', message: 'Nope' }],
    });
  });

  it('never shows a non-contract error body (e.g. a proxy error page) to the customer', async () => {
    server.use(http.get('/api/products/7', () => new HttpResponse('<h1>502 Bad Gateway</h1>', { status: 502 })));
    const error = await apiRequest('/api/products/7', ProductSchema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('Something went wrong. Please try again.');
  });

  it('rejects a 200 response that does not match the contract', async () => {
    server.use(http.get('/api/products/7', () => HttpResponse.json({ id: 7 })));
    await expect(apiRequest('/api/products/7', ProductSchema)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('reports network failures with a friendly message', async () => {
    server.use(http.get('/api/products/7', () => HttpResponse.error()));
    await expect(apiRequest('/api/products/7', ProductSchema)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});

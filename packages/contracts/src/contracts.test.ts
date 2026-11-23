import { describe, expect, it } from 'vitest';
import { EnquiryRequestSchema, ProductIdParamsSchema, SearchQuerySchema } from './index';

describe('EnquiryRequestSchema', () => {
  const valid = { productId: 3, name: 'Ada Lovelace', email: 'ada@example.com' };

  it('accepts the required fields and trims text', () => {
    expect(EnquiryRequestSchema.parse({ ...valid, name: '  Ada  ', phone: ' 0412 345 678 ' })).toEqual({
      ...valid,
      name: 'Ada',
      phone: '0412 345 678',
    });
  });

  it('rejects unknown fields', () => {
    expect(EnquiryRequestSchema.safeParse({ ...valid, productTitle: 'Injected' }).success).toBe(false);
  });

  it.each([
    ['blank name', { ...valid, name: '   ' }],
    ['bad email', { ...valid, email: 'not-an-email' }],
    ['bad phone', { ...valid, phone: 'call me' }],
    ['long message', { ...valid, message: 'x'.repeat(1001) }],
    ['string product id', { ...valid, productId: '3' }],
  ])('rejects %s', (_label, input) => {
    expect(EnquiryRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe('SearchQuerySchema', () => {
  it('trims the term', () => {
    expect(SearchQuerySchema.parse({ q: '  shirt ' })).toEqual({ q: 'shirt' });
  });

  it.each(['', '   ', 'x'.repeat(101)])('rejects %j', (q) => {
    expect(SearchQuerySchema.safeParse({ q }).success).toBe(false);
  });

  it('rejects a missing term', () => {
    expect(SearchQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe('ProductIdParamsSchema', () => {
  it('turns digits into a number', () => {
    expect(ProductIdParamsSchema.parse({ id: '12' })).toEqual({ id: 12 });
  });

  it.each(['0', '-1', '1e2', '1.5', 'abc', '01'])('rejects %j', (id) => {
    expect(ProductIdParamsSchema.safeParse({ id }).success).toBe(false);
  });
});

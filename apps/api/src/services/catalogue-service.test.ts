import { describe, expect, it } from 'vitest';
import { fixtureProducts, InMemoryProductSource, makeProduct, RecordingLogger } from '../../test/fakes';
import { NotFoundError } from '../errors';
import { CatalogueService, matchesSearchTerm } from './catalogue-service';

function setup(featuredProductIds: number[] = [8, 3, 4, 6, 1], products = fixtureProducts) {
  const log = new RecordingLogger();
  const service = new CatalogueService({
    productSource: new InMemoryProductSource(products),
    featuredProductIds,
    log,
  });
  return { service, log };
}

const ids = (products: { id: number }[]) => products.map((p) => p.id);

describe('CatalogueService.getFeatured', () => {
  it('returns the configured products in the configured order (A1)', async () => {
    const { service } = setup([8, 3, 4, 6, 1]);
    expect(ids(await service.getFeatured())).toEqual([8, 3, 4, 6, 1]);
  });

  it('skips ids the source no longer has and logs them', async () => {
    const { service, log } = setup([8, 99, 4, 98, 1]);
    expect(ids(await service.getFeatured())).toEqual([8, 4, 1]);
    expect(log.entries).toEqual([
      expect.objectContaining({ level: 'warn', details: { missingIds: [99, 98] } }),
    ]);
  });
});

describe('CatalogueService.getCategoryProducts', () => {
  it('puts the 3 best rated first, breaking rating ties by review count (A2)', async () => {
    const { service } = setup();
    const result = await service.getCategoryProducts('electronics');
    expect(result.category).toEqual({ slug: 'electronics', name: 'Electronics' });
    // 4 and 6 are both 4.8; 6 has more reviews, so it wins despite the higher id.
    expect(ids(result.topRated)).toEqual([6, 4, 7]);
    expect(ids(result.more)).toEqual([5]);
  });

  it('shows everything as top rated when a category has 3 products or fewer', async () => {
    const { service } = setup();
    const result = await service.getCategoryProducts('jewelery');
    expect(ids(result.topRated)).toEqual([8]);
    expect(result.more).toEqual([]);
  });

  it('breaks a full tie by id so the order is stable', async () => {
    const category = { slug: 'tie', name: 'Tie' };
    const { service } = setup([1, 2, 3, 4, 5], [
      makeProduct(12, category, 4, 10),
      makeProduct(11, category, 4, 10),
    ]);
    expect(ids((await service.getCategoryProducts('tie')).topRated)).toEqual([11, 12]);
  });

  it('throws NotFoundError for an unknown category', async () => {
    const { service } = setup();
    await expect(service.getCategoryProducts('garden')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('CatalogueService.search', () => {
  it.each([
    ['title', 'jacket', [3]],
    ['description', 'battery', [6]],
    ['category name', "men's", [1, 2, 3]],
    ['any case', 'PORTABLE ssd', [4]],
    ['no match', 'kettle', []],
  ])('matches on %s', async (_label, term, expected) => {
    const { service } = setup();
    expect(ids(await service.search(term))).toEqual(expected);
  });
});

describe('matchesSearchTerm', () => {
  it('never matches a blank term', () => {
    expect(matchesSearchTerm(fixtureProducts[0]!, '   ')).toBe(false);
  });
});

describe('CatalogueService.getProduct', () => {
  it('returns the product', async () => {
    const { service } = setup();
    expect((await service.getProduct(3)).title).toBe('Cotton Jacket');
  });

  it('throws NotFoundError for an unknown id', async () => {
    const { service } = setup();
    await expect(service.getProduct(999)).rejects.toBeInstanceOf(NotFoundError);
  });
});

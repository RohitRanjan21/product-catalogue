import { SearchQuerySchema } from '@catalogue/contracts';
import { useSearchParams } from 'react-router';
import { useProductSearch } from '../api/hooks';
import { ProductGrid } from '../components/ProductCard';
import { ErrorNotice, Loading } from '../components/Status';

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const parsed = SearchQuerySchema.safeParse({ q: searchParams.get('q') ?? '' });
  const term = parsed.success ? parsed.data.q : '';
  const results = useProductSearch(term, parsed.success);

  if (!parsed.success) {
    return (
      <>
        <h1>Search</h1>
        <p className="muted">Enter a search term above to find products.</p>
      </>
    );
  }

  return (
    <>
      <h1>Results for “{term}”</h1>
      {results.isPending && <Loading label="Searching…" />}
      {results.isError && <ErrorNotice error={results.error} />}
      {results.isSuccess &&
        (results.data.length === 0 ? (
          <p className="notice">No products match “{term}”. Try a different word.</p>
        ) : (
          <>
            <p className="muted">
              {results.data.length} {results.data.length === 1 ? 'product' : 'products'} found
            </p>
            <ProductGrid products={results.data} label="Search results" />
          </>
        ))}
    </>
  );
}

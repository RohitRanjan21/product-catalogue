import { useFeaturedProducts } from '../api/hooks';
import { ProductGrid } from '../components/ProductCard';
import { ErrorNotice, Loading } from '../components/Status';

export function HomePage() {
  const featured = useFeaturedProducts();
  return (
    <>
      <h1>Top rated products</h1>
      {featured.isPending && <Loading label="Loading featured products…" />}
      {featured.isError && <ErrorNotice error={featured.error} />}
      {featured.isSuccess && <ProductGrid products={featured.data} label="Featured products" />}
    </>
  );
}

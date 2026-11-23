import { useParams } from 'react-router';
import { useCategoryProducts } from '../api/hooks';
import { ProductGrid } from '../components/ProductCard';
import { ErrorNotice, isNotFound, Loading } from '../components/Status';
import { NotFoundPage } from './NotFoundPage';

export function CategoryPage() {
  const { slug = '' } = useParams();
  const result = useCategoryProducts(slug);

  if (result.isPending) return <Loading label="Loading category…" />;
  if (result.isError) {
    return isNotFound(result.error) ? <NotFoundPage what="category" /> : <ErrorNotice error={result.error} />;
  }

  const { category, topRated, more } = result.data;
  return (
    <>
      <h1>{category.name}</h1>
      <section aria-labelledby="top-rated-heading">
        <h2 id="top-rated-heading">Top rated</h2>
        <ProductGrid products={topRated} label={`Top rated in ${category.name}`} />
      </section>
      {more.length > 0 && (
        <section aria-labelledby="more-heading">
          <h2 id="more-heading">More in this category</h2>
          <ProductGrid products={more} label={`More in ${category.name}`} />
        </section>
      )}
    </>
  );
}

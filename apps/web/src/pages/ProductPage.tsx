import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { useProduct } from '../api/hooks';
import { EnquiryForm } from '../components/EnquiryForm';
import { Price } from '../components/Price';
import { ErrorNotice, Loading } from '../components/Status';
import { NotFoundPage } from './NotFoundPage';

export function ProductPage() {
  const { id = '' } = useParams();
  const result = useProduct(id);
  const [enquiring, setEnquiring] = useState(false);

  if (result.isPending) return <Loading label="Loading product…" />;
  if (result.isError) {
    // A malformed id (400) is as good as missing from the customer's point of view.
    const { error } = result;
    const missing = error instanceof ApiError && (error.code === 'NOT_FOUND' || error.status === 400);
    return missing ? <NotFoundPage what="product" /> : <ErrorNotice error={error} />;
  }

  const product = result.data;
  return (
    <article>
      <p>
        <Link to={`/categories/${product.category.slug}`}>{product.category.name}</Link>
      </p>
      <div className="product-detail">
        <img src={product.imageUrl} alt={product.title} />
        <div>
          <h1>{product.title}</h1>
          <p>
            <Price amount={product.price} className="price product-detail__price" />
          </p>
          <p className="muted">
            Rated {product.rating.rate.toFixed(1)} out of 5 from {product.rating.count} reviews
          </p>
          <p>{product.description}</p>
          {!enquiring && (
            <button className="button" type="button" onClick={() => setEnquiring(true)}>
              Enquire
            </button>
          )}
        </div>
      </div>
      {enquiring && (
        <section className="enquiry">
          <EnquiryForm productId={product.id} onCancel={() => setEnquiring(false)} />
        </section>
      )}
    </article>
  );
}

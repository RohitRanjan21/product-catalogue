import type { Product } from '@catalogue/contracts';
import { Link } from 'react-router';
import { Price } from './Price';

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link className="product-card" to={`/products/${product.id}`}>
      <img src={product.imageUrl} alt="" loading="lazy" />
      <span className="product-card__title">{product.title}</span>
      <span className="product-card__meta">
        <Price amount={product.price} />
        <span aria-label={`Rated ${product.rating.rate} out of 5`}>★ {product.rating.rate.toFixed(1)}</span>
      </span>
    </Link>
  );
}

export function ProductGrid({ products, label }: { products: Product[]; label: string }) {
  return (
    <ul className="product-grid" aria-label={label}>
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}

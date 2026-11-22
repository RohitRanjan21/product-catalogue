import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router';
import { useCategories } from '../api/hooks';
import { SearchForm } from './SearchForm';

export function Layout() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const currentTerm = pathname === '/search' ? (searchParams.get('q') ?? '') : '';

  return (
    <>
      <header className="site-header">
        <div className="container site-header__bar">
          <Link to="/" className="site-header__logo">
            Product Catalogue
          </Link>
          <CategoryNav />
          {/* Re-mount on a new term so the box shows what the results page is showing. */}
          <SearchForm key={currentTerm} initialTerm={currentTerm} />
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}

function CategoryNav() {
  const { data: categories } = useCategories();
  // While loading, or if categories fail, the header still works; the page shows its own error.
  if (!categories?.length) return null;
  return (
    <nav className="category-nav" aria-label="Categories">
      <ul>
        {categories.map((category) => (
          <li key={category.slug}>
            <NavLink to={`/categories/${category.slug}`}>{category.name}</NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

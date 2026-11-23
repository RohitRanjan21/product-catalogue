import { Link } from 'react-router';

export function NotFoundPage({ what = 'page' }: { what?: 'page' | 'product' | 'category' }) {
  return (
    <>
      <h1>Sorry, we couldn’t find that {what}</h1>
      <p>
        <Link to="/">Back to the home page</Link>
      </p>
    </>
  );
}

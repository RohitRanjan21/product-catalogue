import { SearchQuerySchema } from '@catalogue/contracts';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

/** Header search. Uses the same rule as the API (trimmed, 1-100 chars) so bad terms never hit it. */
export function SearchForm({ initialTerm = '' }: { initialTerm?: string }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState(initialTerm);
  const [error, setError] = useState<string>();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = SearchQuerySchema.safeParse({ q: term });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a search term');
      return;
    }
    setError(undefined);
    void navigate(`/search?${new URLSearchParams({ q: parsed.data.q }).toString()}`);
  }

  return (
    <form className="search-form" role="search" onSubmit={handleSubmit} noValidate>
      <label htmlFor="search-term" className="visually-hidden">
        Search products
      </label>
      <input
        id="search-term"
        type="search"
        placeholder="Search products"
        value={term}
        maxLength={100}
        onChange={(event) => setTerm(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'search-error' : undefined}
      />
      <button className="button" type="submit">
        Search
      </button>
      {error && (
        <p id="search-error" className="search-form__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

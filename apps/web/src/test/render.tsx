import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { createQueryClient } from '../api/hooks';
import { App } from '../App';

/** Renders the whole app at `path` with a fresh cache, like a customer opening that URL. */
export function renderApp(path = '/') {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } });
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { user, ...view };
}

/** Exposes the current URL so tests can assert navigation. */
function LocationProbe() {
  const location = useLocation();
  // A plain div: <output> would add an extra role="status" to every page.
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

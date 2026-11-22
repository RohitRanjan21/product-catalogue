import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';
import { products, server } from '../test/server';

describe('Search (criterion: only products matching the term)', () => {
  it('searches when the button is clicked and shows only the matches', async () => {
    const { user } = renderApp('/');
    await user.type(screen.getByRole('searchbox', { name: 'Search products' }), '  mouse ');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/search?q=mouse');
    expect(await screen.findByRole('heading', { name: 'Results for “mouse”' })).toBeInTheDocument();
    const results = screen.getByRole('list', { name: 'Search results' });
    expect(results).toHaveTextContent('Wireless Mouse');
    expect(results).not.toHaveTextContent('Portable SSD');
  });

  it('sends the trimmed term to our API', async () => {
    let received: string | null = null;
    server.use(
      http.get('/api/products/search', ({ request }) => {
        received = new URL(request.url).searchParams.get('q');
        return HttpResponse.json([products.hub]);
      }),
    );
    const { user } = renderApp('/');
    await user.type(screen.getByRole('searchbox', { name: 'Search products' }), ' usb hub ');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByRole('list', { name: 'Search results' });
    expect(received).toBe('usb hub');
  });

  it('does not search for a blank term', async () => {
    const { user } = renderApp('/');
    await user.type(screen.getByRole('searchbox', { name: 'Search products' }), '   ');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a search term');
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });

  it('shows an empty state when nothing matches', async () => {
    renderApp('/search?q=kettle');
    expect(await screen.findByText(/No products match “kettle”/)).toBeInTheDocument();
  });

  it('keeps the term in the search box on the results page', async () => {
    renderApp('/search?q=ring');
    await screen.findByRole('list', { name: 'Search results' });
    expect(screen.getByRole('searchbox', { name: 'Search products' })).toHaveValue('ring');
  });
});

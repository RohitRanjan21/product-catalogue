import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';
import { errorBody, server } from '../test/server';

describe('Home page (criterion: I see the 5 featured products)', () => {
  it('shows the 5 featured products in the order the API returns them', async () => {
    renderApp('/');
    const grid = await screen.findByRole('list', { name: 'Featured products' });
    const titles = within(grid)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(titles).toHaveLength(5);
    expect(titles[0]).toContain('Silver Ring');
    expect(titles[0]).toContain('$168.00');
    expect(titles[1]).toContain('Portable SSD');
  });

  it('shows category links and a search button in the header', async () => {
    renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Categories' });
    expect(within(nav).getByRole('link', { name: 'Electronics' })).toHaveAttribute('href', '/categories/electronics');
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
  });

  it('opens the product page when a tile is clicked (criterion: product page)', async () => {
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('link', { name: /Portable SSD/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Portable SSD' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/products/1');
  });

  it("shows the API's message when the catalogue is unavailable", async () => {
    server.use(
      http.get('/api/products/featured', () =>
        HttpResponse.json(errorBody('UPSTREAM_ERROR', 'The product catalogue is unavailable right now.'), {
          status: 502,
        }),
      ),
    );
    renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('The product catalogue is unavailable right now.');
  });
});

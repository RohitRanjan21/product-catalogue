import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';

const titlesIn = (list: HTMLElement) =>
  within(list)
    .getAllByRole('link')
    .map((link) => link.querySelector('.product-card__title')?.textContent);

describe('Category page (criterion: top rated plus more in the category)', () => {
  it('opens from the header link and shows both sections', async () => {
    const { user } = renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Categories' });
    await user.click(within(nav).getByRole('link', { name: 'Electronics' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Electronics' })).toBeInTheDocument();
    expect(titlesIn(screen.getByRole('list', { name: 'Top rated in Electronics' }))).toEqual([
      'Portable SSD',
      'Wireless Mouse',
      'USB Hub',
    ]);
    expect(titlesIn(screen.getByRole('list', { name: 'More in Electronics' }))).toEqual(['Gaming Monitor']);
  });

  it('says so when the category does not exist', async () => {
    renderApp('/categories/garden');
    expect(await screen.findByRole('heading', { name: /couldn’t find that category/ })).toBeInTheDocument();
  });
});

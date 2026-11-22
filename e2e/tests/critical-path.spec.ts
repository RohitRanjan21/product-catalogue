import { expect, test, type Page } from '@playwright/test';

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const SALES_INBOX = process.env.SALES_INBOX_EMAIL ?? 'sales@example.com';

interface MailpitSearch {
  messages: { ID: string; Subject: string; To: { Address: string }[]; ReplyTo: { Address: string }[] }[];
}

/** Collects console errors, e.g. CSP violations, which don't break a test on their own. */
function watchConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

/** Records every browser request, images included, that is not for our own origin (DECISIONS.md A12). */
function watchForeignRequests(page: Page, baseURL: string): string[] {
  const foreign: string[] = [];
  const origin = new URL(baseURL).origin;
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== origin) foreign.push(request.url());
  });
  return foreign;
}

test('home shows the 5 featured products, images served by our API', async ({ page, baseURL }) => {
  const foreignRequests = watchForeignRequests(page, baseURL!);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Top rated products' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Featured products' }).getByRole('link')).toHaveCount(5);

  const images = page.getByRole('list', { name: 'Featured products' }).locator('img');
  await expect(images).toHaveCount(5);
  for (const image of await images.all()) {
    await expect(image).toHaveAttribute('src', /^\/api\/products\/\d+\/image$/);
    // Loaded for real (the CSP would block anything not from our origin).
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  expect(foreignRequests).toEqual([]);
});

test('search shows only products matching the term', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search products' }).fill('jacket');
  await page.getByRole('button', { name: 'Search' }).click();

  await expect(page).toHaveURL(/\/search\?q=jacket$/);
  const results = page.getByRole('list', { name: 'Search results' }).getByRole('link');
  await expect(results.first()).toBeVisible();
  const hrefs = await results.evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
  expect(hrefs.length).toBeLessThan(20); // the catalogue has 20 products; a match must narrow it

  // Each result matches on title, description or category (A3); the card only shows the title.
  for (const href of hrefs) {
    const product = (await (await request.get(`/api${href}`)).json()) as {
      title: string;
      description: string;
      category: { name: string };
    };
    const text = `${product.title} ${product.description} ${product.category.name}`.toLowerCase();
    expect(text, href).toContain('jacket');
  }
});

test('category -> product -> enquiry -> thank you, and the sales inbox gets the email', async ({
  page,
  request,
  baseURL,
}) => {
  const foreignRequests = watchForeignRequests(page, baseURL!);
  const consoleErrors = watchConsoleErrors(page);
  const customer = `E2E Customer ${Date.now()}`;

  // Category: top rated plus more in the category.
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: 'Electronics' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Electronics' })).toBeVisible();
  const topRated = page.getByRole('list', { name: 'Top rated in Electronics' }).getByRole('link');
  await expect(topRated).toHaveCount(3);
  await expect(page.getByRole('list', { name: 'More in Electronics' }).getByRole('link').first()).toBeVisible();

  // Product page.
  const productTitle = (await topRated.first().locator('.product-card__title').textContent())!.trim();
  await topRated.first().click();
  await expect(page.getByRole('heading', { level: 1, name: productTitle })).toBeVisible();

  // Enquiry.
  await page.getByRole('button', { name: 'Enquire' }).click();
  await page.getByLabel('Name').fill(customer);
  await page.getByLabel('Email').fill('e2e.customer@example.com');
  await page.getByLabel(/Message/).fill('Is this available for delivery next week?');
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Thank you' })).toBeVisible();

  // The sales inbox received it.
  await expect
    .poll(
      async () => {
        const response = await request.get(`${MAILPIT_URL}/api/v1/search`, { params: { query: `"${customer}"` } });
        const body = (await response.json()) as MailpitSearch;
        return body.messages.map((m) => ({
          subject: m.Subject,
          to: m.To.map((t) => t.Address),
          replyTo: m.ReplyTo.map((r) => r.Address),
        }));
      },
      { message: 'enquiry email in Mailpit', timeout: 15_000 },
    )
    .toEqual([
      { subject: `Product enquiry: ${productTitle}`, to: [SALES_INBOX], replyTo: ['e2e.customer@example.com'] },
    ]);

  // The browser only ever talked to our own origin, product images included.
  expect(foreignRequests).toEqual([]);
  // ...and nothing was blocked by the CSP or failed in the console along the way.
  expect(consoleErrors).toEqual([]);
});

test('security headers are served, and the CSP only allows our own origin', async ({ request }) => {
  const response = await request.get('/');
  const csp = response.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).not.toContain('fakestoreapi');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
});

test('a deep link is served by the SPA', async ({ page }) => {
  await page.goto('/products/1');
  await expect(page.getByRole('button', { name: 'Enquire' })).toBeVisible();
});

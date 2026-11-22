# Decisions and assumptions

Filled in as the build goes. Assumption ids are referenced from docs/PLAN.md.

## Assumptions (where the acceptance criteria leave gaps)
- **A1. "I have chosen 5 products" means the owner curates them.** The home page shows 5 product ids
  listed in config (`FEATURED_PRODUCT_IDS`), in that order, validated at startup. No admin UI yet.
- **A2. "Top rated" within a category means highest Fake Store rating.** The category page shows the
  top 3 by `rating.rate` (ties broken by review count) as "Top rated", and the rest as "More in this
  category", also sorted by rating.
- **A3. "Text matching the search term"** means a case-insensitive substring match on title,
  description or category. Empty or whitespace-only searches are rejected.
- **A4. The sales inbox is one address**, set by `SALES_INBOX_EMAIL`. Locally it is caught by Mailpit.
- **A5. Contact details** are name and email (required), phone and message (optional). The enquiry is
  emailed, not stored.
- **A6. A product's category is `{slug, name}`.** The slug (`mens-clothing`) is derived from Fake Store's
  category string for URLs; the name only gets a capital first letter. Fake Store's spelling
  ("Jewelery") is kept rather than corrected by hand in the adapter.
- **A7. Prices are shown as the source gives them, with a `$`.** No currency or tax handling.
- **A8. An enquiry for a product that doesn't exist is a 400 on `productId`**, not a 404: the route exists,
  the input is wrong, and the form can show it as a field error. No email is sent.
- **A9. If a featured id disappears from the source, the home page shows the rest** and the API logs a
  warning with the missing ids, rather than failing the whole page.
- **A10. Search results keep catalogue order.** No relevance ranking; with 20 products it isn't needed.
- **A11. Enquiries are limited to 5 per minute per client IP** by default (`ENQUIRY_RATE_LIMIT_PER_MINUTE`).
  Catalogue reads are not rate limited.
- **A12. Product images load from the URL the API returns** (`imageUrl`, today on Fake Store's image host).
  The browser never calls Fake Store's API: all product *data* comes from our `/api`, and the
  production CSP (`connect-src 'self'`) blocks any other API call. Images are static assets that would
  sit on a CDN in production; proxying their bytes through Node would add load for no benefit. If the
  source changes, the API returns different URLs and the client doesn't change.
- **A13. Search starts when the button is clicked (or Enter is pressed)**, not on every keystroke, as the
  criterion describes. The term lives in the URL (`/search?q=`), so results can be shared and reloaded.

## Technical decisions
- **D1. The `ProductSource` port is small** (`listProducts`, `listCategories`, `getProduct`) and the rules
  (featured order, top-rated split, search matching) live in `CatalogueService`, working on the full list
  in memory. Right for 20 products and easy to test. When the source is large, move search and
  category filtering into the port; the service and routes don't change.
- **D2. The Fake Store adapter reads `/products` once and caches it** (TTL, default 5 min). Concurrent misses
  share one request, failures are not cached, and if a refresh fails the stale list is served. Single
  products come from the cached list because Fake Store answers `/products/<unknown id>` with 200 and
  an empty body (checked 2026-11-22), so it can't signal "not found".
- **D3. Upstream items that fail validation are skipped and logged**, not allowed to fail the whole catalogue.
- **D4. Validation is an explicit `parseInput(schema, input)` call in each handler**, using the contract
  schemas, instead of a Fastify type-provider plugin: one obvious error path, easy to read and change.
- **D5. Error messages on `AppError` are safe for clients; internal detail goes in `cause`**, which is logged
  and never sent. SMTP failures are rewritten into a readable cause (Node reports a refused
  `localhost` connection as an `AggregateError` with an empty message).
- **D6. `packages/contracts` is consumed as TypeScript source**, with no build step. The API is bundled with
  esbuild for production (`npm run build -w @catalogue/api`), which inlines it; the web app will get it
  through Vite the same way.
- **D7. Request hardening:** 16 KB body limit, a `x-request-id` response header that matches the request id
  in the logs, and timeouts on every outbound call (Fake Store 5 s, SMTP 10 s).
- **D8. Web data fetching is TanStack Query hooks in `src/api/hooks.ts`** over one `apiRequest` function that
  parses every response with the shared contract. Pages are thin; components take data as props.
  4xx errors are not retried (they won't fix themselves); network and 5xx errors are retried once.
- **D9. The enquiry form validates with the same `EnquiryRequestSchema` as the API**, so field errors appear
  before sending, and any field errors the API returns are shown the same way.
- **D10. Look and feel is CSS variables in `apps/web/src/styles/tokens.css`**, with plain CSS classes in one
  stylesheet. No UI library: the creative direction isn't decided, and a library would bake one in.

## Dropped or simplified
_To be completed._

## How the design grows beyond the PoC
_To be completed._

## Next, with another day
_To be completed._

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
- **A12. Product images are served by our API too** (`/api/products/:id/image`). The brief says the client
  must not call Fake Store; images live on Fake Store's host, so loading them directly would show
  `fakestoreapi.com` requests in the browser. The source's image URL never leaves the API: routes
  replace it with our endpoint, which fetches only images of products in our catalogue (no
  client-supplied URLs), allows only raster image types (no SVG, which could carry script on our
  origin), caps size at 5 MB and lets browsers cache for a day. The CSP is now plain `default-src 'self'`,
  so the browser cannot reach any other host. (First version loaded images from the source's URL;
  changed after checking the submission against the brief.)
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
- **D11. Docker Compose runs three containers:** `web` (nginx serving the built SPA and proxying `/api`),
  `api` (bundled Node app, non-root, health-checked) and `mailpit` (the local sales inbox). Only `web`
  (8080) and the inbox UI (8025) are published; the API and SMTP stay on the internal network. All of it
  maps to AWS without code changes (S3/CloudFront or nginx on ECS for `web`, ECS/Fargate or Lambda for
  `api`, SES behind the same `EmailSender` port).
- **D12. nginx sets security headers**, including a CSP of `default-src 'self'` (the browser itself enforces
  "the client only talks to our backend", images included), and **overwrites** `X-Forwarded-For` rather than appending
  to it, so the API's per-IP enquiry limit can't be dodged with a forged header (checked by hand: forged
  headers still hit 429 after 5 requests).
- **D13. Zod runs in `jitless` mode in the browser.** Zod 4 probes `new Function()` for speed; the CSP refuses
  it and logs a violation on every page. The flag is set in `src/zod-setup.ts`, imported first, because
  Zod reads it when schemas are created. The E2E test fails on any console error, so this stays fixed.
- **D14. E2E runs against the real stack and the real Fake Store.** That is what the reviewer runs, and it
  checks the email in Mailpit through its API. The trade-off is a dependency on a free public service; CI
  retries once. With more time: a recorded Fake Store stub for CI, live checks on a schedule.

## Dropped or simplified
- **Enquiries are emailed, not stored.** The criterion only asks for an email and a thank-you. No database
  keeps the PoC to one command with nothing to migrate. Each enquiry has an id (in the email and the
  thank-you message) so a store can be added later without changing the contract.
- **No admin UI for featured products.** The owner's 5 picks are config (`FEATURED_PRODUCT_IDS`), validated at
  startup. Enough to prove the behaviour; an admin screen needs auth, which is out of scope.
- **No auth, pagination, i18n, analytics or production deployment.** 20 products don't need pagination;
  the rest isn't needed to judge the PoC. The infrastructure is AWS-compatible but not deployed.
- **Search is a substring match done in memory**, not a search engine. Right for 20 products; see below.
- **No CAPTCHA or spam filtering on enquiries**; per-IP rate limiting, a body size limit and strict
  validation are the basic protection for now.
- **The UI is deliberately plain.** The creative work is in progress, so effort went into making the look
  replaceable (tokens) and accessible (labels, roles, focus states), not into a visual design.

## How the design grows beyond the PoC
- **New product source** (PIM, commerce platform, database): write one adapter that implements
  `ProductSource` and maps its shape to `Product`; change one line in `apps/api/src/server.ts`. Routes,
  services, contracts and the web app don't change. For a large catalogue, push search and category
  filtering into the port (`search(term)`, `listByCategory(slug)`) and back it with a search engine; the
  service and HTTP API keep their shape.
- **New email provider** (SES, SendGrid): implement `EmailSender`. For reliability, put a queue between the
  enquiry service and the sender (SQS + worker) so a provider outage doesn't lose enquiries or slow
  customers down; the API would still answer 202.
- **New look and feel**: replace `apps/web/src/styles/tokens.css`, then restyle the one stylesheet.
  Components are presentational and data fetching lives in hooks, so they can be swapped or moved to
  a component library page by page.
- **Persistence and admin**: store enquiries (DynamoDB or Postgres) for tracking and auditing; move featured
  products from config to data with an authenticated admin screen.
- **Deployment on AWS**: `web` to S3 + CloudFront (or nginx on ECS), `api` to ECS/Fargate or Lambda (Fastify
  has a Lambda adapter), config from SSM/Secrets Manager, SES for email. The cache moves to a shared
  store (ElastiCache) once there is more than one API instance, as does the rate limit.
- **Observability**: logs are already structured JSON with a request id that is also returned to the client
  (`x-request-id`), so they can go straight to CloudWatch, Datadog or Sumo Logic. Next: metrics for
  upstream latency/errors and enquiry success, plus alerts on 502 rates.
- **Contracts**: the shared Zod schemas can generate an OpenAPI document for other consumers (a mobile app,
  partners) when the API is opened up.

## Next, with another day
1. A Fake Store stub for CI (recorded responses), so the E2E suite doesn't depend on a public service;
   keep a scheduled live check.
2. A queue for outgoing enquiry emails with retries, and store each enquiry.
3. OpenAPI generated from the contracts, served at `/api/docs`.
4. Accessibility pass with axe in the E2E suite, and visual checks once the design arrives.
5. Metrics and alerts (upstream errors, enquiry failures), and a deploy pipeline to an AWS environment.
6. Cache product images on the server side (nginx `proxy_cache` or a CDN in front of the image endpoint);
   today each cold image is fetched from the source, and only browsers cache it.

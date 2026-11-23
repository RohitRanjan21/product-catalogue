# Product Catalogue PoC

An interactive proof of concept for a product catalogue: browse by category, search, view a product
and send an enquiry that lands in the sales inbox. It is built as a foundation rather than a throwaway:
the **product data source**, the **look and feel** and the **email provider** are each behind a boundary
that can be replaced without touching the rest.

- Spec: [docs/PLAN.md](docs/PLAN.md) · Assumptions and decisions: [DECISIONS.md](DECISIONS.md) ·
  How AI was used: [AI_USAGE.md](AI_USAGE.md) · Agent instructions: [AGENTS.md](AGENTS.md)

## Run it (one command)

Needs **Docker** with Compose 2.24 or newer (Docker Desktop 4.27+). Nothing else: no accounts, keys or paid
services.

```bash
docker compose up --build        # or: npm start
```

| What | URL |
|---|---|
| The catalogue | http://localhost:8080 |
| The sales inbox (Mailpit) | http://localhost:8025 |

First build takes 1-2 minutes. Stop with `Ctrl+C` (or `docker compose down`). If a port is taken:
`WEB_PORT=8081 MAILPIT_PORT=8026 docker compose up --build`.

**Try the acceptance criteria:** the home page shows the 5 featured products → click a category in the
header (top rated, then more in that category) → search for `jacket` with the Search button → open a
product → **Enquire** → fill in the form → **Send enquiry** → "Thank you" → the email is in the inbox at
http://localhost:8025.

## Configuration

Everything has a working default, so no `.env` is needed. To change something, copy `.env.example` to
`.env`. The most useful settings:

| Variable | Default | Meaning |
|---|---|---|
| `FEATURED_PRODUCT_IDS` | `3,5,11,12,18` | The owner's 5 "top rated" products for the home page, in order |
| `SALES_INBOX_EMAIL` | `sales@example.com` | Where enquiries are sent |
| `ENQUIRY_RATE_LIMIT_PER_MINUTE` | `5` | Enquiries allowed per client IP per minute |
| `FAKESTORE_BASE_URL` | `https://fakestoreapi.com` | Product source |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Mailpit | Email provider (any SMTP server) |

Config is validated when the API starts; a bad value stops it with a message naming the variable.
No secrets are committed (`.env` is git-ignored).

## Stack, and why

| Part | Choice | Why |
|---|---|---|
| Client | **React + TypeScript** (Vite, React Router, TanStack Query) | Typed end to end; TanStack Query handles caching, loading and error states without hand-written effects |
| Backend | **Node.js + TypeScript** with **Fastify** and **Zod** | Small and explicit enough to read and change quickly; `app.inject()` gives real HTTP tests without a port; runs on Lambda later through an adapter. NestJS was considered: more structure than a PoC of this size needs |
| Shared | `packages/contracts` (Zod schemas) | One definition of every request and response, used by the API to validate and by the client to parse |
| Email | SMTP, with **Mailpit** locally | Free and local, with an inbox UI for the reviewer; SES or any provider plugs in behind the same port |
| Packaging | npm workspaces, Docker Compose, nginx | One command to run; same-origin `/api` proxy; maps directly to AWS (ECS/Fargate or Lambda, S3/CloudFront, SES) |

## How it fits together

```
Browser (React SPA)
   |  only our own origin, images included (the CSP blocks every other host)
   v
nginx (web container) ── serves the SPA, proxies /api
   |
   v
API (Fastify)
   routes ── validate with contracts (Zod) ──> services (catalogue rules, enquiry)
                                                  |                     |
                                        ProductSource port        EmailSender port
                                                  |                     |
                                  FakeStoreProductSource          SmtpEmailSender ──> Mailpit (local)
                                  (timeout, TTL cache,                                SES / any SMTP (later)
                                   stale-on-error)
```

- The client never calls Fake Store, not even for images: the API serves them at
  `/api/products/:id/image`, and the source's image URLs never leave the API.
- Routes know nothing about Fake Store or SMTP; services depend only on the two ports.
- Fake Store's shape is mapped to our `Product` in one file (the adapter). Swapping the product source
  means writing one new adapter and changing one line in `apps/api/src/server.ts`.
- The look and feel is CSS variables in one file, `apps/web/src/styles/tokens.css`.

### API

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{status: "ok"}` |
| GET | `/api/categories` | `Category[]` |
| GET | `/api/products/featured` | the 5 configured products, in order |
| GET | `/api/categories/:slug/products` | `{category, topRated (3 best rated), more}` |
| GET | `/api/products/search?q=term` | products whose title, description or category contain the term |
| GET | `/api/products/:id` | `Product` |
| GET | `/api/products/:id/image` | the product image, fetched from the source by the API |
| POST | `/api/enquiries` | `202 {enquiryId}`; emails the sales inbox |

Every error is `{error: {code, message, details?}}` with 400 / 404 / 429 / 502 / 500. No stack traces or
upstream bodies reach the client. Full contract: `packages/contracts/src`.

## Tests

```bash
npm ci
npm run lint && npm run typecheck && npm test   # 138 tests, ~5 seconds, no network or Docker needed
docker compose up --build -d --wait && npm run test:e2e   # Playwright against the running stack
```

The second line runs against the real Fake Store. To run the E2E suite exactly as CI does, with a
recorded copy of the catalogue instead (no internet needed for products):

```bash
docker compose -f docker-compose.yml -f e2e/docker-compose.stub.yml up --build -d --wait && npm run test:e2e
```

| Level | Where | What it covers |
|---|---|---|
| Contract | `packages/contracts` (19) | Input rules: enquiry strictness, search term, product id |
| Unit + adapter | `apps/api/src/**/*.test.ts` | Featured order, top-rated split and tie-breaks, search matching, config validation, enquiry email content, Fake Store mapping/cache/timeout/failures and image checks (type, size; stubbed `fetch`), SMTP failures |
| Integration | `apps/api/test/app.test.ts` | Every route through Fastify with in-memory fakes: success, 400, 404, 413, 429, 502, 500, no stack leaks, no source image URLs or customer details leaking |
| Component | `apps/web/src/**/*.test.tsx` (23) | The acceptance criteria in the UI, with MSW standing in for the API; unhandled requests fail the test |
| End to end | `e2e/tests` (5) | The real stack in Docker: home → category → product → enquiry → thank you, the email arriving in Mailpit, search, images loading through our API, CSP, and no request to any other host or console error |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build on every pull request, then the
end-to-end suite against Docker Compose. Fake Store blocks GitHub's runners (HTTP 403), so in CI the
stack gets a small stand-in that serves a recorded copy of the real catalogue
(`e2e/docker-compose.stub.yml`); everything else is the real stack. Locally, the suite passes against
the real Fake Store too. Details in `DECISIONS.md` (D14).

## Developing without Docker

Needs Node 22 (`nvm use`). Run Mailpit for email, then the API and the web dev server:

```bash
npm ci
docker compose up mailpit -d      # sales inbox at http://localhost:8025
npm run dev:api                   # http://127.0.0.1:3000 (reads .env if present)
npm run dev:web                   # http://localhost:5173, proxies /api to the API
```

## Layout

```
packages/contracts   Zod schemas: the API contract shared by both sides
apps/api             Fastify API: config, ports, adapters (Fake Store, SMTP), services, routes
apps/web             React SPA: pages, components, src/api hooks, design tokens; nginx config
e2e                  Playwright tests against the Compose stack, plus the Fake Store stand-in CI uses
docs/PLAN.md         The spec the work was built from
```

## Time spent

About **2 hours 35 minutes** of active work, against the 2-3 hour time-box:

| Activity | Time |
|---|---|
| Planning (reading the brief, choosing the stack, spec, agent instructions, assumptions) | ~25 min |
| Building (contracts, API, web, Docker, CI) | ~55 min |
| Testing (writing tests, mutation checks, manual runs against the real stack, E2E) | ~30 min |
| Reviewing (reading diffs, docs, PR description) | ~45 min |

How the time and the AI tooling were used, including what the AI got wrong, is in [AI_USAGE.md](AI_USAGE.md).

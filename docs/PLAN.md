# Plan / Spec: Product Catalogue PoC

The spec the agent works from. Every phase below is reviewed by a human before the next starts.
Assumptions referenced here (A1, A2, ...) are explained in [DECISIONS.md](../DECISIONS.md).

## Goal
A product catalogue the entrepreneur can click through: browse by category, search, view a
product, and send an enquiry that lands in the sales inbox. It is a **foundation**, not a
throwaway: the product data source, the look and feel, and the email provider are all expected
to change, so each sits behind a boundary that can be replaced without touching the rest.

## Stack
| Layer | Choice | Why |
|---|---|---|
| Client | React 19 + TypeScript, Vite, React Router, TanStack Query | Typed, fast to run, server-state caching without hand-rolled effects |
| Backend | Node 22 + TypeScript, Fastify, Zod | Light, typed, schema validation; `app.inject()` gives real HTTP integration tests without a port; runs on Lambda later via an adapter |
| Shared | `packages/contracts` (Zod schemas + types) | One source of truth for the API shapes used by both sides |
| Email (local) | SMTP to **Mailpit** in Docker | Free, no account; reviewer opens the sales inbox at `localhost:8025` |
| Packaging | npm workspaces, Docker Compose | `docker compose up --build` runs everything |

## Architecture
```
Browser (React SPA)
   |  /api/*   (same origin: Vite proxy in dev, nginx in Docker)
   v
API (Fastify)
   routes ── validate (Zod) ──> services (catalogue, enquiry)
                                   |                    |
                         ProductSource port       EmailSender port
                                   |                    |
                     FakeStoreProductSource        SmtpEmailSender  (-> Mailpit locally, SES/SMTP later)
                     (+ in-memory TTL cache)
   config: featured product ids (A1), sales inbox, SMTP, Fake Store URL (all env, validated at boot)
```
Rules:
- The client **never** calls Fake Store; it only knows our `/api` contract (constraint 2).
- Routes know nothing about Fake Store or SMTP; services depend only on the ports.
- Fake Store's shape is mapped to our `Product` type in exactly one place (the adapter).
- Wiring happens in one composition root (`buildApp(deps)`), so tests inject fakes.

## API contract (v1)
| Method | Path | Returns | Notes |
|---|---|---|---|
| GET | `/api/health` | `{status:"ok"}` | liveness, no upstream calls |
| GET | `/api/categories` | `Category[]` (`{slug, name}`) | |
| GET | `/api/products/featured` | `Product[]` (5) | owner-chosen ids, in configured order (A1) |
| GET | `/api/categories/:slug/products` | `{category, topRated: Product[], more: Product[]}` | top 3 by rating, rest by rating desc (A2); 404 if unknown |
| GET | `/api/products/search?q=` | `Product[]` | `q` trimmed, 1-100 chars; matches title, description, category (A3) |
| GET | `/api/products/:id` | `Product` | 404 if unknown |
| GET | `/api/products/:id/image` | image bytes | proxied from the source so the browser never calls it (A12) |
| POST | `/api/enquiries` | `202 {enquiryId}` | body validated; product looked up server-side (A5); unknown product is a 400 on `productId` (A8) |

Errors use one shape: `{error: {code, message, details?}}`. 400 validation, 404 not found,
429 rate limited, 502 upstream (Fake Store) failure, 500 otherwise. No stack traces leak.

`Product`: `{id, title, price, description, category: {slug, name}, imageUrl, rating: {rate, count}}` (A6);
`imageUrl` is always our own `/api/products/:id/image` (A12).
`EnquiryRequest`: `{productId, name (1-100), email, phone? , message? (<=1000)}`.

## Client pages
| Route | Shows | Criterion |
|---|---|---|
| `/` | 5 featured products | Home |
| `/categories/:slug` | "Top rated" section + "More in this category" | Category |
| `/search?q=` | results, or an empty state | Search (search bar + button in the header on every page) |
| `/products/:id` | details + Enquire button -> form -> "Thank you" | Product, Enquiry |
Header: category links + search. Look and feel lives in CSS variables (design tokens) in one
file so the creative work can be dropped in without touching components.

## Security and robustness basics
- Zod validation on every input; reject unknown fields on the enquiry body.
- Enquiry email is plain text built from validated fields; the product title comes from our
  backend, not the client. Rate limit on `POST /api/enquiries` (per IP).
- Upstream calls have a timeout; failures map to 502 and are logged. Catalogue is cached
  in memory with a TTL so Fake Store isn't hit on every request.
- Secrets/config only via env; `.env.example` committed, `.env` ignored.
- Structured JSON logs with a request id (Fastify/pino); customer contact details are not logged.

## Test plan
| Level | Tool | Covers |
|---|---|---|
| Unit (api) | Vitest | Fake Store mapping, search matching, category split (top rated / more), featured ordering, config validation |
| Integration (api) | Vitest + `app.inject` with fake ports | every route: success, 400, 404, 429, 502 on upstream failure, enquiry sends one email with the right recipient |
| Adapter | Vitest + stubbed `fetch` | Fake Store adapter: mapping, timeout, non-2xx |
| Component (web) | Vitest + React Testing Library + MSW | home shows featured, search submits on button, enquiry form validation + thank-you |
| End to end | Playwright against Docker Compose | the critical path: home -> category -> product -> enquire -> thank you, and the email arrives in Mailpit |
CI (GitHub Actions): lint, typecheck, unit + integration + component tests on every PR.

## Phases (stop for review after each)
1. **Spec** (this file) + agent instructions (`AGENTS.md`).
2. **Contracts + API**: workspace skeleton, contracts package, ports, Fake Store adapter, services, routes, API tests.
3. **Web**: pages, components, design tokens, component tests.
4. **Packaging + E2E**: Dockerfiles, compose with Mailpit, Playwright test, CI workflow.
5. **Docs**: README, DECISIONS.md, AI_USAGE.md, time spent, PR description.

## Out of scope (recorded as cuts in DECISIONS.md)
Auth, persistence of enquiries, admin UI for featured products, pagination, i18n, analytics,
production deployment. Each has a "next step" note.

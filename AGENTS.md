# Agent instructions

Read by any AI coding agent working in this repo (Claude Code reads it through `CLAUDE.md`).

## What this is
A product catalogue PoC meant to grow into a real product. The spec is
[docs/PLAN.md](docs/PLAN.md); decisions and assumptions are in [DECISIONS.md](DECISIONS.md).
If a task conflicts with either, stop and ask instead of improvising.

## Boundaries (do not cross them)
- `apps/web` talks only to our own origin. Never call Fake Store (or any product source) from the client,
  not even for images: product images go through `/api/products/:id/image`, and the source's image URL
  must not appear in any API response (`toPublicProduct` in the routes does this). The CSP
  (`default-src 'self'`) and the E2E suite both enforce it.
- Routes depend on services; services depend on **ports** (`ProductSource`, `EmailSender`), never on
  Fake Store, SMTP or `fetch` directly. Upstream shapes are mapped in the adapter and nowhere else.
- API request/response shapes come from `packages/contracts`. Change the contract there first.
- All wiring happens in `buildApp(deps)`; tests build the app with fakes.

## Coding standards
- TypeScript strict. No `any`; parse unknown input with Zod.
- Errors: throw typed errors (`NotFoundError`, `UpstreamError`, ...) and let the error handler map
  them to `{error: {code, message}}`. Never leak stack traces or upstream bodies to clients.
- Config comes from env, validated at startup; add every new variable to `.env.example`.
- Never log customer contact details (name, email, phone, message).
- Keep components presentational where possible; data fetching lives in hooks under `src/api`.
- Styling uses the CSS variables in `apps/web/src/styles/tokens.css`; no hard-coded colours.

## Workflow
- Small phases; stop for human review after each (see the phases in docs/PLAN.md), unless the human
  explicitly asks for several in one run.
- Every behaviour change comes with a test at the right level (unit, integration, component, e2e).
- Before saying a phase is done: `npm run lint && npm run typecheck && npm test` must pass, and
  report any failure verbatim. For changes to pages, nginx or Docker, also run the E2E suite.
- If every new test passes on the first run, break the code on purpose and check a test fails.
- Record new assumptions in DECISIONS.md as you make them, not at the end.
- Commit messages say why, not only what.

## Commands
Node 22 comes from nvm and is not on PATH in non-interactive shells: start commands with
`source ~/.nvm/nvm.sh && nvm use 22 >/dev/null &&`.

| Task | Command |
|---|---|
| Install | `npm ci` |
| Gate (must pass) | `npm run lint && npm run typecheck && npm test` |
| Run everything | `docker compose up --build` (site :8080, Mailpit inbox :8025) |
| E2E (stack running) | `npm run test:e2e` |
| Stack as CI runs it (Fake Store stand-in) | `docker compose -f docker-compose.yml -f e2e/docker-compose.stub.yml up --build -d --wait` |
| Dev servers | `docker compose up mailpit -d`, then `npm run dev:api` and `npm run dev:web` (:5173) |
| Add a dependency | `npm i <pkg> -w @catalogue/<api\|web\|contracts\|e2e>`; check it landed in that `package.json` |

## Known pitfalls (learned while building; add to this list)
- **Library versions are newer than most agents assume** (TypeScript 6, Vitest 5, ESLint 10, React 19,
  React Router 8, MSW 3, Zod 4, nodemailer 10). Check the installed package's types or README before
  using an API from memory.
- **MSW 3** renamed `onUnhandledRequest` to `onUnhandledFrame`. The old name is silently ignored, so
  unhandled requests would only warn.
- **Zod 4** reads `z.config({ jitless: true })` when a schema is *created*. In the browser it must run in
  `src/zod-setup.ts`, imported first by `main.tsx`, or the CSP blocks Zod's `new Function()` probe on
  every page. Object-level `.refine` does not run when a field already failed.
- **Fake Store** answers `/products/<unknown id>` with 200 and an empty body. Look products up in the
  cached list (the adapter does this).
- **Fake Store blocks cloud runners** (Cloudflare answers 403 from GitHub Actions). CI's E2E job uses
  `e2e/docker-compose.stub.yml` (a recorded copy in `e2e/fake-store-stub/`). If you change what the
  adapter reads from Fake Store, update the stand-in and re-record `products.json` from the real API.
- **Node's `fetch`/SMTP to `localhost`** tries IPv6 and IPv4 and fails with an `AggregateError` whose
  message is empty; read `.errors` (see `describeSmtpFailure`).
- **npm workspaces:** the first `npm i -w <new workspace>` after creating its `package.json` can link the
  workspace without saving the dependency. Run it again and check.
- **zsh** expands `@*` in `npm i '@catalogue/contracts@*'`; quote it.
- **Rate limit in E2E:** 5 enquiries per minute per IP. Re-running the E2E suite many times in a row can
  hit 429.
- **jsdom:** `<output>` has the implicit role `status`; don't use it in test helpers next to real status
  messages.

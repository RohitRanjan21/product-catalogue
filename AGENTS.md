# Agent instructions

Read by any AI coding agent working in this repo (Claude Code reads it through `CLAUDE.md`).

## What this is
A product catalogue PoC meant to grow into a real product. The spec is
[docs/PLAN.md](docs/PLAN.md); decisions and assumptions are in [DECISIONS.md](DECISIONS.md).
If a task conflicts with either, stop and ask instead of improvising.

## Boundaries (do not cross them)
- `apps/web` talks only to our own `/api`. Never call Fake Store (or any product source) from the client.
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
- Small phases; stop for human review after each (see the phases in docs/PLAN.md).
- Every behaviour change comes with a test at the right level (unit, integration, component, e2e).
- Before saying a phase is done: `npm run lint && npm run typecheck && npm test` must pass, and
  report any failure verbatim.
- Record new assumptions in DECISIONS.md as you make them, not at the end.
- Commit messages say why, not only what.

# How AI was used

## Tools and models
- **Claude Code** (CLI) with **Claude Opus 5.5**, for planning, code, tests and docs.
- No other assistants. Every change was made through Claude Code in this repository; I reviewed the
  diffs, ran the app, and decided on scope and trade-offs.

## Context files committed to the repo
- [`AGENTS.md`](AGENTS.md): the rules every agent run follows: boundaries (client only talks to `/api`;
  services depend on ports; upstream shapes mapped only in the adapter), coding standards (strict
  TypeScript, Zod at the edges, typed errors, no customer details in logs, design tokens only) and the
  workflow (small phases, a test with every behaviour change, lint/typecheck/test before "done").
- [`CLAUDE.md`](CLAUDE.md): one line, `@AGENTS.md`, so Claude Code loads the same rules as any other agent.
- [`docs/PLAN.md`](docs/PLAN.md): the spec the agent built from: stack, architecture, API contract, pages,
  security basics, test plan and phases.
- [`DECISIONS.md`](DECISIONS.md): assumptions and decisions, written as they were made so later agent runs
  (and reviewers) work from the same context.
- Between sessions I kept a private handoff note (outside the repo, since it held the brief and personal
  details) so a new agent session started from written context rather than memory.

## How I directed the work
1. **Plan before code.** I gave the agent the brief and asked it to plan. It read the brief, checked the
   machine (Node only through nvm, no GitHub CLI, Docker present, Fake Store reachable) and asked me for
   the decisions I had to own (backend framework, what "top rated" means, how to push, review pace)
   instead of starting to build.
2. **Spec and rules first.** Phase 1 produced only `docs/PLAN.md`, `AGENTS.md` and the first assumptions.
   Nothing else was built until those were agreed.
3. **Phases with review.** Phase 2 (contracts + API) ended with a stop for my review of the diff.
   **Honest note:** to stay inside the time-box I then asked the agent to build phases 3-5 (web, packaging
   + E2E, docs) in one run and reviewed them together at the end, rather than phase by phase. Each phase
   is still its own commit, so the history can be reviewed in steps.
4. **Evidence, not "done".** I required the full lint/typecheck/test run before any phase was called done,
   and manual runs against the real services (Fake Store, Mailpit, the Docker stack) on top of the tests.

## Key prompts and moments
1. **"Help me do it"** (with the brief attached). Shaped the start: the agent asked for my decisions
   before building, which is how the stack and the "top rated" interpretation became *my* choices.
2. **"Do as per the JD."** The agent first recommended NestJS, the framework I use day to day. I asked it
   to follow the job description instead. It re-read it, found no framework named but a strong focus
   on testing at every level, CI, observability, context files for agents and AWS/serverless, and
   switched to Fastify with explicit ports and adapters, added Playwright E2E and CI to the plan, and
   made `AGENTS.md` a first-class file.
3. **Interpreting "top rated"** (A1/A2). The home criterion says "I have chosen 5 products", the category
   criterion doesn't. So the home page is owner-curated (config) and category pages rank by rating. A
   small decision with a visible effect, recorded where reviewers will look.
4. **"Start phase 2 ... following the handoff's guardrails, and stop for my review when phase 2 is
   done."** A new session with written context only: the agent re-read the spec, rules and decisions
   before writing code, and stopped with a review guide.
5. **Mutation checks as a review technique.** When all 81 API tests passed on the first run, the agent
   treated that as suspicious rather than as success: it deliberately broke the code in seven places (logging customer details,
   ignoring the rate limit, leaking error messages, removing stale-cache fallback, ...) to confirm a test
   failed each time. One didn't, and it led to the first fix below. The same was done for the web tests.

## Where the AI got it wrong, and how it was caught
| What went wrong | How it was caught | Fix |
|---|---|---|
| Created the repo in my work projects folder and committed with the machine's global git identity | I stopped it: the repo belonged elsewhere and commits had to come from my personal address | Recreated in the right place; identity set repo-locally |
| **A test passed for the wrong reason.** The "equal rating → more reviews wins" test stayed green when the rule was deleted, because in the fixture the product with more reviews also had the lower id, so the id fallback produced the same order | Mutation check (deleting the rule changed nothing) | Fixture changed so only the review-count rule gives the expected order |
| **Empty error in the logs.** With the mail server down, the log said only "could not send your enquiry" with an empty reason: Node reports a refused `localhost` connection as an `AggregateError` with an empty message | Manual run against a stopped Mailpit, reading the log line | The SMTP adapter turns it into a readable cause (`ECONNREFUSED ::1 ...; 127.0.0.1 ...`); test uses the real error shape |
| **MSW 3 renamed its "fail on unhandled request" option** (`onUnhandledRequest` → `onUnhandledFrame`). The old name was silently ignored at runtime, so a component calling an unexpected endpoint would only have *warned* | Typecheck error; then a mutation (removing a handler) confirmed tests now fail | Switched to the new option |
| **CSP violation on every page.** Zod 4 probes `new Function()` to speed up parsing; the strict CSP refused it. The app worked, so no test failed | Looking at the browser console during a manual check of the Docker stack | `jitless` mode, set in a module imported first (Zod reads the flag when schemas are created; the first fix put it too late and the violation remained). The E2E test now fails on any console error |
| E2E search test assumed every result has the term in its **title**, but the rule (A3) also matches descriptions and category | Re-reading the test against the assumption before running it | The test checks each result against the full rule through our API |
| **Product images loaded from Fake Store's host.** The agent decided images were "assets, not API calls" and allowed them in the CSP. Defensible, but the brief says the client must not call Fake Store, and the browser's network tab would show `fakestoreapi.com` | I asked for a check of the whole submission against the brief and job description; the agent flagged this as the top risk | The API now serves images at `/api/products/:id/image` (catalogue images only, raster types only, size cap); the CSP is `default-src 'self'` and E2E fails on any request to another host |
| A config test expected two Zod error messages together, but Zod 4 skips object-level checks when fields already failed | Re-reading before running | Split into separate tests |

## What was verified beyond the automated tests
The agent ran these checks against the real services during the build; I reviewed the results and the
diffs.
- Every API route against the real Fake Store; the enquiry email in Mailpit (recipient, reply-to, product
  title from our backend, not the client); no customer details in the API or container logs.
- Rate limit can't be dodged with a forged `X-Forwarded-For` header (forged requests still get 429).
- The browser makes no API calls other than our own `/api` (also asserted in E2E), and pages look right on
  desktop and mobile.
- Library versions were newer than the agent's defaults (TypeScript 6, Vitest 5, ESLint 10, React Router 8,
  MSW 3, Zod 4). It checked installed APIs before using them rather than assuming; even so, the MSW rename
  only surfaced at typecheck and the Zod probe only in the browser console, which is why both the
  typecheck and a console-error check are part of the gate.

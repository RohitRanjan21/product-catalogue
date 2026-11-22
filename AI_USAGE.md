# AI usage

## Tools and models
I used **Claude Code** (the CLI) with **Claude Opus 5.5** for everything: planning, code, tests and docs.
No other AI tools. I made the decisions on scope and trade-offs, reviewed the diffs and ran the app.

## Agent instruction files (committed)
- [`AGENTS.md`](AGENTS.md): the rules for any agent working here: the boundaries (the client only talks
  to our backend; services depend on ports, not on Fake Store or SMTP), coding standards, the workflow,
  the commands, and a list of pitfalls we hit during the build so the next run doesn't hit them again.
- [`CLAUDE.md`](CLAUDE.md): one line, `@AGENTS.md`, so Claude Code reads the same rules.

## Plan / spec
[`docs/PLAN.md`](docs/PLAN.md) was written first and agreed before any code: stack, architecture, API
contract, pages, security basics, test plan and five phases. [`DECISIONS.md`](DECISIONS.md) was updated as
decisions were made, so each new agent session (and you) work from the same written context. I also kept
a private handoff note outside the repo (it contained the brief and personal details) so a fresh session
could pick up from it rather than from memory.

## How I worked with the agent
- **Plan, then build in phases.** Phase 1 was only the spec, the rules and the first assumptions. Phase 2
  (contracts + API) ended with a stop so I could review the diff before anything else was built.
- **Phases 3-5 in one run.** To stay near the time-box I then asked for the web app, packaging/E2E and docs
  in one go, and reviewed them together afterwards instead of one by one. Each phase is still a separate
  commit, so the history reads in steps.
- **A check against the brief.** Once everything was built, I gave the agent the brief, the recruiter's email
  and the job description and asked it to check the submission against them. That found the image
  problem below, which I asked it to fix along with two smaller gaps.
- **"Done" means evidence.** No phase counted as done without `lint`, `typecheck` and the full test run
  passing, plus runs against the real services (Fake Store, Mailpit, the Docker stack).

## Key prompts that shaped the solution
1. **"Help me do it"**, with the brief attached. Instead of building straight away, the agent asked me for
   the decisions that were mine to make: which backend framework, what "top rated" means, how to push,
   how often to review. My answer on "top rated" became assumptions A1/A2: the home page shows the 5
   products the owner picks (the criterion says "I have chosen"), category pages rank by rating.
2. **"Do as per the JD."** The agent first suggested NestJS, which I use day to day. I told it to follow the
   job description instead. That pointed to testing at every level, CI, observability, agent context files
   and AWS, so the plan changed to Fastify with explicit ports and adapters, Playwright E2E and CI, and
   `AGENTS.md` as a proper file rather than an afterthought.
3. **"Start phase 2 (contracts + API) on a new branch feature/catalogue-poc, following the handoff's
   guardrails, and stop for my review when phase 2 is done."** A new session that only had the written
   context. It re-read the spec, rules and decisions first, then built the API and stopped with a guide on
   what to review.
4. **"Do all the phases together now, in one go."** My call, to save time. The agent pointed out it went
   against the phase-by-phase rule in `AGENTS.md`, did it anyway as asked, kept one commit per phase, and
   still stopped before pushing anything.
5. **"Let me give you the JD and assessment and you just check if everything is as per asked."** Then
   **"yes, fix 1, 3 and 4"**. This found that product images were still loaded from Fake Store's host, that
   `AGENTS.md` hadn't been updated since phase 1, and some small doc drift. All three were fixed.

## Where the AI got it wrong, and how it was caught
| What went wrong | How it was caught | Fix |
|---|---|---|
| Created the repo in my work projects folder and committed with the machine's global git identity | I stopped it | Recreated in the right folder, with my personal identity set for this repo only |
| **Product images came from Fake Store's host.** All product data went through our API, but the agent treated images as "just assets" and allowed `fakestoreapi.com` in the CSP. The brief says the client must not call Fake Store, and the browser's network tab would show it | The check against the brief (prompt 5) | Images are now served by our API at `/api/products/:id/image` (only for catalogue products, raster types only, size cap). The CSP allows only our own site, and E2E fails on any request to another host |
| **A test passed for the wrong reason.** The "equal rating, more reviews wins" test stayed green when that rule was deleted: in the test data the product with more reviews also had the lower id, so the fallback gave the same order | Mutation check (see below) | Test data changed so only the review-count rule gives the right order |
| **An empty error in the logs.** With the mail server down, the log said only "could not send your enquiry" with no reason. Node reports a refused `localhost` connection as an `AggregateError` with an empty message | A manual run against a stopped Mailpit | The email adapter now writes out the real reasons (`ECONNREFUSED ::1 ...; 127.0.0.1 ...`); tested with that exact error shape |
| **A test setting silently ignored.** MSW 3 renamed `onUnhandledRequest` to `onUnhandledFrame`. With the old name, a component calling an unexpected endpoint would only have warned, not failed the test | The typecheck; then removing a handler on purpose confirmed tests now fail | Switched to the new name |
| **Blocked script on every page.** Zod 4 tries `new Function()` to speed up parsing, and our CSP refuses it. The app still worked, so no test failed | Reading the browser console during a manual check of the Docker stack | Zod's `jitless` setting, in a file imported first. The first attempt put it too late and the error stayed. E2E now fails on any console error |
| The E2E search test assumed every result has the search term in its **title**, but the rule also matches description and category | Re-reading the test against assumption A3 | Each result is checked against the full rule |
| A config test expected two Zod error messages together, but Zod 4 skips object-level checks when a field has already failed | Re-reading before running | Split into two tests |

## How the output was checked
- **Mutation checks.** When all 81 API tests passed on the first run, the agent didn't take that as success.
  It broke the code on purpose (logging customer details, ignoring the rate limit, leaking error messages,
  dropping the stale-cache fallback, allowing SVG images, and more) and confirmed a test failed each
  time. That is how the wrong-reason test above was found. The same was done for the web tests and the
  image endpoint.
- **Runs against the real thing**, by the agent, with me reviewing the results:
  - every API route against Fake Store;
  - the enquiry email in Mailpit (right recipient and reply-to, and the product title taken from our
    catalogue, not from the browser);
  - no customer details in the API or container logs;
  - a forged `X-Forwarded-For` header can't get round the enquiry rate limit;
  - pages checked on desktop and mobile;
  - a fresh checkout passes the full test run.
- **Newer library versions than the agent expected** (TypeScript 6, Vitest 5, ESLint 10, React Router 8,
  MSW 3, Zod 4). It checked installed APIs before using them, but two problems still got through and were
  only caught by the typecheck and the browser console. That's why both are now part of the checks, and
  why these traps are listed in `AGENTS.md`.

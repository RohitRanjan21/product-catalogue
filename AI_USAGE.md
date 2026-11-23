# AI usage

## Tools and model

I built this with Claude Code (the command-line tool) running Claude Opus 5.5. I didn't use any other AI
tools. The agent wrote the code, tests and most of the docs; I decided what to build, made the calls on
scope and trade-offs, and pushed back when something looked wrong.

## Agent instruction files

Both are committed to the repo:

- `AGENTS.md` holds the rules every agent run follows: keep the client talking only to our backend, keep
  Fake Store and SMTP behind ports, validate input with Zod, never log customer details, and run lint,
  typecheck and tests before calling anything done. It also lists the commands and the pitfalls we ran
  into, so the next session doesn't trip over them again.
- `CLAUDE.md` is a single line (`@AGENTS.md`) so Claude Code picks up the same rules.

## Plan / spec

Before any code, I had the agent write `docs/PLAN.md`: the stack, the architecture, the API contract, the
pages, the security basics, the test plan and five phases. I read it and agreed it first. Decisions and
assumptions went into `DECISIONS.md` as they came up, not at the end.

I also kept a handoff note outside the repo (it had the brief and some personal details in it). When I
started a new session, the agent read that note plus the spec and rules instead of relying on memory.

## How I worked with it

I started by building in phases with a stop after each one. Phase 1 was just the spec and rules. After
phase 2 (the contracts and the API) I stopped to look at the diff before going on.

For the rest (the web app, Docker and E2E tests, and the docs), I asked the agent to do all three
phases in one go to save time. That broke the phase-by-phase rule I'd written in `AGENTS.md`, and the
agent said so, but it was my call. It still kept a separate commit for each phase and didn't push
anything.

Once everything was built, I gave the agent the original brief, the recruiter's email and the job
description and asked it to check the submission against them, line by line. That turned up one real
problem (images, see below) and a couple of small gaps, which I had it fix.

## Prompts and moments that shaped the solution

1. **"Help me do it"**, with the brief attached. I expected it to start coding. Instead it asked me the
   questions only I could answer: which backend framework, what "top rated" should mean, how I wanted to
   push, how often I wanted to review. The "top rated" answer became assumptions A1 and A2: the home page
   shows the 5 products the owner picks (the criterion literally says "I have chosen"), while category
   pages rank by rating.

2. **"Do as per the JD."** It first suggested NestJS because that's what I use at work. I told it to follow
   the job description instead. The JD doesn't name a framework, but it leans hard on testing at every
   level, CI, observability, agent context files and AWS. So we went with Fastify and explicit ports and
   adapters, added Playwright and CI to the plan, and treated `AGENTS.md` as a real deliverable.

3. **"Start phase 2 (contracts + API) on a new branch feature/catalogue-poc, following the handoff's
   guardrails, and stop for my review when phase 2 is done."** This was a fresh session with only the
   written notes to go on. It read the spec, rules and decisions first, built the API, and stopped with a
   short guide on what to look at.

4. **"Do all the phases together now, in one go."** The time-saving decision described above.

5. **"Let me give you the JD and assessment and you just check if everything is as per asked."** Followed
   by "yes, fix 1, 3 and 4". This is the one I'd point to: it caught a gap that every test was passing
   straight over.

## Where the AI got it wrong, and how it was caught

| What went wrong | How it was caught | What we did |
|---|---|---|
| It created the repo in my work projects folder and committed with the machine's global git identity. | I noticed and stopped it. | Moved the repo and set my personal git identity for this repo only. |
| Product images were loading from Fake Store's own server. All product data went through our API, but the agent treated images as "just assets" and allowed them. The brief says the client must not call Fake Store, and anyone opening the network tab would have seen it. | The check against the brief (prompt 5). | The API now serves images itself at `/api/products/:id/image`. The browser is only allowed to talk to our own site, and the E2E test fails if it talks to anything else. |
| A test was passing for the wrong reason. The "same rating, more reviews wins" test stayed green even with that rule deleted, because in the test data the product with more reviews also happened to have the lower id. | Breaking the code on purpose (see below). | Changed the test data so only the review-count rule gives the right order. |
| When the mail server was down, the log just said "could not send your enquiry" with an empty reason. Node reports a refused connection to `localhost` as an error with a blank message. | Running the app with the mail server switched off and reading the log. | The email adapter now logs the real reasons (connection refused on both IPv6 and IPv4). |
| A test setting was silently ignored. The mocking library (MSW 3) had renamed the option that makes tests fail on unexpected requests. With the old name, those requests would only have printed a warning. | The typecheck flagged it. | Switched to the new name and confirmed tests now fail when they should. |
| Every page logged a security error. Zod (the validation library) quietly tries a trick our security policy blocks. The site still worked, so no test noticed. | Looking at the browser console while checking the site by hand. | Turned that Zod feature off. The first fix didn't work because it ran too late; the second did. The E2E test now fails on any console error. |
| An E2E test assumed every search result has the search word in its title, but search also matches descriptions and categories. | Re-reading the test against assumption A3. | The test now checks each result against the full rule. |
| A config test expected two error messages at once, but Zod skips some checks once a field has already failed. | Re-reading it before running. | Split it into two tests. |
| The E2E suite depended on the real Fake Store, and the CI job had never actually run. Fake Store blocks GitHub's servers, so on the first CI run every product request got HTTP 403 and 4 of the 5 E2E tests failed. Locally they had all passed. | The first CI run after pushing. The API's logs in the job said exactly why. | In CI, a small stand-in now serves a recorded copy of the real catalogue, and the API is pointed at it by config alone. Locally, the suite still runs against the real Fake Store. |

## How the output was checked

When all 81 API tests passed on the very first run, the agent didn't trust it. It broke the code on
purpose in a handful of places (logging customer details, ignoring the rate limit, leaking error
messages, allowing SVG images and so on) and made sure a test failed every time. That's how it found the
test that was passing for the wrong reason. It did the same for the web tests and the image endpoint.

The agent also tried things against the real services, and I went through the results:
- every API route against Fake Store;
- the enquiry email arriving in Mailpit with the right recipient and reply-to, and the product name taken
  from our catalogue rather than from the browser;
- no customer details in any logs;
- a faked `X-Forwarded-For` header can't get round the enquiry rate limit;
- the pages on desktop and mobile;
- a fresh checkout passing the full test run.

The libraries were newer than the versions the agent knew best (TypeScript 6, Vitest 5, ESLint 10,
React Router 8, MSW 3, Zod 4). It looked up the installed APIs instead of guessing, but two problems still
slipped through and only showed up in the typecheck and the browser console. That's why both are part of
the checks now, and why those traps are written down in `AGENTS.md`.

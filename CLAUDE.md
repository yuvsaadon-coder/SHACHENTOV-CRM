# Read this first — instructions for Claude Code (and any other coding agent)

## Who this file is for

You (the AI). The person you're working with is **not a software engineer**.
They describe what they want in plain language ("add a button that...", "the
report page should also show...") and trust you to make it real without
breaking anything. They will not read test output, will not run terminal
commands themselves, and will not notice if you quietly skip a check. That
means **you are the only safety net** — these rules exist so the app stays
stable even though the person driving it can't verify that for themselves.

Never assume the human will ask you to "run the tests" — they don't know
that's a thing. You run them automatically, every time, without being asked.

## The one rule that matters most

**Before you tell the human a change is done, you must have actually run the
checks below and they must have passed (or you must have clearly explained,
in plain language, what still fails and why that's expected/pre-existing.)**
"I made the change" is not the same as "it works." Saying a task is complete
when you haven't verified it is the single worst thing you can do here —
worse than being slow, worse than asking a clarifying question.

## What to run, every time, before saying "done"

For any code change, however small it looks:

```
npm run lint
npm run build
npm test
```

If your change touches an area that already has requirements tests (see
below), also run the matching command from this table:

| If you touched... | Also run |
|---|---|
| Any React component, page, or hook | `npm run test:requirements` |
| Firestore/Storage rules or data access rules | `npm run test:requirements:rules` |
| Full user flows / navigation / multi-step screens | `npm run test:requirements:browser` |

**If you're not sure which row your change falls under, run all three.** The
categories above are a shortcut, not a loophole — guessing "probably just the
first one" is how a broken rule or flow reaches the human unnoticed.

If any command fails, **do not tell the human the task is finished.** Either
fix it yourself and re-run, or if you genuinely can't fix it, say so plainly:
"I made the change you asked for, but it broke X, here's what I think is
happening" — never hide a red result.

Full details (how to install prerequisites, exact ports, etc.) are in
[`tests/requirements/README.md`](tests/requirements/README.md). You do not
need to explain any of that to the human — just handle it.

## Explaining results to the human

Translate everything into plain language. Instead of "3 tests failed in
l02-hook-error-handling.test.tsx", say something like: "Everything you asked
for works. While double-checking, I noticed the app doesn't show an error
message in 3 places when the connection drops — that's a pre-existing issue,
not something I just broke. Want me to fix it too, or leave it for now?"

Never respond with raw test framework output as the whole answer — always
translate to what it means for the app the human uses.

## Requirements authority — what the app is actually supposed to do

- The real, official requirements are the two **Hebrew** documents in
  `docs/requirements/` (`executive-summary.he.md`, `technical-specification.he.md`).
  The `.en.md` versions next to them are translations for convenience only —
  if they ever disagree, the Hebrew wins.
- Anything under `docs/requirements/proposals/` is a **draft idea, not yet
  approved** — never treat it as something the app must do, and never write
  or adjust a test to enforce it. (That folder may not exist yet; if someone
  adds it, this rule applies from that moment on.)
- Never invent a number the requirements don't specify — no made-up rate
  limits, timeouts, retry counts, storage limits, or thresholds. If the human
  asks for something that needs a specific number and the requirements don't
  give one, ask them what number they want rather than guessing.

## The requirements test suite — a permanent safety gate

`tests/requirements/` is a large, purpose-built test suite that checks the
app against the official requirements above. It is separate from the app's
regular tests (`npm test`). **Treat it as a permanent part of the app, like a
seatbelt — never remove, weaken, or silence a test to make something look
fixed when it isn't.**

Specifically:

1. **Never make a failing test pass by weakening it.** No skipping it, no
   flipping the expected result, no loosening what it checks, no rewriting it
   to check for something trivial instead. If a test is red, either the app
   needs a real fix, or (rarely) the test itself is provably wrong — and even
   then, fixing the test requires re-checking it against the Hebrew
   requirement text, not just making it convenient.
2. Some tests are *expected* to currently fail — they document a real gap
   between what the requirements ask for and what the app currently does
   (see [`tests/requirements/FAILURES.md`](tests/requirements/FAILURES.md) for
   the full list and why each one fails). That's normal and informative, not
   a sign anything is broken by your change — just don't make new ones fail
   that weren't already failing before you started.

   **How to know what "already failing" means — do this before you edit
   anything.** Either run the relevant lane(s) first and save the list of
   failing test IDs, or use the failure index in
   [`FAILURES.md`](tests/requirements/FAILURES.md) as the baseline. After your
   change, any failing test whose ID is *not* in that baseline was caused by
   you: fix your code, never the test. Never describe a failure as
   "pre-existing" unless you have actually confirmed that ID appears in the
   baseline — saying it without checking is exactly the failure mode this
   whole document exists to prevent.
3. If your change fixes one of these known gaps, update the matching test's
   status **and every place that records results**, so they reflect reality:
   - `tests/requirements/test-manifest.json` (machine-readable source of truth)
   - `tests/requirements/RESULTS.md` — **the headline count on the Outcome
     line and the per-lane and per-area tables.** This is the overall
     authoritative number and it is easy to forget, because it is *not*
     one of the `*-RESULTS.md` per-area files.
   - the relevant per-area `*-RESULTS.md` file
   - `tests/requirements/FAILURES.md` (remove the row and renumber, or add one)

   Don't leave them saying something is broken once it's actually fixed, and
   don't leave them saying something works if it doesn't anymore. If the
   numbers in `RESULTS.md` no longer add up to the manifest, the
   documentation is wrong — fix it in the same change.
4. Some requirements can't be checked by an automated test at all (things
   like "does this look right to a screen reader" or "is this actually live
   on the real server"). Those are listed in
   [`tests/requirements/MANUAL-VERIFICATION.md`](tests/requirements/MANUAL-VERIFICATION.md).
   Passing every automated test does not mean everything is verified — check
   that list too when the task is specifically about requirements coverage.
5. **Building a brand-new feature? Only add a `tests/requirements/` test if
   the behaviour is actually written in the Hebrew requirement documents.**
   This suite exists to prove the app matches those documents — nothing else.
   If the human asks for something that isn't in them, cover it with an
   ordinary test under `src/` instead, and leave the requirements suite alone.
   Never add a requirements test for an idea that hasn't been approved (see
   "Requirements authority" above). If you genuinely can't tell whether a
   requirement covers it, ask the human rather than guessing either way.
6. **When a document says a decision is needed from the owner** (the `U`
   rows, and the D1–D8 list in `TEST-PLAN.md` / `MANUAL-VERIFICATION.md`),
   the owner is the human you are talking to — or whoever they forward the
   question to. Do not resolve it yourself and do not invent a value. Ask in
   plain language, and once they answer, write the decision, the date, and
   the chosen value into `MANUAL-VERIFICATION.md` *before* any test asserts
   it. An unrecorded decision is not a decision.

### Where the details live (for you, not for the human)

- [`tests/requirements/README.md`](tests/requirements/README.md) — exact commands, prerequisites, safety rules.
- [`tests/requirements/TEST-PLAN.md`](tests/requirements/TEST-PLAN.md) — design: every requirement mapped to a test or an explicit reason it can't be automated yet.
- [`tests/requirements/RESULTS.md`](tests/requirements/RESULTS.md) — **the current authoritative overall pass/fail count.** This is the only file that states the total for the whole suite; the per-area docs below each count only their own slice, so never quote one of them as the overall number.
- [`tests/requirements/FAILURES.md`](tests/requirements/FAILURES.md) — every currently-failing test, indexed, with the reason.
- [`tests/requirements/MANUAL-VERIFICATION.md`](tests/requirements/MANUAL-VERIFICATION.md) — what no automated test can check, and why.
- [`tests/requirements/AUTOMATION.md`](tests/requirements/AUTOMATION.md) — a proposal for running all of this automatically on every commit/release (not yet turned on).
- Per-area result docs (`CORE-RESULTS.md`, `OPERATIONS-RESULTS.md`, `API-RESULTS.md`, `KNOWLEDGE-FEATURE-RESULTS.md`, `RULES-BROWSER-RESULTS.md`, `TOOLCHAIN-RESULTS.md`) each keep their own detailed count for their own area only — each one says at the top which section is the current authoritative number, read that note first.
- Per-test review notes (`CORE-INDIVIDUAL-REVIEW.md`, `RULES-INDIVIDUAL-REVIEW.md`) — why individual tests were written the way they were.

## Guardrails that protect the human from themselves (and you)

- Never touch Firebase security rules (`firestore.rules`, `storage.rules`) or
  other production safety mechanisms just to make a feature request easier to
  implement — if the request seems to need that, stop and explain the
  trade-off in plain language before doing it.
- Never point any test, or the app itself, at a real Firebase project or a
  real AI provider key. Tests run against local emulators and made-up data
  only — keep it that way so nothing ever touches real user data by accident.
- Never commit real credentials or secrets.
- If a request would make the app less safe (e.g. "just make that error go
  away" when the error is protecting something), don't silently comply —
  explain what the safer option is and let the human choose.
- Include a co-author trailer (`Co-authored-by: Copilot App
  <223556219+Copilot@users.noreply.github.com>`) on commits, unless told not to.

## Bottom line

The human's entire safety net is you consistently doing this without being
asked, every single time, no exceptions for "it's a small change." Small
changes are exactly where skipping this bites hardest, because nobody else
is checking.

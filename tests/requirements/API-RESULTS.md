# API-RESULTS.md — F-family (F01–F10) requirements-test results

## Ownership and scope

This session retains **only** the F-family API contract tests:

- `tests/requirements/contracts/{F01,F08,F10}.test.ts` — 17 tests, network-free (behavior lane, no
  emulator, no live network — provider/network access guarded).
- `tests/requirements/emulator/knowledge/contracts/F01–F08.test.ts` — real-emulator (genuine Firebase
  Admin/Auth/Firestore emulator, no in-memory query fakes).

K01–K08/H01–H07 and all shared `knowledge-*` support helpers are **out of scope** — rejected by the
parent, transferred to a new owner (session `8a9f58c2`), who exclusively owns
`tests/requirements/KNOWLEDGE-FEATURE-RESULTS.md`. That file is not authored, edited, or overwritten by
this session — see it directly for K/H status. This file does not restate or rely on any K/H claim.

The `src/pages/HQChatPage.tsx` Authorization-header line remains **content-exclusion-blocked** by every
tool (`view`/`grep`/PowerShell) — its exact byte content is still explicitly **unverified**, no bypass
attempted, no reconstruction/quoting. No production code has been touched at any point this session.

---

## CURRENT STATUS (this is the authoritative, current state — supersedes all narrative below)

**F69 total: 33 passed / 36 failed. Fully reviewed: 69/69 cases each have a distinct leaf reviewer
verdict. Nothing is pending.** Source is currently **FROZEN** — the parent holds the emulator lease for
combined final validation (behavior + emulator + browser); no test/support/config edits or service
starts are being made by this session while that run is in progress.

- **17 network-free** (`contracts/{F01,F08,F10}.test.ts`), run co-located together (not per-file) this
  round: **10 passed / 7 failed**. Artifact: `tests/requirements/artifacts/f-networkfree-colocated-final.json`.
- **52 real-emulator** (`emulator/knowledge/contracts/F01–F08.test.ts`, F09 removed as an invalid
  oracle — see below), from a genuine live run against real Firebase Auth+Firestore+Storage emulators,
  run twice back-to-back for determinism (identical both times): **23 passed / 29 failed**. Artifacts:
  `tests/requirements/artifacts/knowledge-full-run.json` (full 65-test run incl. 13 H regression tests,
  unmodified/not edited by this session) and the filtered F-only `tests/requirements/artifacts/API-emulator-final.json`.
- **Every one of the 69 cases has an independent leaf reviewer verdict**: **33 PASS, 36 CONFIRMED
  PRODUCTION DEFECT, 0 TEST DEFECT, 0 INFRA/ENVIRONMENT** — exactly matching the live pass/fail split,
  verified programmatically with zero mismatches. Two leaf-reviewer errors were caught and corrected by
  direct re-verification rather than accepted at face value (see "Reviewer corrections" below).
- **F09's three tests remain removed** (direct handler harness cannot observe Netlify platform
  log/metric correlation — an invalid oracle for this test type). The underlying requirement (§7L137,
  correlation/observability) is preserved as a documented, non-runnable, manual-evidence requirement —
  not counted among the 69, not claimed satisfied or violated by any automated test.
- No test was fixed by hand-correcting its oracle to match production. No production, H-family, or
  shared-helper file was edited by this session. Every failure traces to a real, cited production defect
  (unvalidated body shapes, bypassable denial checks, unredacted error reflection) — none is a
  harness/fixture artifact.

### Known stale source comments — flagged for parent cleanup, NOT edited (source frozen)

Two files contain narrative/historical comments (referencing past edits/turns rather than describing
current behavior — a style violation, not a functional defect) that should be cleaned up **after** the
current combined-validation run, since source is frozen right now:

- `tests/requirements/emulator/knowledge/contracts/F08.test.ts:91-99` — the "NOTE on timeout" comment
  narrates "a prior edit... dropped the explicit timeout... restored here", "the earlier
  (now-removed) unreachable-port approach", "item B, below" — all historical narrative, not a
  description of current behavior.
- `tests/requirements/emulator/knowledge/contracts/F08.test.ts:107-111` — the sentinel-comment says
  "unlike the earlier bad-port ECONNREFUSED approach, which produced..." — same issue.
- `tests/requirements/emulator/knowledge/contracts/F07.test.ts:20-21` — the file's top docstring says
  "this was previously ambiguous in this file... and has been rewritten explicitly" — historical
  narrative in a permanent doc-comment.
- `tests/requirements/emulator/knowledge/contracts/F07.test.ts:124` — inline comment `// Fix (API strict
  round2, item C): ...` labels the code change by round/item number instead of describing what the code
  currently does.

None of these affect test behavior or correctness — confirmed functionally correct via the full leaf
review below. This is a documentation-only cleanup item for whoever next has write access to these
files.

### Reviewer corrections (2 leaf-reviewer claims overturned after direct re-verification)

- `E:TEST-F05.chat.branchId-absent`: a leaf reviewer incorrectly claimed the test sends no
  `Authorization` header at all (and is therefore vacuous). Directly re-checked
  (`emulator/knowledge/contracts/F05.test.ts:182-193`): it DOES send a real, valid
  `authorization: 'Bearer ' + coordAToken` header, and `chat.ts` checks auth (line 40-41) before
  `branchId` (line 61-62) — so the test genuinely, non-vacuously exercises the branchId-absent path
  after real auth succeeds. Corrected verdict: **PASS**.
- `E:TEST-F07.portal-login.config-error-safe`: a leaf reviewer claimed a TEST DEFECT because the test
  only checks the HTTP response body, not "logs," citing F07's registry row. Directly verified
  `netlify/functions/portal-login.ts` has **zero** `console.*` calls anywhere in this path — there is no
  log-output surface to check in this specific misconfiguration scenario, so the response-body
  assertion is the complete observable leak surface. Corrected verdict: **PASS**.

### Full F69 test → verdict mapping (persistent record)

| # | Test ID | Lane | Actual | Verdict |
|---|---|---|---|---|
| 1 | TEST-F01.ai-proxy.post-scaffold | network-free | pass | PASS |
| 2 | TEST-F01.ai-proxy.wrong-method | network-free | pass | PASS |
| 3 | TEST-F01.summarize-article.valid-json | network-free | pass | PASS |
| 4 | TEST-F01.portal-login.malformed-json | network-free | fail | CONFIRMED PRODUCTION DEFECT |
| 5 | TEST-F01.summarize-article.malformed-json | network-free | fail | CONFIRMED PRODUCTION DEFECT |
| 6 | TEST-F01.portal-login.invalid-shape.null | network-free | fail | CONFIRMED PRODUCTION DEFECT |
| 7 | TEST-F01.summarize-article.invalid-shape.null | network-free | fail | CONFIRMED PRODUCTION DEFECT |
| 8 | TEST-F01.portal-login.invalid-shape.array | network-free | pass | PASS |
| 9 | TEST-F01.summarize-article.invalid-shape.array | network-free | pass | PASS |
| 10 | TEST-F01.portal-login.invalid-shape.wrong-field-type | network-free | fail | CONFIRMED PRODUCTION DEFECT |
| 11 | TEST-F01.summarize-article.invalid-shape.wrong-field-type | network-free | fail | CONFIRMED PRODUCTION DEFECT |
| 12 | TEST-F08.portal-config-safe | network-free | pass | PASS |
| 13 | TEST-F08.chat-config-safe | network-free | pass | PASS |
| 14 | TEST-F08.hq-config-safe | network-free | pass | PASS |
| 15 | TEST-F08.summarize-import-time-key | network-free | pass | PASS |
| 16 | TEST-F08.summarize-unusable-config | network-free | fail | CONFIRMED PRODUCTION DEFECT |
| 17 | TEST-F10.wrong-method | network-free | pass | PASS |
| 18 | TEST-F01.portal-login.valid-json | emulator | pass | PASS |
| 19 | TEST-F01.chat.media.missing | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 20 | TEST-F01.chat.media.wrong | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 21 | TEST-F01.hq-chat.media.missing | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 22 | TEST-F01.hq-chat.media.wrong | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 23 | TEST-F01.chat.malformed-json | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 24 | TEST-F01.hq-chat.malformed-json | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 25 | TEST-F01.chat.invalid-shape.null | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 26 | TEST-F01.hq-chat.invalid-shape.null | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 27 | TEST-F01.chat.invalid-shape.array | emulator | pass | PASS |
| 28 | TEST-F01.hq-chat.invalid-shape.array | emulator | pass | PASS |
| 29 | TEST-F01.chat.invalid-shape.wrong-field-type | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 30 | TEST-F01.hq-chat.invalid-shape.wrong-field-type | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 31 | TEST-F02.normalized-uid-success | emulator | pass | PASS |
| 32 | TEST-F02.non-enumerating-failure | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 33 | TEST-F02.empty-digits-denial | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 34 | TEST-F02.current-name-query-limit | emulator | pass | PASS |
| 35 | TEST-F03.missing-token | emulator | pass | PASS |
| 36 | TEST-F03.invalid-token | emulator | pass | PASS |
| 37 | TEST-F03.foreign-membership | emulator | pass | PASS |
| 38 | TEST-F03.role-required | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 39 | TEST-F04.coordinator-denial | emulator | pass | PASS |
| 40 | TEST-F04.missing-profile-denial | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 41 | TEST-F04.missing-role-denial | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 42 | TEST-F04.unknown-role-denial | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 43 | TEST-F04.valid-hq-success | emulator | pass | PASS |
| 44 | TEST-F04.domain-access-current | emulator | pass | PASS |
| 45 | TEST-F05.chat.messages-null | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 46 | TEST-F05.chat.messages-object | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 47 | TEST-F05.chat.invalid-role | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 48 | TEST-F05.chat.nonstring-content | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 49 | TEST-F05.chat.blank-content | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 50 | TEST-F05.chat.branchId-absent | emulator | pass | PASS *(corrected, see above)* |
| 51 | TEST-F05.chat.branchId-wrong-type | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 52 | TEST-F05.chat.extra-field-no-authority-expansion | emulator | pass | PASS |
| 53 | TEST-F05.hq-chat.messages-null | emulator | pass | PASS |
| 54 | TEST-F05.hq-chat.messages-object | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 55 | TEST-F05.hq-chat.invalid-role | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 56 | TEST-F05.hq-chat.nonstring-content | emulator | pass | PASS |
| 57 | TEST-F05.hq-chat.blank-content | emulator | pass | PASS |
| 58 | TEST-F05.hq-chat.scopes-invalid-type (C) | emulator | pass | PASS |
| 59 | TEST-F05.hq-chat.scopes-empty-array (C) | emulator | pass | PASS |
| 60 | TEST-F06.current-unbounded-request | emulator | pass | PASS |
| 61 | TEST-F06.current-nonsettling-provider | emulator | pass | PASS |
| 62 | TEST-F07.chat.provider-error-redaction | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 63 | TEST-F07.hq-chat.provider-error-redaction | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 64 | TEST-F07.hq-chat.partial-source-error-redaction | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 65 | TEST-F07.portal-login.config-error-safe | emulator | pass | PASS *(corrected, see above)* |
| 66 | TEST-F08.health-valid-get | emulator | pass | PASS |
| 67 | TEST-F08.configured-provider-failure-redaction | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 68 | TEST-F08.configured-firestore-failure-redaction | emulator | fail | CONFIRMED PRODUCTION DEFECT |
| 69 | TEST-F10.post-disabled | emulator | pass | PASS |

**Per-file breakdown (network-free):** F01 5p/6f, F08 4p/1f, F10 1p/0f = 10p/7f/17.
**Per-file breakdown (emulator):** F01 3p/10f, F02 2p/2f, F03 3p/1f, F04 3p/3f, F05 7p/8f, F06 2p/0f,
F07 1p/3f, F08 1p/2f, F10 1p/0f = 23p/29f/52.

This is complete and current. No pending review, no pending run, no contradictory historical claim.

---

## History (superseded narrative, kept for audit trail only — see CURRENT STATUS above for the facts)

Everything below this line is the round-by-round history of how the CURRENT STATUS above was reached.
Any "PENDING" / "not yet verified" / "no live run this round" language below describes the state
*at the time it was written*, not the current state — it has since been superseded by the live,
twice-reproduced, fully-reviewed run documented above.

### Round1 disposition — 7 items from the parent's initial API review

| # | Item | Resolution |
|---|---|---|
| 1 | F09's three tests are invalid oracles (direct handler harness can't observe Netlify platform log/metric correlation) | `emulator/knowledge/contracts/F09.test.ts` deleted entirely (3 tests removed). The requirement is preserved as an operational/manual-evidence checklist item, not a counted automated test. |
| 2 | F02.current-name-query-limit used a forbidden mirrored-query-to-decide-oracle pattern | Rewrote to seed deterministic doc IDs (`coord-shared-01`…`coord-shared-06`); relies on Firestore's documented default ascending-by-document-ID ordering so expectations are fixed constants, not derived from a live "mirror" query. |
| 3 | Don't hardcode exact status codes for denial cases absent an explicit spec mandate | F04's `missing-profile-denial`/`missing-role-denial`/`unknown-role-denial` relaxed to `>=400 && <500` + `anthropicCalls===0`, not exact `403`. `coordinator-denial` (a known-good control, §4 roles is firm/closed) kept exact `403`. F01/F03 audited — already compliant. |
| 4 | Malformed scopes (non-array/empty-array): remove "safe/never expands authority" over-claim, reclassify G→C | Both tests renamed with `(C)` suffix; `beforeAll` seeds two unique sentinel docs (`HQ_SCOPE_FALLBACK_SENTINEL`, `BRANCH_SCOPE_FALLBACK_SENTINEL`); each test asserts the captured system prompt contains the HQ sentinel and excludes the branch sentinel, documenting the current default source set without an overreaching policy claim. |
| 5 | F06 max_tokens:1000 is literal-only; release the deliberately-non-settling provider promise | `current-nonsettling-provider` uses a controllable resolver instead of a permanently-dangling promise; released and awaited to completion after the watchdog observation. |
| 6 | Add CONFIGURED provider-failure and CONFIGURED Firestore-failure redaction cases | Added `TEST-F08.configured-provider-failure-redaction` and `TEST-F08.configured-firestore-failure-redaction`. |
| 7 | Stale comment incorrectly claiming `unit-env.ts` resets keys in the emulator lane | Fixed in `F05.test.ts`, `F06.test.ts`, `F07.test.ts`. |

Also done: retired the former mixed `KNOWLEDGE-RESULTS.md` in favor of this F-only file. (An earlier
version of this cleanup mistakenly also created `KNOWLEDGE-FEATURE-RESULTS.md` in the new K/H owner's
exclusive namespace — deleted, and the new owner notified so they could create their own version there.)

### Round2 — 3 real bugs found by the parent's strict review, fixed

- **(A) F06** `current-nonsettling-provider`: the release resolver was assigned lazily only once the
  stub fired; if real Firestore I/O preceding the provider call exceeded the 500ms watchdog window, the
  end-of-test release ran as a no-op before the stub ever fired, and the real fetch created afterward
  hung forever. Fixed: resolver + a provider-entry signal are created before the handler is invoked; the
  test waits for genuine provider entry (bounded 10s) before starting the watchdog measurement, and
  always releases + awaits the handler in `finally`. **Verified live this session: both F06 tests
  complete in 779ms total, no hang.**
- **(B) F08** `configured-firestore-failure-redaction`: pointing at an unreachable port produced a
  generic, secret-free ECONNREFUSED-class error (redaction assertions passed vacuously — nothing
  sensitive was ever present to redact), and separately timed out at 20s from real gRPC backoff. Fixed:
  replaced with a real SDK-transport-fault-seam (`vi.spyOn` rejecting exactly one of the three
  collections' real Query `.get()` calls with a distinctive sentinel) while the other two collections
  stay genuinely real, with an explicit failure-count assertion. A follow-up edit had accidentally
  dropped the per-test timeout override during this rewrite, causing a recurrence of the 20s timeout;
  restored an explicit 30000ms timeout. **Verified live this session: runs fast (57ms), no timeout.**
- **(C) F07** `partial-source-error-redaction`: `domainFilter: [SENTINEL]` (array, not the expected
  string) did not guarantee a throw — Firestore's `in` filter accepts array-typed values, so the query
  could genuinely succeed empty with no error, making "200 + sentinel absent" a false pass. Fixed:
  injects a real transport-level fault on exactly the 'hq' source's real Query while a genuinely seeded
  'global'-scope document is a real positive control. The parent's own further static review then found
  this fix still had a false-positive blocker: the positive-control marker was checked against the HTTP
  response body, but the fixed fake provider reply never echoes it back — the marker only ever appears
  in the captured provider **system request**. The parent applied a direct fix: capture
  `providerRequests` via the stub and assert `providerRequests[0].system` contains the marker, plus an
  `injectedGetFailures > 0` counter proving the fault genuinely triggered, before checking the response's
  failure-label/redaction assertions. **Verified live this session: correctly FAILS, revealing a real,
  previously-masked redaction leak in `hq-chat.ts`.**
- The parent also tightened the shared `knowledge-provider-stub.ts` (not owned by this session) from a
  substring URL match to an exact `https://api.anthropic.com/v1/messages` comparison, and added an
  `injectedGetFailures` counter to F08's new test for the same reason as F07's.

Both (B) and (C)'s sentinel-non-leak assertions were, at the time of these fixes, expected to currently
FAIL against real source (`hq-chat.ts`/`hq-chat-health.ts` both reflect caught error messages verbatim
into client-visible output with no redaction at all) — **this is exactly what the live run above
confirmed**: both now correctly fail, revealing genuine, previously-undetected production leaks, not a
test defect.

### Historical count reconciliation (now closed)

Original F-only total was 70 (17 network-free + 53 real-emulator, per the parent's immutable
`artifacts/api-emulator-review-baseline.json`, 53 = 24 passed / 29 failed). After F09's removal (3
tests) and F08's 2 new tests: 70 − 3 + 2 = **69**, matching the CURRENT STATUS live total above exactly.
The pre-round1 baseline per-file numbers (F01 3p/10f, F02 2p/2f, F03 3p/1f, F04 3p/3f, F05 7p/8f, F06
2p/0f, F07 2p/2f, F08 1p/0f, F10 1p/0f) are historical only; do not read them as current — the CURRENT
STATUS section's per-file table above is the live, current result (F07 and F08 differ from this
baseline because their new/fixed tests now correctly fail, revealing real leaks the old versions could
not detect).

The network-free re-run in this round (10p/7f) is **not identical** to the original pre-round1 baseline
(`f-networkfree-baseline.json`: 9p/8f) — `TEST-F08.portal-config-safe` flipped from failing (17.3s,
timed out under cross-file worker contention) to passing cleanly (956ms–1503ms across two later runs).
This is non-deterministic cross-file timing flakiness in the behavior lane, confirmed reproducible as
flaky (not a fix, not a regression — none of round1/round2's edits touched this specific test's logic).

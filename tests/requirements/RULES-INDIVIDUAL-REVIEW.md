# RULES-INDIVIDUAL-REVIEW.md

Per-test independent review of `tests/requirements/emulator/rules/security-boundaries.test.ts`, run against real
Auth/Firestore/Storage emulators, production rules unchanged at commit `60548f8`. Requirement authority:
`tests/requirements/TEST-PLAN.md`. Current authoritative source artifacts:
`tests/requirements/artifacts/rules-final.json` / `rules-final.log` (captured `2026-09-07T05:24:16Z`).

> **✅ CURRENT STATUS: 95 / 95 tests reviewed and CONFIRMED — 80 passed, 15 failed.** The suite was expanded from 77
> to 95 tests: 18 brand-new `TEST-S07.foreign-{list,update,delete}.{other-hq,admin,coordinator}.{personalTasks,
> chatSessions}` tests (2 subcollection paths × 3 foreign-identity roles × 3 operations) proving foreign
> *authenticated* users — explicitly including `admin` and `coordinator`, not just anonymous callers — cannot
> list/update/delete another user's private data; and the existing 5 `TEST-S05.admin-only-write.*` cases were
> modified to add a genuine non-admin-HQ delete-denial assertion (delete was already in the S05 narrative's scope
> but previously untested). All 23 new/modified cases were independently reviewed by 23 distinct calibrated
> reviewers against the fresh rerun (`rules-final.json`/`rules-final.log`, 95 total, 80 passed, 15 failed); all 23
> confirm genuine pass. **The other 72 tests are carried forward unchanged** (same 15 `G`-labeled failures as every
> prior run, same statuses) and were not re-reviewed, since the parent confirmed the rest of the source file and
> production rules are unchanged. A separate, unrelated portable-path fix (`join('tests','requirements','.cache',
> 'firestore.rules')` replacing a hardcoded path string, `security-boundaries.test.ts:2,118,123`) was also verified
> to make no assertion changes anywhere. **No new `F` (future/infra-missing) test labels were introduced** — all 23
> new/modified cases are `A`-labeled firm acceptance behavior already within the existing S05/S07 narrative scope.
> This 95-test state supersedes the prior 77-test "final" claim below; the Erratum section is retained as historical
> audit trail for the `expectCrudDeniedAsAnonymous` coverage-defect finding, not as the current headline.

## Erratum — coverage defect found in the shared test helper (`expectCrudDeniedAsAnonymous`)

- **What was found, and by whom:** the parent (not any of the 14 automated per-test reviewers who reviewed
  `S01.anonymous.*.crud` in the initial pass) identified two compounding problems in
  `expectCrudDeniedAsAnonymous` in `security-boundaries.test.ts`:
  1. It performed its authorized-writer positive control and its anonymous-denial write assertion against `path` —
     the **same, already-seeded** document used for the read positive control. Firestore's `setDoc(...)` against an
     existing document is an **update/merge**, not a **create**, so for all 14 `.crud` cases the "positive control
     write" and the "anonymous write denial" exercised update semantics only; **create was never genuinely exercised
     or denied**, contrary to what the test title and every prior reviewer's verdict ("genuine pass... real SDK
     calls... not tautological") assumed.
  2. The negative-path write/update assertions used a synthetic, schema-unrelated payload (`{ denied: true }`)
     instead of a valid document shape for that collection. This is a confound: a denial observed against a
     malformed payload does not distinguish "denied because the caller is anonymous/unauthorized" from "denied (or
     coincidentally accepted) because the payload doesn't match what the collection expects" — the assertion was
     not provably testing the auth boundary in isolation.
  Point 1 is a materially larger finding than the previously-recorded "weak positive control" coverage observation
  for test #9 — it affected the create-path coverage of **all 14** anonymous CRUD cases, and both points were missed
  by every reviewer who examined those 14 tests in the initial review. That is recorded here honestly as a
  review-process miss, not glossed over.
- **The fix (test file only — confirmed no production/rule change, confirmed original seed untouched):** the
  parent surgically rewrote `expectCrudDeniedAsAnonymous` (`security-boundaries.test.ts:86-104` as of this read) to:
  1. Read the positive-control fixture at `path` and throw if it does not actually exist (`if (!existing.exists())
     throw new Error(...)`), so the helper fails loudly instead of silently if seeding ever regresses. **The
     original seed document at `path` is read-only in this helper — it is never written, updated, or deleted; every
     CRUD assertion operates on a separate `${path}-create-control` document instead.**
  2. Use the **exact existing valid fixture payload** (`existing.data()`) — not the old synthetic `{ denied: true }`
     — for every assertion on both the authorized side and the anonymous side (create, the failed anonymous create,
     the failed anonymous update). This removes the malformed-payload confound: a denial can now only be attributed
     to caller identity/authorization, never to payload shape, because the same valid payload is used for the
     identity that succeeds and the identity that must fail.
  3. Assert a **paired authorized-CREATE / anonymous-CREATE** on the distinct `${path}-create-control` path:
     authorized CREATE succeeds via `setDoc(doc(db(validCreateUid), createPath), existing.data())` — using a new
     fourth parameter `validCreateUid` (coordinator UID for `quarterlyReports`, writer UID otherwise) — then the
     control document is deleted via the rules-disabled `remove()`, and only then is anonymous CREATE asserted to
     fail via `setDoc(anonymousTarget, existing.data())` against the now-confirmed-absent path. This is the step
     that actually proves create denial, which the old helper never exercised.
  4. Re-create the control document as the authorized creator, then assert the remaining three **paired**
     authorized/anonymous operations with the same valid payload: READ (authorized succeeds, anonymous fails),
     UPDATE (authorized succeeds, anonymous fails), DELETE (anonymous fails, authorized succeeds) — all in a
     `try/finally` with `${path}-create-control` cleanup, so cleanup runs even if an assertion throws.
  5. `remove()` (`security-boundaries.test.ts:45-49`) no longer swallows delete failures with a silent
     `.catch(() => undefined)`; a cleanup failure now propagates and surfaces as a test failure instead of being
     masked.
- **Call-site change:** `it.each(anonymousResources)(...)` (`security-boundaries.test.ts:259-261`) now passes a
  4th argument: `_name === 'quarterlyReports' ? reader : writer` as `validCreateUid` — i.e. `quarterlyReports` uses
  the coordinator reader as the create-authorized identity (matching its `isCoordinator()`-gated create rule), and
  every other collection uses the existing writer identity.
- **Impact / staleness statement (resolved):** the fix was **test-file-only**; `firestore.rules`/`storage.rules`
  remain unchanged. The prior `rules.json`/`rules-run.log` artifact (77 total, 62 passed, 15 failed, captured
  `2026-09-06T21:28:17Z`) was correctly identified as stale for all 14 `S01.anonymous.*.crud` tests and was NOT
  cited as their current status pending rerun. **The parent has since reran the suite** with the corrected helper
  against real Auth/Firestore/Storage emulators (`tests/requirements/artifacts/rules.json`/`rules-run.log` replaced,
  rerun captured `2026-09-06T22:35:07Z`: 77 total, 62 passed, 15 failed — the same 15 failures as before; all 14
  `.crud` cases pass). **The other 63 tests were unaffected** by this helper (they use different code paths —
  `it.each` list-query bodies, direct `it()` bodies, or other collection-specific logic) and were not re-reviewed.
- **Resolution — 14 distinct calibrated reviews completed:** a distinct read-only reviewer agent was launched per
  each of the 14 corrected CRUD cases (one test each, as with all other reviews in this document) against the fresh
  rerun, each calibrated to verify: (a) the anonymous-CREATE assertion genuinely runs against a path confirmed absent
  immediately beforehand (not reused from a still-existing seed), (b) the authorized positive control uses the
  correct identity for that collection's actual create rule (coordinator for `quarterlyReports`, admin for
  admin-only-write collections, writer/path-owner otherwise), (c) the assertion genuinely distinguishes Firestore
  CREATE from UPDATE semantics (i.e. targets a path that does not already exist at the time of the create
  assertion), (d) the exact existing valid fixture payload (`existing.data()`) is used on both the authorized and
  anonymous side of every operation — no malformed/synthetic payload (e.g. the old `{ denied: true }`) remains as a
  confound, and (e) the original seeded document at `path` is left unmodified by the helper (all CRUD occurs against
  `${path}-create-control`). **All 14 reviewers independently confirmed all five criteria satisfied and reported
  genuine pass with no remaining coverage gap or new defect** — including the highest-risk case,
  `#9 quarterlyReports.crud`, where the reviewer additionally verified the actual seeded `submittedBy` field on
  `quarterlyReports/{report-a}` equals `root('coord-a')` (the `validCreateUid` used), so the create-control document
  genuinely satisfies all three create predicates (`isCoordinator()`, `submittedBy == request.auth.uid`,
  `coordinatesBranch(...)`) rather than assuming it. The originally-recorded "weak positive control" observation for
  test #9 is confirmed resolved. Per-test verdicts are recorded in the Result summary table below (all 14 now
  CONFIRMED / genuine pass).

## Result summary status legend

- **CONFIRMED** — reviewed and verified against a valid, non-stale test run; verdict stands.
- ~~PENDING RE-REVIEW~~ — no longer applicable to any test in this report: the parent's fresh rerun with the
  corrected helper (captured `2026-09-06T22:35:07Z`) has been reviewed by 14 distinct calibrated reviewers, and all
  14 tests are now CONFIRMED below. Retained here only to explain the status history for tests #1–14.

## Prior review context (73-test initial pass + 4-test S06 rerun)

## Reviewer identification and caveats

- **Launch name / agent identity:** across the full review process, **91 distinct reviewer launches** were made via
  the `task` tool with `agent_type: "explore"` (no model override requested/specified): 77 for the initial pass plus
  S06 rerun (tests #1–77, one launch per test), and 14 more (`Reviewer2-<n>-<suite>-<case>`) re-reviewing tests
  #1–14 fresh against the corrected-helper rerun. Each launch used a distinct `name` parameter in the pattern
  `Reviewer-<n>-<suite>-<case>` or `Reviewer2-<n>-<suite>-<case>` (e.g. `Reviewer-26-S01-no-profile-branches`,
  `Reviewer-74-S06-foreign-overwrite-hq_knowledge`, `Reviewer2-09-S01-anon-quarterlyReports-crud`); the mapping of
  test number to launch name is in the Appendix table below (the 14 `Reviewer2-*` launches are the authoritative,
  current verdicts for tests #1–14; the original 14 `Reviewer-01..14-*` launches are superseded and retained only
  for the Erratum's audit trail). **`agent_id` is unavailable**: these were synchronous `task` tool calls, and the
  tool's result payload for sync calls did not surface an `agent_id`/run ID — only the final text output was
  returned. No agent_id is invented or backfilled here. **Model identity is likewise unavailable**: the tool result
  does not disclose which underlying model executed a given `explore` invocation, so it is recorded as "not
  disclosed by tool output" rather than guessed.
- **Source-line citations reflect a snapshot, not a promise:** all `security-boundaries.test.ts` line numbers cited
  in this review (and by each reviewer) were read from the file's state at review time. The S06 split (adding
  `foreign-overwrite`/`foreign-delete` blocks) shifted subsequent line numbers, and the later helper fix
  (`expectCrudDeniedAsAnonymous` rewrite) shifted them again; reviewers were explicitly instructed each time to
  re-resolve their test's location by literal title/fullName or function-name search against the file's current
  content rather than reuse any previously recorded line number, and did so at every stage. Any future re-review
  must likewise re-resolve locations fresh by test identifier, not by reusing line numbers recorded here.
- **`rules.json` / `rules-run.log` history (three states, now settled):**
  1. Initial 75-test baseline (62 passed, 13 failed) — reviewed by the initial 73-test pass.
  2. 77-test rerun reflecting the S06 split (62 passed, 15 failed, captured `2026-09-06T21:28:17Z`) — the 4 new S06
     cases (#74–77) were reviewed fresh against this; the 73 prior results were carried forward unchanged. This
     artifact was **later found to be stale** for the 14 `S01.anonymous.*.crud` tests (#1–14) because of the
     `expectCrudDeniedAsAnonymous` coverage defect described in the Erratum section, and those 14 verdicts were
     explicitly withdrawn pending a rerun.
  3. **Final 77-test rerun with the corrected helper** (62 passed, 15 failed — same failure set as state 2, captured
     `2026-09-06T22:35:07Z`) — the parent reran the suite against real Auth/Firestore/Storage emulators after fixing
     the helper (test-file only; `firestore.rules`/`storage.rules` unchanged) and stopped the emulators. 14 distinct
     calibrated reviewers (`Reviewer2-01..14`) reviewed tests #1–14 fresh against this state; all confirmed genuine
     pass. **This is the current, authoritative artifact for all 77 tests.** No further rerun is assumed or
     anticipated beyond what the parent has actually communicated.

## Result summary

| # | Test ID | Suite label | rules.json status | Verdict |
|---|---|---|---|---|
| 26 | S01.no-profile-read.branches | G | failed | genuine fail — documented gap |
| 27 | S01.no-profile-read.knowledgeItems | G | failed | genuine fail — documented gap |
| 28 | S01.no-profile-read.knowledge_articles | G | failed | genuine fail — documented gap |
| 29 | S01.no-profile-read.reportQuestions | G | failed | genuine fail — documented gap |
| 30 | S01.missing-role-read.branches | G | failed | genuine fail — documented gap |
| 31 | S01.missing-role-read.knowledgeItems | G | failed | genuine fail — documented gap |
| 32 | S01.missing-role-read.knowledge_articles | G | failed | genuine fail — documented gap |
| 33 | S01.missing-role-read.reportQuestions | G | failed | genuine fail — documented gap |
| 52 | S03.foreign-branch-read | G | failed | genuine fail — documented gap |
| 53 | S03.foreign-knowledge-read | G | failed | genuine fail — documented gap |
| 54 | S03.foreign-knowledge-mutation | G | failed | genuine fail — documented gap |
| 1 | S01.anonymous.tasks.crud | A | passed (rerun `22:35:07Z`) | CONFIRMED — genuine pass (CREATE proven, no payload confound; see Erratum resolution) |
| 2 | S01.anonymous.task-comments.crud | A | passed (rerun `22:35:07Z`) | CONFIRMED — genuine pass (CREATE proven, no payload confound; see Erratum resolution) |
| 3 | S01.anonymous.task-attachments.crud | A | passed (rerun `22:35:07Z`) | CONFIRMED — genuine pass (CREATE proven, no payload confound; see Erratum resolution) |
| 4 | S01.anonymous.task-history.crud | A | passed (rerun `22:35:07Z`) | CONFIRMED — genuine pass (CREATE proven, no payload confound; see Erratum resolution) |
| 5 | S01.anonymous.contacts.crud | A | passed (rerun `22:35:07Z`) | CONFIRMED — genuine pass (CREATE proven, no payload confound; see Erratum resolution) |
| 6 | S01.anonymous.roles.crud | A | passed (rerun `22:35:07Z`) | CONFIRMED — genuine pass (CREATE proven, no payload confound; see Erratum resolution) |
| 7 | S01.anonymous.branches.crud | A | passed (rerun `22:35:07Z`) | CONFIRMED — genuine pass (create identity = admin per branches' write rule, verified) |
| 8 | S01.anonymous.reportQuestions.crud | A | passed (rerun `22:35:07Z`) | CONFIRMED — genuine pass (create identity = admin per reportQuestions' write rule, verified) |
| 9 | S01.anonymous.quarterlyReports.crud | A | passed (rerun `22:35:07Z`) | CONFIRMED — genuine pass; original weak-positive-control finding resolved (all 3 create predicates verified against actual seed data) |
| 10 | S01.anonymous.hq_knowledge.crud | A | passed (rerun `22:35:07Z`) | CONFIRMED — genuine pass (create identity = admin per hq_knowledge's write rule, verified) |
| 11 | S01.anonymous.knowledge_articles.crud | A | passed (rerun `22:35:07Z`) | CONFIRMED — genuine pass (create identity = admin per knowledge_articles' write rule, verified) |
| 12 | S01.anonymous.knowledgeItems.crud | A | passed (rerun `22:35:07Z`) | CONFIRMED — genuine pass (create identity = coord-a per isCoordinator(), verified) |
| 13 | S01.anonymous.personalTasks.crud | A | passed (rerun `22:35:07Z`) | CONFIRMED — genuine pass (path-identity ownership preserved under `-create-control`, verified) |
| 14 | S01.anonymous.chatSessions.crud | A | passed (rerun `22:35:07Z`) | CONFIRMED — genuine pass (path-identity ownership preserved under `-create-control`, verified) |
| 15 | S01.anonymous.tasks.list | A | passed | genuine pass |
| 16 | S01.anonymous.contacts.list | A | passed | genuine pass |
| 17 | S01.anonymous.roles.list | A | passed | genuine pass |
| 18 | S01.anonymous.branches.list | A | passed | genuine pass (see note) |
| 19 | S01.anonymous.reportQuestions.list | A | passed | genuine pass |
| 20 | S01.anonymous.quarterlyReports.list | A | passed | genuine pass |
| 21 | S01.anonymous.hq_knowledge.list | A | passed | genuine pass |
| 22 | S01.anonymous.knowledge_articles.list | A | passed | genuine pass |
| 23 | S01.anonymous.knowledgeItems.list | A | passed | genuine pass (see note) |
| 24 | S01.anonymous.personalTasks.list | A | passed | genuine pass |
| 25 | S01.anonymous.chatSessions.list | A | passed | genuine pass |
| 34 | S02.valid-hq.admin | A | passed | genuine pass |
| 35 | S02.valid-hq.CEO | A | passed | genuine pass |
| 36 | S02.valid-hq.JLM | A | passed | genuine pass |
| 37 | S02.valid-hq.SUP | A | passed | genuine pass |
| 38 | S02.valid-hq.FIN | A | passed | genuine pass |
| 39 | S02.valid-hq.DON | A | passed | genuine pass |
| 40 | S02.valid-hq.DES | A | passed | genuine pass |
| 41 | S02.valid-hq.PUB | A | passed | genuine pass |
| 42 | S02.valid-hq.VOL | A | passed | genuine pass |
| 43 | S02.cross-domain-current.CEO | C | passed | genuine pass — characterization only |
| 44 | S02.cross-domain-current.JLM | C | passed | genuine pass — characterization only |
| 45 | S02.cross-domain-current.SUP | C | passed | genuine pass — characterization only |
| 46 | S02.cross-domain-current.FIN | C | passed | genuine pass — characterization only |
| 47 | S02.cross-domain-current.DON | C | passed | genuine pass — characterization only |
| 48 | S02.cross-domain-current.DES | C | passed | genuine pass — characterization only |
| 49 | S02.cross-domain-current.PUB | C | passed | genuine pass — characterization only |
| 50 | S02.cross-domain-current.VOL | C | passed | genuine pass — characterization only |
| 51 | S03.own-branch-query | A | passed | genuine pass — required positive control |
| 55 | S04.own-create-and-read | A | passed | genuine pass |
| 56 | S04.forged-submitter | A | passed | genuine pass |
| 57 | S04.foreign-branch | A | passed | genuine pass |
| 58 | S04.coordinator-update-delete | A | passed | genuine pass |
| 59 | S04.admin-update-delete | A | passed | genuine pass |
| 60 | S05.admin-only-write.users | A | passed | genuine pass — re-verified: now includes genuine non-admin-HQ delete-denial (see Group D) |
| 61 | S05.admin-only-write.branches | A | passed | genuine pass — re-verified: now includes genuine non-admin-HQ delete-denial (see Group D) |
| 62 | S05.admin-only-write.reportQuestions | A | passed | genuine pass — re-verified: now includes genuine non-admin-HQ delete-denial (see Group D) |
| 63 | S05.admin-only-write.hq_knowledge | A | passed | genuine pass — re-verified: now includes genuine non-admin-HQ delete-denial (see Group D) |
| 64 | S05.admin-only-write.knowledge_articles | A | passed | genuine pass — re-verified: now includes genuine non-admin-HQ delete-denial (see Group D) |
| 65 | S06.positive.hq_knowledge/item-a/proof.txt | A | passed | genuine pass |
| 66 | S06.positive.knowledge_articles/article-a/proof.txt | A | passed | genuine pass |
| 67 | S06.anonymous.hq_knowledge/item-a/proof.txt | A | passed | genuine pass |
| 68 | S06.anonymous.knowledge_articles/article-a/proof.txt | A | passed | genuine pass |
| 69 | S07.owner-only.personalTasks | A | passed | genuine pass |
| 70 | S07.owner-only.chatSessions | A | passed | genuine pass |
| 71 | S08.self-role-escalation | A | passed | genuine pass |
| 72 | S08.forged-report-owner | A | passed | genuine pass (near-duplicate of S04.forged-submitter, see note) |
| 73 | S08.current-authorized-body-validation | C | passed | genuine pass — characterization only |
| 74 | S06.foreign-overwrite.hq_knowledge/item-a/proof.txt | G | failed | genuine fail — expected production gap |
| 75 | S06.foreign-overwrite.knowledge_articles/article-a/proof.txt | G | failed | genuine fail — expected production gap |
| 76 | S06.foreign-delete.hq_knowledge/item-a/proof.txt | G | failed | genuine fail — expected production gap |
| 77 | S06.foreign-delete.knowledge_articles/article-a/proof.txt | G | failed | genuine fail — expected production gap |
| 78 | S07.foreign-list.other-hq.personalTasks | A | passed | genuine pass (see Group D) |
| 79 | S07.foreign-list.admin.personalTasks | A | passed | genuine pass — admin-exception-rejection case (see Group D) |
| 80 | S07.foreign-list.coordinator.personalTasks | A | passed | genuine pass (see Group D) |
| 81 | S07.foreign-list.other-hq.chatSessions | A | passed | genuine pass (see Group D) |
| 82 | S07.foreign-list.admin.chatSessions | A | passed | genuine pass — admin-exception-rejection case (see Group D) |
| 83 | S07.foreign-list.coordinator.chatSessions | A | passed | genuine pass (see Group D) |
| 84 | S07.foreign-update.other-hq.personalTasks | A | passed | genuine pass (see Group D) |
| 85 | S07.foreign-update.admin.personalTasks | A | passed | genuine pass — admin-exception-rejection case (see Group D) |
| 86 | S07.foreign-update.coordinator.personalTasks | A | passed | genuine pass (see Group D) |
| 87 | S07.foreign-update.other-hq.chatSessions | A | passed | genuine pass — target-doc existence independently verified (see Group D note) |
| 88 | S07.foreign-update.admin.chatSessions | A | passed | genuine pass — admin-exception-rejection case (see Group D) |
| 89 | S07.foreign-update.coordinator.chatSessions | A | passed | genuine pass (see Group D) |
| 90 | S07.foreign-delete.other-hq.personalTasks | A | passed | genuine pass (see Group D) |
| 91 | S07.foreign-delete.admin.personalTasks | A | passed | genuine pass — admin-exception-rejection case (see Group D) |
| 92 | S07.foreign-delete.coordinator.personalTasks | A | passed | genuine pass (see Group D) |
| 93 | S07.foreign-delete.other-hq.chatSessions | A | passed | genuine pass (see Group D) |
| 94 | S07.foreign-delete.admin.chatSessions | A | passed | genuine pass — admin-exception-rejection case (see Group D) |
| 95 | S07.foreign-delete.coordinator.chatSessions | A | passed | genuine pass (see Group D) |

**Totals: 95 / 95 CONFIRMED genuine verdicts (15 genuine fail, 80 genuine pass).** Tests #1–14 (the `.crud` cases)
were re-reviewed fresh against the corrected-helper rerun and are CONFIRMED — see the Erratum section for the full
defect/fix/resolution history. Tests #60–64 (`S05.admin-only-write.*`) were re-verified fresh for their new
delete-denial assertion. Tests #78–95 (18 new `S07.foreign-{list,update,delete}.*` cases) are newly reviewed — see
Group D below. Tests #15–59 and #65–77 (72 tests) are unaffected by any of these changes and carried forward
unchanged. No suspect stale-fixture/reason-mismatch verdicts stand uncorrected in any of the 95 cases (one
reviewer's unfounded "stale-fixture" concern for #87 was independently investigated and resolved — see Group D).

## Detailed defect groups (all 15 failures — code-defect analysis)

### Group A — S01 authenticated-but-invalid-profile reads bypass profile/role checks (8 tests: #26–33)

- **Tests:** `S01.no-profile-read.{branches,knowledgeItems,knowledge_articles,reportQuestions}` (#26–29),
  `S01.missing-role-read.{branches,knowledgeItems,knowledge_articles,reportQuestions}` (#30–33)
- **Plan requirement:** `tests/requirements/TEST-PLAN.md:367` (narrative) and `:467` (registry) — both sub-families
  are labeled **G**: "firm acceptance behavior; code evidence predicts a behavioral gap."
- **Original Hebrew source requirement:** `docs/requirements/technical-specification.he.md:56-74` (§4,
  "הזדהות ו-RBAC" — Authentication and RBAC). Line 62: `role` is read from `users/{uid}` and drives the profile/role
  access matrix (`admin` / eight domain roles / `coordinator`). Line 73 states explicitly:
  "אכיפת ההרשאות בפועל נדרשת גם בכללי Firestore, Storage ובפונקציות השרת; guards בצד הלקוח אינם גבול אבטחה" ("actual
  permission enforcement is required in the Firestore/Storage rules and server functions too; client-side guards are
  not a security boundary") — i.e. the profile/role matrix must be enforced in the Firestore rules themselves, not
  just client routing.
- **Test code:** `security-boundaries.test.ts:283-311`. Each case asserts a genuine positive control
  (`assertSucceeds` for a valid coordinator) followed by `assertFails` for the invalid identity — real Firestore SDK
  calls, correct fixtures, no wrong-resource confound.
- **Production cause (verified by direct rule read, not inferred from the plan label):** `firestore.rules` —
  `branches`, `knowledgeItems`, `knowledge_articles`, and `reportQuestions` all gate reads with
  `allow read: if isAuthed();` only. None consult `role()` or require a `/users/{uid}` profile to exist. A signed-in
  identity with no profile document, or a profile with an empty/blank `role` field, is therefore granted the same
  read access as a fully provisioned HQ/coordinator account — directly contradicting the L56-74 requirement that
  role-based access be enforced in the data rules.
- **Classification:** **(a) already-documented expected gap.** This conclusion rests on three independent,
  cross-checked sources — not the `G` plan label alone: (1) the actual `firestore.rules` text read directly (no
  role/profile predicate on these four collections' read rules), (2) the actual real-emulator SDK result recorded in
  `rules.json`/`rules-run.log` (`assertFails` genuinely failed because the read succeeded), and (3) the original
  Hebrew requirement at L56-74/L73 which the rule violates. The `G` label in TEST-PLAN.md is a prediction that
  matches the outcome; it is not, by itself, treated as proof of the defect. Not a test defect, not an environment
  issue, and no new undocumented behavior beyond what the plan already records.

### Group B — S03 coordinator branch/knowledge boundary is not enforced (3 tests: #52–54)

- **Tests:** `S03.foreign-branch-read` (#52), `S03.foreign-knowledge-read` (#53), `S03.foreign-knowledge-mutation`
  (#54)
- **Plan requirement:** `tests/requirements/TEST-PLAN.md:369` — S03 is labeled **G**, with an explicit note: "P27 all
  authenticated branch reads and broad knowledgeItems read/write violate firm foreign-branch boundary... Global
  authorship policy not specified; characterize global/mirror writes rather than invent role policy."
- **Original Hebrew source requirement:** `docs/requirements/technical-specification.he.md:241` (§11, "פורטל
  רכזים" — Coordinator portal): "רכז חייב להיות מוגבל בצד השרת ובכללי הנתונים לסניפים שאליהם הוא משויך." ("a
  coordinator must be restricted, server-side and in the data rules, to the branches they are associated with.")
  Reinforced at `docs/requirements/technical-specification.he.md:299-305` (§15, "מודל אבטחה" — Security model),
  specifically line 304: "גישת רכז מוגבלת לסניפים המשויכים אליו" ("coordinator access is restricted to the branches
  associated with them") — one of the explicit security-boundary bullets at lines 299-305 alongside auth (301),
  rules-level enforcement (302), and the no-client-authority rule (303).
- **Test code:** `security-boundaries.test.ts:337-367`. Each case has a real positive control (own-branch/own-item
  access succeeds) immediately followed by the foreign-branch/foreign-item denial attempt that fails against the
  live rules.
- **Production cause (verified by direct rule read, not inferred from the plan label):**
  - `match /branches/{id} { allow read: if isAuthed(); ... }` — `coordinatesBranch()` is defined in
    `firestore.rules` but never referenced by this rule, so any authenticated user (not just a branch's own
    coordinators) can read any branch document — a direct violation of L241/L304.
  - `match /knowledgeItems/{id} { allow read: if isAuthed(); allow write: if isCoordinator() || isHQ(); }` — no
    `branchId` scoping predicate exists on either the read or the write/update path, so a coordinator can read another
    branch's knowledge item and can move their own item's `branchId` into a foreign branch — again contradicting the
    L241/L304 branch-restriction requirement.
- **Classification:** **(a) already-documented expected gap.** Confirmed independently via (1) the actual
  `firestore.rules` text (no `coordinatesBranch()` gating on `branches`/`knowledgeItems` reads or on the
  `knowledgeItems` write path), (2) the real-emulator SDK failures recorded in `rules.json` (own-branch positive
  controls pass; foreign-branch `assertFails` genuinely fail because the request succeeds), and (3) the original
  Hebrew requirement at L241 and L299-305/L304 that the rule violates. The `G` plan label matches this outcome but
  is not treated as sufficient proof on its own. No invented global-authorship policy was assumed (per the plan
  note's explicit caution), and this is not a test/env problem — the same fixtures pass their own-branch positive
  controls correctly.

### Group C — S06 Storage exact-prefix write rule has no ownership/ACL check (4 tests: #74–77, final rerun)

- **Tests:** `S06.foreign-overwrite.{hq_knowledge,knowledge_articles}/.../proof.txt` (#74, #75),
  `S06.foreign-delete.{hq_knowledge,knowledge_articles}/.../proof.txt` (#76, #77) — these 4 replace the 2 stale
  `S06.foreign-write.{hq_knowledge,knowledge_articles}` cases excluded from the initial 73-test review; they were
  reviewed fresh against the final 77-test rerun (`rules.json`: 62 passed / 15 failed), each reviewer re-resolving
  the test's current source location by literal title search rather than reusing prior line numbers.
- **Plan requirement:** `tests/requirements/TEST-PLAN.md:372` (narrative) and `:470` (registry) — the registry now
  explicitly lists `S06.foreign-overwrite.{hq_knowledge,knowledge_articles}` (G) and
  `S06.foreign-delete.{hq_knowledge,knowledge_articles}` (G) as their own named sub-cases (the plan has been updated
  since the split; no documentation-lag qualifier applies anymore).
- **Original Hebrew source requirement:** `docs/requirements/technical-specification.he.md:306` (§15, "מודל
  אבטחה" — Security model): "קבצים מוגבלים לפי בעלות, סוג, גודל וסריקת תוכן." ("files are restricted by ownership,
  type, size, and content scanning.") — the ownership clause is the direct requirement this defect group violates.
- **Test code:** `security-boundaries.test.ts:479` (`foreign-overwrite` `it.each` block) and `:491`
  (`foreign-delete` `it.each` block), as located at this review's read time. Each case has a genuine positive
  control (`assertSucceeds(uploadBytes(adminFile, ...))`) establishing the object, followed by the denial attempt
  from an unrelated coordinator (`coord-b`) — `uploadBytes` (overwrite) or `deleteObject` (delete) on the same exact
  object path — then cleanup by admin. Fixtures are correct: `coord-b` is genuinely unrelated to the uploading
  `admin` identity, and the object path is RUN_ID-scoped to avoid cross-run collision.
- **Production cause (verified by direct rule read, not inferred from the plan label):** `storage.rules` — both the
  `hq_knowledge` and `knowledge_articles` match blocks use `allow write: if request.auth != null;` with no
  ownership/ACL predicate. Firebase Storage Rules have no separate `delete` verb — `write` governs create,
  overwrite, **and** delete — so any authenticated user, not just the original uploader, can overwrite or delete an
  object under either exact prefix, directly contradicting the L306 "בעלות" (ownership) requirement.
- **Classification:** **(a) already-expected/predicted production gap.** Confirmed independently via (1) the actual
  `storage.rules` text (auth-only write predicate, no owner/ACL check, applying to both overwrite and delete), (2)
  the real-emulator SDK failures recorded in the final 77-test `rules.json` (positive controls pass; foreign
  overwrite/delete `assertFails` genuinely fail because the requests succeed), and (3) the original Hebrew
  requirement at L306 that the rule violates. The `G` plan label (now explicit for both split sub-cases) matches
  this outcome but is not treated as sufficient proof on its own. Not a test/env problem — all 4 positive controls
  pass and only the foreign-identity denial assertions fail, consistent with the rule's actual (lack of) ownership
  check.

### Group D — S07 foreign-authenticated boundary expansion + S05 delete-control addition (23 tests: #60–64, #78–95)

- **What changed:** two additions to `security-boundaries.test.ts`, confirmed via direct source read, both
  test-file-only with **no production rule change**:
  1. **`TEST-S05.admin-only-write.{users,branches,reportQuestions,hq_knowledge,knowledge_articles}`** (#60–64): each
     case gained a genuine `await assertFails(deleteDoc(doc(db(root('hq')), \`${collectionName}/${id}\`)))` —
     asserting a non-admin HQ identity is denied DELETE — inserted before the pre-existing
     `assertSucceeds(deleteDoc(doc(db(root('admin')), ...)))`. Delete was already textually in scope of the S05
     narrative (`tests/requirements/TEST-PLAN.md:371`: "create/update/delete users, branches, ...") but was
     previously untested; this closes that real, pre-existing coverage gap. It is not redundant with the existing
     update-denial assertion — update and delete are governed by the same `allow write: if isAdmin();` predicate in
     `firestore.rules`, but are distinct Firestore operations that must each be exercised to prove the rule holds
     for both.
  2. **18 new `TEST-S07.foreign-{list,update,delete}.{other-hq,admin,coordinator}.{personalTasks,chatSessions}`**
     tests (#78–95): these prove that a foreign *authenticated* user (not merely an anonymous caller, which the
     pre-existing `TEST-S07.owner-only.%s` case already covered for GET) cannot LIST, UPDATE, or DELETE another
     user's private `personalTasks`/`chatSessions` documents. Critically, all three tested foreign identities —
     `other-hq` (a different HQ staff member), `admin`, and `coordinator` — must be denied with **no exception for
     admin**, per `docs/requirements/executive-summary.he.md#L81` ("private from all other users, including admin")
     as reiterated in `tests/requirements/TEST-PLAN.md:47` and the S07 narrative row
     (`tests/requirements/TEST-PLAN.md:373`).
- **Test code citations (current, re-resolved fresh):** `security-boundaries.test.ts:445-461` (S05 it.each block,
  new delete-denial line at `:460`); `:516-609` (S07 describe block) — `foreign-list` at `:536` (personalTasks) and
  `:545` (chatSessions); `foreign-update` at `:554` (personalTasks) and `:567` (chatSessions); `foreign-delete` at
  `:580` (personalTasks) and `:594` (chatSessions). Each `it.each` array is
  `[['other-hq', root('fin')], ['admin', root('admin')], ['coordinator', root('coord-a')]]`.
- **Calibration verified per operation type (23 distinct reviewers, one per test):**
  - **LIST** (#78–83): real `getDocs(collection(db(foreignUid), \`users/${root('hq')}/{subcollection}\`))` calls,
    each preceded by a genuine owner-identity positive control on the same collection. The governing rule
    (`allow read, write: if isAuthed() && request.auth.uid == uid;`) binds `uid` from the **collection path itself**
    (`users/{uid}/personalTasks`), not from any per-document field, so Firestore can and does deny the entire LIST
    outright for a non-owner — a genuine permission-denied, not a silently-empty-but-successful result.
  - **UPDATE** (#84–89): each case seeds a *separate* `${...}-create-control`-style control document
    (`owner-update-control-{role}` / `owner-update-chat-control-{role}`), asserts the OWNER can update that control
    doc (positive control, avoiding a same-document race with the foreign attempt), then asserts the foreign
    identity fails to update the **pre-existing** `personalTasks/private` or `chatSessions/chat` document.
  - **DELETE** (#90–95): each case seeds its OWN fresh `foreign-delete-target-{role}` / `foreign-delete-chat-target-
    {role}` document (since a deleted document can't be reused across parameterized cases), plus a separate
    `owner-delete-control-{role}` document for the owner's positive control, then asserts the foreign identity fails
    to delete the target, then cleans up via the rules-disabled `remove()`.
- **Independent correction to one reviewer's finding (target-document existence, #87
  `S07.foreign-update.other-hq.chatSessions`):** that reviewer flagged a "suspect stale-fixture" / REMAINING GAP,
  claiming the target document `users/{hq}/chatSessions/{chat}` used by the foreign UPDATE attempt was not proven
  to exist, raising a possible not-found-vs-permission-denied confound. This was investigated directly against the
  actual source rather than accepted at face value: `security-boundaries.test.ts:210` shows
  `seed(\`users/${root('hq')}/chatSessions/${root('chat')}\`, { title: 'שיחה פרטית', messages: [] })` inside the
  suite-level `beforeAll` (paired with a `remove(...)` only in `afterAll`, line 235), so the document is genuinely
  seeded and persists for the entire test file's execution, including this case. **The concern does not hold up;
  the test is a genuine pass with no remaining gap.** This correction is recorded here explicitly, per the
  instruction not to blindly carry forward an unverified reviewer claim.
- **Governing rule confirmation (no admin/HQ/coordinator bypass anywhere):** `firestore.rules` —
  `match /users/{uid} { match /chatSessions/{sessionId} { allow read, write: if isAuthed() && request.auth.uid ==
  uid; } match /personalTasks/{taskId} { allow read, write: if isAuthed() && request.auth.uid == uid; } }`. Neither
  subcollection rule references `isAdmin()`, `isHQ()`, or `isCoordinator()` anywhere — access is governed solely by
  path-identity match, with zero special-role carve-outs, for LIST, UPDATE, and DELETE alike.
- **Classification:** all 23 are **genuine pass, and genuinely new/expanded correct coverage — not a defect and not
  a gap.** This is a positive finding: production code already enforced this boundary (no rule change was made or
  needed), and the test suite now has direct, verified evidence of it across list/update/delete and across three
  distinct non-owner identity types including the admin-exception-rejection cases. No new `F` (future/infra-
  missing) label was introduced; both changes are `A`-labeled firm acceptance behavior already within the existing
  S05/S07 narrative scope (`tests/requirements/TEST-PLAN.md:371,373`).
- **Unrelated portable-path fix confirmed inert:** `security-boundaries.test.ts:2`
  (`import { join } from 'node:path'`) and `:118,123` (`readFileSync(join('tests','requirements','.cache',
  'firestore.rules'/'storage.rules'), 'utf8')`) replace a hardcoded path-separator string with a portable
  `path.join`, for Windows/Unix compatibility. Multiple reviewers independently confirmed this touches no assertion
  logic in any of the 23 reviewed tests.

## Observations on passing tests (coverage notes for the reader — not "all perfect", and not defects)

These are recorded so the reader sees them explicitly rather than a report that reads as uniformly clean:

- **RESOLVED — #9 `S01.anonymous.quarterlyReports.crud`:** the initial review recorded a narrower "weak positive
  control" observation here, which turned out to be one symptom of the broader Erratum above (the shared
  `expectCrudDeniedAsAnonymous` helper never exercised CREATE for any of the 14 `.crud` cases). Following the
  parent's helper fix and rerun, a dedicated calibrated reviewer for #9 additionally verified the actual seeded
  `submittedBy` field on `quarterlyReports/{report-a}` equals the `validCreateUid` used (`root('coord-a')`), so the
  create-control document genuinely satisfies all three create predicates
  (`isCoordinator()`, `submittedBy == request.auth.uid`, `coordinatesBranch(...)`) rather than assuming it. **This
  observation is now resolved — CONFIRMED genuine pass, no remaining coverage gap.**
- **#18 `S01.anonymous.branches.list`** and **#23 `S01.anonymous.knowledgeItems.list`:** these cases add a
  `where(...)` query filter (`coordinatorUids array-contains`, `branchId in [...]`) that provides no additional
  security-relevant coverage beyond a plain anonymous denial, because the governing rules (`allow read: if
  isAuthed();`) do not evaluate the filtered field at all. Both tests are correctly scoped to anonymous-only denial
  (S01); the foreign-coordinator/foreign-branch boundary these filters might suggest is separately and correctly
  covered — and found broken — by S03 (#52, #53). No defect.
- **#72 `S08.forged-report-owner`** is a near-duplicate of **#56 `S04.forged-submitter`**: both deny a
  `quarterlyReports` create when `submittedBy` does not match `request.auth.uid`, differing only in the forged
  identity value (`coord-b` vs `admin`). This is a test-coverage/documentation observation only, not a production
  defect — both are genuine, correctly passing tests of the same rule predicate under the plan's distinct S04/S08
  framings.

## New defects found (production rules) — current, all 95 tests

None. All 15 failures (#26–33, #52–54, #74–77) are already-documented expected gaps:
`S01.no-profile-read`/`missing-role-read` (TEST-PLAN.md `G` at line 367/467, Hebrew source L56-74/L73),
`S03.foreign-branch-read`/`foreign-knowledge-read`/`foreign-knowledge-mutation` (TEST-PLAN.md `G` at line 369,
Hebrew source L241 and L299-305/L304), and `S06.foreign-overwrite`/`foreign-delete` (TEST-PLAN.md `G` at line
372/470 — explicitly named per sub-case, Hebrew source L306). These are the **same 15 failures** in every rerun to
date (75-test, 77-test, and current 95-test artifacts) — no new failure was introduced by the S05/S07 expansion. In
every group, the `G` plan label was one of three independently cross-checked sources, not treated as proof by
itself: (1) the actual current rule text in `firestore.rules`/`storage.rules`, (2) the actual real-emulator SDK
result in `rules-final.json`/`rules-final.log`, and (3) the original Hebrew requirement text at the cited line
numbers. All three agree in every failing case. All 80 passing tests — the original 62, the 14 `.crud` cases
re-verified against the corrected-helper rerun, and the 5 modified S05 + 18 new S07 cases reviewed here — were
independently verified as genuine (real SDK calls, correct fixtures, non-tautological assertions, matching rule
citations) with no hidden gaps versus their TEST-PLAN.md requirement rows — see the Coverage Observations above and
Group D for notes a reader should see rather than a report implying uniform perfection. No invented cross-domain,
FIN-vs-VOL, or global-authorship/ownership policy was introduced by any reviewer, and no admin/HQ/coordinator
private-data exception was found or invented — the S07 expansion is direct, verified evidence that none exists.
Production rule code (`firestore.rules`, `storage.rules`) is confirmed unchanged at commit `60548f8` across every
stage: the initial review, the S06 rerun, the helper-defect finding and fix, and this S05/S07 expansion.

**A genuine test-coverage defect (not a production defect) was found and fully resolved** in the shared
`expectCrudDeniedAsAnonymous` helper, affecting tests #1–14 — see the Erratum section above for the full
find/fix/verify history. That finding is reported honestly as a miss by the initial per-test reviewers of #1–14;
the parent fixed the helper (test-file only), reran the suite against real emulators, and 14 distinct calibrated
reviewers independently confirmed the fix on the fresh run with no remaining gap.

**23 new/modified tests (#60–64, #78–95) reviewed against the current 95-test rerun:** 5 `S05.admin-only-write.*`
cases gained a genuine non-admin-HQ delete-denial assertion (closing a real, previously-untested coverage gap
already in the S05 narrative's scope), and 18 new `S07.foreign-{list,update,delete}.*` cases prove foreign
*authenticated* users — including admin and coordinator, with no exception — cannot list/update/delete another
user's private data. All 23 were independently reviewed by 23 distinct calibrated reviewers; all confirm genuine
pass. One reviewer's unfounded "stale-fixture" concern (test #87) was independently investigated against the actual
source and found not to hold — see Group D for the correction. **All 95 tests are now CONFIRMED.** No rerun of the
72 tests unaffected by the S05/S07 changes was performed, per parent instruction, since the code paths they
exercise are unaffected — only the 23 new/modified cases were reviewed, and this report's text (header banner,
Result summary rows #60–64/#78–95, Group D, this section, and the Appendix) was edited to reflect the current state.

## Appendix — reviewer launch identity per test

Tool: `task` (agent_type `explore`, no model override). Field values below are exactly what the tool call/result
exposed; `agent_id` and model are recorded as unavailable rather than invented, per the caveats above.

**Tests #1–14 note:** the `Reviewer-01..14-*` launches below reviewed the OLD (pre-fix) helper against the stale
77-test artifact and are **superseded**, retained only for the Erratum's audit trail. The **authoritative, current**
verdicts for tests #1–14 come from the `Reviewer2-01..14-*` launches in the second table further below, run against
the corrected helper and the final rerun.

| # | Launch name | agent_type | model | agent_id |
|---|---|---|---|---|
| 1 | Reviewer-01-S01-anon-tasks-crud *(superseded — see Reviewer2 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 2 | Reviewer-02-S01-anon-task-comments-crud *(superseded — see Reviewer2 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 3 | Reviewer-03-S01-anon-task-attachments-crud *(superseded — see Reviewer2 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 4 | Reviewer-04-S01-anon-task-history-crud *(superseded — see Reviewer2 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 5 | Reviewer-05-S01-anon-contacts-crud *(superseded — see Reviewer2 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 6 | Reviewer-06-S01-anon-roles-crud *(superseded — see Reviewer2 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 7 | Reviewer-07-S01-anon-branches-crud *(superseded — see Reviewer2 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 8 | Reviewer-08-S01-anon-reportQuestions-crud *(superseded — see Reviewer2 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 9 | Reviewer-09-S01-anon-quarterlyReports-crud *(superseded — see Reviewer2 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 10 | Reviewer-10-S01-anon-hq_knowledge-crud *(superseded — see Reviewer2 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 11 | Reviewer-11-S01-anon-knowledge_articles-crud *(superseded — see Reviewer2 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 12 | Reviewer-12-S01-anon-knowledgeItems-crud *(superseded — see Reviewer2 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 13 | Reviewer-13-S01-anon-personalTasks-crud *(superseded — see Reviewer2 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 14 | Reviewer-14-S01-anon-chatSessions-crud *(superseded — see Reviewer2 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 15 | Reviewer-15-S01-anon-tasks-list | explore | not disclosed by tool output | unavailable (sync call) |
| 16 | Reviewer-16-S01-anon-contacts-list | explore | not disclosed by tool output | unavailable (sync call) |
| 17 | Reviewer-17-S01-anon-roles-list | explore | not disclosed by tool output | unavailable (sync call) |
| 18 | Reviewer-18-S01-anon-branches-list | explore | not disclosed by tool output | unavailable (sync call) |
| 19 | Reviewer-19-S01-anon-reportQuestions-list | explore | not disclosed by tool output | unavailable (sync call) |
| 20 | Reviewer-20-S01-anon-quarterlyReports-list | explore | not disclosed by tool output | unavailable (sync call) |
| 21 | Reviewer-21-S01-anon-hq_knowledge-list | explore | not disclosed by tool output | unavailable (sync call) |
| 22 | Reviewer-22-S01-anon-knowledge_articles-list | explore | not disclosed by tool output | unavailable (sync call) |
| 23 | Reviewer-23-S01-anon-knowledgeItems-list | explore | not disclosed by tool output | unavailable (sync call) |
| 24 | Reviewer-24-S01-anon-personalTasks-list | explore | not disclosed by tool output | unavailable (sync call) |
| 25 | Reviewer-25-S01-anon-chatSessions-list | explore | not disclosed by tool output | unavailable (sync call) |
| 26 | Reviewer-26-S01-no-profile-branches | explore | not disclosed by tool output | unavailable (sync call) |
| 27 | Reviewer-27-S01-no-profile-knowledgeItems | explore | not disclosed by tool output | unavailable (sync call) |
| 28 | Reviewer-28-S01-no-profile-knowledge_articles | explore | not disclosed by tool output | unavailable (sync call) |
| 29 | Reviewer-29-S01-no-profile-reportQuestions | explore | not disclosed by tool output | unavailable (sync call) |
| 30 | Reviewer-30-S01-missing-role-branches | explore | not disclosed by tool output | unavailable (sync call) |
| 31 | Reviewer-31-S01-missing-role-knowledgeItems | explore | not disclosed by tool output | unavailable (sync call) |
| 32 | Reviewer-32-S01-missing-role-knowledge_articles | explore | not disclosed by tool output | unavailable (sync call) |
| 33 | Reviewer-33-S01-missing-role-reportQuestions | explore | not disclosed by tool output | unavailable (sync call) |
| 34 | Reviewer-34-S02-valid-hq-admin | explore | not disclosed by tool output | unavailable (sync call) |
| 35 | Reviewer-35-S02-valid-hq-CEO | explore | not disclosed by tool output | unavailable (sync call) |
| 36 | Reviewer-36-S02-valid-hq-JLM | explore | not disclosed by tool output | unavailable (sync call) |
| 37 | Reviewer-37-S02-valid-hq-SUP | explore | not disclosed by tool output | unavailable (sync call) |
| 38 | Reviewer-38-S02-valid-hq-FIN | explore | not disclosed by tool output | unavailable (sync call) |
| 39 | Reviewer-39-S02-valid-hq-DON | explore | not disclosed by tool output | unavailable (sync call) |
| 40 | Reviewer-40-S02-valid-hq-DES | explore | not disclosed by tool output | unavailable (sync call) |
| 41 | Reviewer-41-S02-valid-hq-PUB | explore | not disclosed by tool output | unavailable (sync call) |
| 42 | Reviewer-42-S02-valid-hq-VOL | explore | not disclosed by tool output | unavailable (sync call) |
| 43 | Reviewer-43-S02-cross-domain-CEO | explore | not disclosed by tool output | unavailable (sync call) |
| 44 | Reviewer-44-S02-cross-domain-JLM | explore | not disclosed by tool output | unavailable (sync call) |
| 45 | Reviewer-45-S02-cross-domain-SUP | explore | not disclosed by tool output | unavailable (sync call) |
| 46 | Reviewer-46-S02-cross-domain-FIN | explore | not disclosed by tool output | unavailable (sync call) |
| 47 | Reviewer-47-S02-cross-domain-DON | explore | not disclosed by tool output | unavailable (sync call) |
| 48 | Reviewer-48-S02-cross-domain-DES | explore | not disclosed by tool output | unavailable (sync call) |
| 49 | Reviewer-49-S02-cross-domain-PUB | explore | not disclosed by tool output | unavailable (sync call) |
| 50 | Reviewer-50-S02-cross-domain-VOL | explore | not disclosed by tool output | unavailable (sync call) |
| 51 | Reviewer-51-S03-own-branch-query | explore | not disclosed by tool output | unavailable (sync call) |
| 52 | Reviewer-52-S03-foreign-branch-read | explore | not disclosed by tool output | unavailable (sync call) |
| 53 | Reviewer-53-S03-foreign-knowledge-read | explore | not disclosed by tool output | unavailable (sync call) |
| 54 | Reviewer-54-S03-foreign-knowledge-mutation | explore | not disclosed by tool output | unavailable (sync call) |
| 55 | Reviewer-55-S04-own-create-and-read | explore | not disclosed by tool output | unavailable (sync call) |
| 56 | Reviewer-56-S04-forged-submitter | explore | not disclosed by tool output | unavailable (sync call) |
| 57 | Reviewer-57-S04-foreign-branch | explore | not disclosed by tool output | unavailable (sync call) |
| 58 | Reviewer-58-S04-coordinator-update-delete | explore | not disclosed by tool output | unavailable (sync call) |
| 59 | Reviewer-59-S04-admin-update-delete | explore | not disclosed by tool output | unavailable (sync call) |
| 60 | Reviewer-60-S05-admin-only-write-users *(superseded — see Reviewer3 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 61 | Reviewer-61-S05-admin-only-write-branches *(superseded — see Reviewer3 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 62 | Reviewer-62-S05-admin-only-write-reportQuestions *(superseded — see Reviewer3 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 63 | Reviewer-63-S05-admin-only-write-hq_knowledge *(superseded — see Reviewer3 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 64 | Reviewer-64-S05-admin-only-write-knowledge_articles *(superseded — see Reviewer3 table)* | explore | not disclosed by tool output | unavailable (sync call) |
| 65 | Reviewer-65-S06-positive-hq_knowledge | explore | not disclosed by tool output | unavailable (sync call) |
| 66 | Reviewer-66-S06-positive-knowledge_articles | explore | not disclosed by tool output | unavailable (sync call) |
| 67 | Reviewer-67-S06-anonymous-hq_knowledge | explore | not disclosed by tool output | unavailable (sync call) |
| 68 | Reviewer-68-S06-anonymous-knowledge_articles | explore | not disclosed by tool output | unavailable (sync call) |
| 69 | Reviewer-69-S07-owner-only-personalTasks | explore | not disclosed by tool output | unavailable (sync call) |
| 70 | Reviewer-70-S07-owner-only-chatSessions | explore | not disclosed by tool output | unavailable (sync call) |
| 71 | Reviewer-71-S08-self-role-escalation | explore | not disclosed by tool output | unavailable (sync call) |
| 72 | Reviewer-72-S08-forged-report-owner | explore | not disclosed by tool output | unavailable (sync call) |
| 73 | Reviewer-73-S08-current-authorized-body-validation | explore | not disclosed by tool output | unavailable (sync call) |
| 74 | Reviewer-74-S06-foreign-overwrite-hq_knowledge | explore | not disclosed by tool output | unavailable (sync call) |
| 75 | Reviewer-75-S06-foreign-overwrite-knowledge_articles | explore | not disclosed by tool output | unavailable (sync call) |
| 76 | Reviewer-76-S06-foreign-delete-hq_knowledge | explore | not disclosed by tool output | unavailable (sync call) |
| 77 | Reviewer-77-S06-foreign-delete-knowledge_articles | explore | not disclosed by tool output | unavailable (sync call) |

### Reviewer2 table — authoritative re-review of tests #1–14 (post helper-fix, final rerun)

Launched after the parent's corrected-helper rerun (captured `2026-09-06T22:35:07Z`). Same tool/agent_type/model/
agent_id availability caveats as above apply.

| # | Launch name | agent_type | model | agent_id |
|---|---|---|---|---|
| 1 | Reviewer2-01-S01-anon-tasks-crud | explore | not disclosed by tool output | unavailable (sync call) |
| 2 | Reviewer2-02-S01-anon-task-comments-crud | explore | not disclosed by tool output | unavailable (sync call) |
| 3 | Reviewer2-03-S01-anon-task-attachments-crud | explore | not disclosed by tool output | unavailable (sync call) |
| 4 | Reviewer2-04-S01-anon-task-history-crud | explore | not disclosed by tool output | unavailable (sync call) |
| 5 | Reviewer2-05-S01-anon-contacts-crud | explore | not disclosed by tool output | unavailable (sync call) |
| 6 | Reviewer2-06-S01-anon-roles-crud | explore | not disclosed by tool output | unavailable (sync call) |
| 7 | Reviewer2-07-S01-anon-branches-crud | explore | not disclosed by tool output | unavailable (sync call) |
| 8 | Reviewer2-08-S01-anon-reportQuestions-crud | explore | not disclosed by tool output | unavailable (sync call) |
| 9 | Reviewer2-09-S01-anon-quarterlyReports-crud | explore | not disclosed by tool output | unavailable (sync call) |
| 10 | Reviewer2-10-S01-anon-hq_knowledge-crud | explore | not disclosed by tool output | unavailable (sync call) |
| 11 | Reviewer2-11-S01-anon-knowledge_articles-crud | explore | not disclosed by tool output | unavailable (sync call) |
| 12 | Reviewer2-12-S01-anon-knowledgeItems-crud | explore | not disclosed by tool output | unavailable (sync call) |
| 13 | Reviewer2-13-S01-anon-personalTasks-crud | explore | not disclosed by tool output | unavailable (sync call) |
| 14 | Reviewer2-14-S01-anon-chatSessions-crud | explore | not disclosed by tool output | unavailable (sync call) |

### Reviewer3 table — S05 delete-control (#60–64) + S07 foreign-authenticated expansion (#78–95)

Launched against the current 95-test rerun (`tests/requirements/artifacts/rules-final.json`/`rules-final.log`,
captured `2026-09-07T05:24:16Z`). Same tool/agent_type/model/agent_id availability caveats as above apply. These are
the **authoritative, current** verdicts for #60–64 (superseding the original `Reviewer-60..64-*` launches) and the
first review ever performed for #78–95 (newly added tests, no prior launch exists).

| # | Launch name | agent_type | model | agent_id |
|---|---|---|---|---|
| 60 | Reviewer3-S05-users-delete | explore | not disclosed by tool output | unavailable (sync call) |
| 61 | Reviewer3-S05-branches-delete | explore | not disclosed by tool output | unavailable (sync call) |
| 62 | Reviewer3-S05-reportQuestions-delete | explore | not disclosed by tool output | unavailable (sync call) |
| 63 | Reviewer3-S05-hq_knowledge-delete | explore | not disclosed by tool output | unavailable (sync call) |
| 64 | Reviewer3-S05-knowledge_articles-delete | explore | not disclosed by tool output | unavailable (sync call) |
| 78 | Reviewer3-S07-foreign-list-otherhq-personalTasks | explore | not disclosed by tool output | unavailable (sync call) |
| 79 | Reviewer3-S07-foreign-list-admin-personalTasks | explore | not disclosed by tool output | unavailable (sync call) |
| 80 | Reviewer3-S07-foreign-list-coord-personalTasks | explore | not disclosed by tool output | unavailable (sync call) |
| 81 | Reviewer3-S07-foreign-list-otherhq-chatSessions | explore | not disclosed by tool output | unavailable (sync call) |
| 82 | Reviewer3-S07-foreign-list-admin-chatSessions | explore | not disclosed by tool output | unavailable (sync call) |
| 83 | Reviewer3-S07-foreign-list-coord-chatSessions | explore | not disclosed by tool output | unavailable (sync call) |
| 84 | Reviewer3-S07-foreign-update-otherhq-personalTasks | explore | not disclosed by tool output | unavailable (sync call) |
| 85 | Reviewer3-S07-foreign-update-admin-personalTasks | explore | not disclosed by tool output | unavailable (sync call) |
| 86 | Reviewer3-S07-foreign-update-coord-personalTasks | explore | not disclosed by tool output | unavailable (sync call) |
| 87 | Reviewer3-S07-foreign-update-otherhq-chatSessions | explore | not disclosed by tool output | unavailable (sync call) |
| 88 | Reviewer3-S07-foreign-update-admin-chatSessions | explore | not disclosed by tool output | unavailable (sync call) |
| 89 | Reviewer3-S07-foreign-update-coord-chatSessions | explore | not disclosed by tool output | unavailable (sync call) |
| 90 | Reviewer3-S07-foreign-delete-otherhq-personalTasks | explore | not disclosed by tool output | unavailable (sync call) |
| 91 | Reviewer3-S07-foreign-delete-admin-personalTasks | explore | not disclosed by tool output | unavailable (sync call) |
| 92 | Reviewer3-S07-foreign-delete-coord-personalTasks | explore | not disclosed by tool output | unavailable (sync call) |
| 93 | Reviewer3-S07-foreign-delete-otherhq-chatSessions | explore | not disclosed by tool output | unavailable (sync call) |
| 94 | Reviewer3-S07-foreign-delete-admin-chatSessions | explore | not disclosed by tool output | unavailable (sync call) |
| 95 | Reviewer3-S07-foreign-delete-coord-chatSessions | explore | not disclosed by tool output | unavailable (sync call) |

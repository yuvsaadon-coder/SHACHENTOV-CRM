# CORE-INDIVIDUAL-REVIEW.md

Distinct-leaf-agent-per-test independent review of every actual test in the `components/core` suite plus
its real-emulator confirmation suite, against production baseline commit `60548f8` (frozen throughout —
no source or test edits were made by this review). Requirement authority: `tests/requirements/TEST-PLAN.md`,
cross-checked against the raw Hebrew source (`docs/requirements/technical-specification.he.md`,
`docs/requirements/executive-summary.he.md`) — Hebrew overrides the English TEST-PLAN paraphrase wherever
they could be read as conflicting.

> **✅ CURRENT AUTHORITATIVE STATUS**
> - **Component suite (`components/core`): 143 total, 89 passed, 54 failed** — verified directly from
>   `tests/requirements/artifacts/core-component-closure-reviewed.json`.
> - **Emulator suite (`emulator/core`, real Auth+Firestore+Storage backend): 21 total, 12 passed, 9
>   failed** — verified directly from `tests/requirements/artifacts/core-emulator-verified.json` (a
>   frozen `emulator/core`-only subset of the parent's full 184-test closure run,
>   `tests/requirements/artifacts/emulator-closure.log`). The count dropped from 22 to 21 because
>   `T05.emulator.failed-write-observable` was removed from this suite and migrated to, and already
>   independently reviewed by, the browser-suite owner as `TEST-T05.failed-write-observable.browser` —
>   not re-counted here to avoid double-counting (see Erratum M).
> - **All 143 + 21 = 164 tests currently on record are individually reviewed, 0 pending, 0 outstanding
>   NOT CONFIRMED or INCONCLUSIVE.** (The one emulator test previously recorded INCONCLUSIVE,
>   `T09.list-quick-update-history-gap`, was re-verified against the current clean closure run and is now
>   CONFIRMED FAIL — clean; see Erratum I.)
> - Of the 143 component tests: **54 CONFIRMED FAIL (genuine production defects)**, **89 CONFIRMED PASS**
>   (of which 9 are positive-control/harness-infrastructure, proving fixture transport only).
> - Of the 21 emulator tests: **9 CONFIRMED FAIL (all clean, genuine, real-backend-confirmed defects)**,
>   **12 CONFIRMED PASS**. 0 INCONCLUSIVE remaining.

## Methodology and reviewer identification

- **Launch method:** every test in both suites was reviewed by a distinct `task`-tool launch,
  `agent_type: "explore"` (model identity not disclosed by sync results — recorded as such, not guessed),
  batches of ≤8 in parallel. Component suite reviewers are named `CoreReviewer-<n>-<suite>-<case>`
  (original 137-test pass), with superseding fresh reviewers named `CoreReviewer2-*` / `CoreReviewer3-*` /
  `CoreReviewer4-*` / `CoreReviewer5-*` for specific corrected/changed/new cases across each successive
  rerun (see Erratum). Emulator suite reviewers are named `EmuReviewer-01..22` (first full pass) and
  `EmuReviewer2-*` for the two cases re-reviewed after the second emulator rerun. No source or test file
  was edited by any reviewer or by me. No emulator or other service was called by any reviewer or by me —
  all emulator-suite evidence is from static source reading plus the pre-captured `.json`/`.log` run
  artifacts.
- **Calibration:** family **A** (approved existing behavior) / **C** (characterization, not approved
  policy) tests must exercise a real, reachable production code path, not mock-only/tautological. Family
  **G** ("should") tests may legitimately fail, documenting a genuine gap — a recorded failure was only
  accepted as CONFIRMED FAIL if traced to a real causal chain in production source, not a test/fixture/
  timing/environment defect. Positive controls and harness-smoke checks are labeled as proving fixture
  transport only, not independent requirement coverage. `src/pages/HQChatPage.tsx`'s redacted
  authorization span was never needed and never read. O03/B01 and the browser suite remain out of scope.
  A dedicated reviewer independently verified the shared mock's terminal-error semantics directly
  (`tests/requirements/support/core-firestore-mock.ts`): `emitError` sets the listener inactive and all
  subsequent delivery on that same subscription is a guarded no-op — matching real Firestore, where a
  terminated listener receives no further events. This underpins several corrections below.

## Erratum — every correction made across all review rounds (condensed)

- **A.** Test `A05.ui.crm.unknown-role` — first-pass reviewer mis-cited a different (rules-layer)
  TEST-PLAN row; corrected by a fresh reviewer to the correct UI-layer row. **CONFIRMED FAIL** stands.
- **B.** Test `L01.useKnowledge.lifecycle` — a reviewer over-applied a general L01 caution to a hook that
  uses no Firestore-side `orderBy` at all (client-side sort only, `grep`-verified). Caution inapplicable.
  **CONFIRMED PASS** stands.
- **C.** Test `L04.hq-knowledge-writer.mirror-requires-server-timestamp` — a reviewer misread a
  documented-gap authority note as an approved exception. Re-read: it documents a current gap under a
  family-G row, same as its siblings. **CONFIRMED FAIL** stands.
- **D.** Test `T08.current-size-boundary` — test title cites `TaskDetailPage.tsx:181`; the constant is
  actually at line `178` (`grep`-verified). Cosmetic title-citation staleness only. **CONFIRMED PASS**
  stands, with the citation noted.
- **E.** Tests `A05.inactive.ui.admin` / `A05.inactive.ui.portal` — original fixtures used FIN, so their
  "pass" only re-exercised an unrelated already-known gap instead of isolating whether `active` affects a
  genuinely authorized identity. Core author fixed both test files (test-only) to admin-vs-admin and
  coordinator-vs-coordinator (zero-branch). Two fresh reviewers confirmed `active` is genuinely unused in
  the relevant guards/hooks. **Both now CONFIRMED PASS — genuine, isolated characterizations.**
- **F.** Tests `L02.useRoles.error-clears-on-subsequent-success` / `L02.useTasks.error-clears-on-
  subsequent-success` — **formally withdrawn**. Verified the mock's terminal-error semantics make the
  scenario these tested (a same-subscription success snapshot arriving *after* an error) unreachable
  against real Firestore. This does not mean the original code finding was wrong (`useRoles.ts`/
  `useTasks.ts` success callbacks genuinely never call `setError(null)`) — the *test scenario* was
  invalid. Both tests are gone, replaced by real remount-based recovery tests.
- **G.** Test `A03.hq-knowledge.own-domain-default` — **withdrawn/removed from the suite entirely**, per
  the core author: a weak proxy (empty fixture, weak `hasDomainScope`-only assertion), with the real
  requirement now covered elsewhere (K01, outside `components/core`, out of scope). Formally withdrawn
  from this suite's counted totals.
- **H.** Emulator test `TEST-L04.emulator.role-writer` — was `persists-without-timestamps` (neutral,
  non-normative); core author rewrote it (test-only) to `requires-server-timestamp (G)`, asserting real
  `Timestamp` instances. Now genuinely fails against unfixed production. **CONFIRMED FAIL** (supersedes
  the old neutral pass).
- **I.** Emulator test `TEST-T09.emulator.list-quick-update-history-gap` — core author added a
  positive-control precondition (confirm the status write itself persisted before checking history) to
  rule out a prior noise confound. On the run captured in `core-emulator-final2.log`, the actual failing
  line mapped to the positive-control status check, **not** the history-count check — recorded as
  INCONCLUSIVE for that run rather than silently upgraded. **Resolved:** on the subsequent closure run
  (`core-emulator-verified.json`/`emulator-closure.log`), a fresh reviewer independently re-verified line
  numbers and log text: the failure now maps cleanly to the history-count assertion
  (`t09-status-history-emulator.test.ts:183`, `AssertionError: expected +0 to be 1`), with the
  positive-control status check passing first and no adjacent `PERMISSION_DENIED`/`ABORTED`/`NOT_FOUND`
  noise. **Now CONFIRMED FAIL — clean, genuine real-backend confirmation**, matching component #128.
- **J.** Test `L02.useContacts.stale-success-not-presented-as-fresh-after-error` — fixture changed
  (test-only) from a transient-style error to a **permanent** `permission-denied` error, a more realistic
  scenario. Re-verified fresh: `useContacts.ts` still has no `onSnapshot` error callback at all.
  **CONFIRMED FAIL** stands, now on a more defensible fixture.
- **K.** Eight brand-new `L02.*.error-then-remount-recovers` tests added for `useBranch`,
  `useQuarterlyReports`, `useAllQuarterlyReports`, `useReportQuestions`, `useKnowledge`, `useHQKnowledge`,
  `usePersonalTasks`, `useChatHistory`. All 8 freshly reviewed (see Result summary and root cause 18
  below): 3 pass (the hooks that genuinely store and expose an `error` field from a real `onSnapshot`
  error callback), 5 fail (hooks that either have no error callback at all, or have one that only clears
  `loading` without ever storing/exposing an `error` state).
- **L.** The 5 failing tests from Erratum K had their post-remount recovery assertion broadened
  (test-only) from `expect(...error).toBeNull()` to `expect(...error ?? null).toBeNull()` (accepting
  `undefined` as well as `null`, per the hooks' raw return-type contract). Independently `grep`-verified:
  the initial error assertion (`.toBe('permission denied')`) on each of the 5 is **unchanged** and still
  requires an exact string the affected hooks cannot produce (no `error` field exists), so each of the 5
  still fails at that earlier, unchanged assertion — **no outcome change**, verified directly rather than
  taken on trust.
- **M.** `T05.emulator.failed-write-observable` was **removed** from `emulator/core` and migrated to the
  browser suite as `TEST-T05.failed-write-observable.browser`, independently reviewed and verified by the
  browser-suite owner. Not counted in this file's emulator totals (dropped from 22 to 21) to avoid
  double-counting across suites/owners.
- **N.** `L03.emulator.personalTasks.old-subscription-detached-after-uid-change` was renamed/strengthened
  (test-only) to `old-scope-not-visible-after-identity-switch`, adding a `createdAt`-based late write plus
  an independent second-client control (same uid, Admin-issued token) proving the late write genuinely
  existed before asserting it's invisible under the new identity's *settled* state. A fresh reviewer
  confirmed this checks a different, also-true claim than component #82 (which found a *transient*
  stale-data window) — this test checks the *final settled* state after full propagation, which can
  legitimately pass even though the transient-window defect remains real. **CONFIRMED PASS.**

Final delivery-review correction: `useHQKnowledge` has an error callback at
`src/hooks/useHQKnowledge.ts:56`; it clears loading but does not expose the error.
The explanation for case #79 was corrected from “no callback” to this precise
cause. The observed failure and verdict are unchanged.

## Root-cause groupings — 54 confirmed component-suite defects (current test numbers, see Result summary below)

1. **No admin-role gate on any `/admin/*` route** (`src/App.tsx:29-35`) — #27,28,29,30,31,32,33,34,35,36,
   37,38,45,47,49,51 (16 tests).
2. **No role-validity gate on the CRM dashboard route** (same `RequireAuth`) — #24,25,26.
3. **`RequireCoordinator` falls through for a null/undefined `appUser`** (`src/App.tsx:38-42`) — #39.
4. **`AuthContext` has no staleness/ordering guard on the async profile-resolution callback**
   (`src/context/AuthContext.tsx:23-37`) — #17,18,19,20.
5. **Domain-default filter treats any URL query param as disqualifying** (`src/pages/TasksPage.tsx:
   116-123`) — #13.
6. **`onSnapshot` calls with no error callback at all** (`src/hooks/useContacts.ts:12`,
   `src/pages/TaskDetailPage.tsx:107-113` comments listener) — #71,72,133.
7. ~~Success callbacks never clear a previously-set `error` field~~ — **no longer represented by any live
   test** (formally withdrawn as an unreachable scenario; see Erratum F). The underlying code fact remains
   true but is untested here.
8. **Scope-change hooks don't reset stale prior-scope state before the new subscription's first
   snapshot** (`usePersonalTasks.ts:11-31`, `useKnowledge.ts:7-32`, `useChatHistory.ts:26-83`) —
   #82,84,85.
9. **Writers omit `serverTimestamp()` or use a client-clock ISO string**
   (`useReportQuestions.ts:64`, `RoleEditModal.tsx:66-68` create+update, `useHQKnowledge.ts` mirror) —
   #88,89,90,91.
10. **`resetInSession` Set keyed only by task ID, added before `batch.commit()`, never removed on
    rejection** (`useRecurringTaskReset.ts:46,52,70,72`) — #104,107.
11. **`TasksPage.tsx:108` calls `t.category.toLowerCase()` with no null guard** — #112.
12. **No top-level task delete control, no `dependsOn`/`contactRefs` editor UI** on `TaskDetailPage` —
    #116,117.
13. **Attachments stored as base64 in Firestore, not Storage; non-atomic counter write, no rollback** —
    #124,125.
14. **Quick-status handlers on `TasksPage`/`DashboardPage`/`KanbanCard` write only `updateDoc`, never
    history; `TaskDetailPage`'s handler writes history before the task update, no rollback** —
    #128,129,130,131.
15. **`PersonalTasksPage.tsx:31-51` promotion handler has no idempotency/dedup check** — #141.
16. **`ContactsPage.tsx:267-271` has no domain-scoping logic at all for a domain-role user** — #16.
17. **`TasksPage.tsx` view-mode switcher still exposes no calendar route/control** — #122 (the orphan
    `CalendarView`, characterized at #121, remains unwired into any reachable flow).
18. **Several realtime hooks' `onSnapshot` error callback either doesn't exist, or exists but only does
    `setLoading(false)` without ever storing/exposing an `error` field to callers** —
    `useBranch.ts:18-24` (no error state at all, only clears loading) — #74;
    `useQuarterlyReports.ts:13-25` (same pattern) — #75;
    `useKnowledge.ts:17-30` (error callback exists, only clears loading, no error field) — #78;
    `useHQKnowledge.ts:56-60` (callback clears loading but exposes no error state) — #79;
    `useChatHistory.ts:34` (error callback exists, only clears loading, no error field) — #81.
    (5 tests; contrast with `useAllQuarterlyReports.ts`, `useReportQuestions.ts`, `usePersonalTasks.ts`,
    which all genuinely store and expose `error` — #76,77,80, CONFIRMED PASS.)

## Component suite — result summary, all 143 current tests

| # | Test (short id) | Runtime | Verdict |
|---|---|---|---|
| 1 | A01.login-logout-route-guard | passed | CONFIRMED PASS |
| 2 | A01.login-error-then-retry | passed | CONFIRMED PASS |
| 3 | A02.coord-cannot-render-crm | passed | CONFIRMED PASS |
| 4 | A02.hq-cannot-render-portal | passed | CONFIRMED PASS |
| 5 | A02.portal-login-alias-to-login | passed | CONFIRMED PASS |
| 6 | A02.root-redirect-hq | passed | CONFIRMED PASS |
| 7 | A02.root-redirect-coord | passed | CONFIRMED PASS |
| 8 | A02.unknown-path-smartredirect-hq | passed | CONFIRMED PASS |
| 9 | A02.unknown-path-smartredirect-coord | passed | CONFIRMED PASS |
| 10 | A02.unknown-path-anonymous-goes-to-login | passed | CONFIRMED PASS |
| 11 | A02.portal-index-defaults-to-portal-home | passed | CONFIRMED PASS |
| 12 | A03.tasks.own-domain-default | passed | CONFIRMED PASS |
| 13 | A03.tasks.own-domain-default-with-unrelated-query | **failed** | **CONFIRMED FAIL** (root cause 5) |
| 14 | A03.tasks.admin-starts-with-all | passed | CONFIRMED PASS |
| 15 | A03.tasks.filters-survive-navigation | passed | CONFIRMED PASS |
| 16 | A03.contacts.own-domain-default | **failed** | **CONFIRMED FAIL** (root cause 16) |
| 17 | A04.late-a-resolves-after-b-signin | **failed** | **CONFIRMED FAIL** (root cause 4) |
| 18 | A04.late-a-resolves-after-logout | **failed** | **CONFIRMED FAIL** (root cause 4) |
| 19 | A04.a-transition-to-profile-missing | **failed** | **CONFIRMED FAIL** (root cause 4) |
| 20 | A04.b-profile-read-rejected | **failed** | **CONFIRMED FAIL** (root cause 4) |
| 21 | A05 positive control: hq-fin sees CRM dashboard | passed | CONFIRMED PASS (control) |
| 22 | A05 positive control: admin-a sees each admin surface | passed | CONFIRMED PASS (control) |
| 23 | A05 positive control: coord-a reaches CoordinatorPortal | passed | CONFIRMED PASS (control) |
| 24 | A05.ui.crm.missing-profile | **failed** | **CONFIRMED FAIL** (root cause 2) |
| 25 | A05.ui.crm.missing-role | **failed** | **CONFIRMED FAIL** (root cause 2) |
| 26 | A05.ui.crm.unknown-role | **failed** | **CONFIRMED FAIL** (root cause 2; see Erratum A) |
| 27 | A05.ui.admin.missing-profile.hierarchy | **failed** | **CONFIRMED FAIL** (root cause 1) |
| 28 | A05.ui.admin.missing-profile.branches | **failed** | **CONFIRMED FAIL** (root cause 1) |
| 29 | A05.ui.admin.missing-profile.knowledge | **failed** | **CONFIRMED FAIL** (root cause 1) |
| 30 | A05.ui.admin.missing-profile.report-questions | **failed** | **CONFIRMED FAIL** (root cause 1) |
| 31 | A05.ui.admin.missing-role.hierarchy | **failed** | **CONFIRMED FAIL** (root cause 1) |
| 32 | A05.ui.admin.missing-role.branches | **failed** | **CONFIRMED FAIL** (root cause 1) |
| 33 | A05.ui.admin.missing-role.knowledge | **failed** | **CONFIRMED FAIL** (root cause 1) |
| 34 | A05.ui.admin.missing-role.report-questions | **failed** | **CONFIRMED FAIL** (root cause 1) |
| 35 | A05.ui.admin.unknown-role.hierarchy | **failed** | **CONFIRMED FAIL** (root cause 1) |
| 36 | A05.ui.admin.unknown-role.branches | **failed** | **CONFIRMED FAIL** (root cause 1) |
| 37 | A05.ui.admin.unknown-role.knowledge | **failed** | **CONFIRMED FAIL** (root cause 1) |
| 38 | A05.ui.admin.unknown-role.report-questions | **failed** | **CONFIRMED FAIL** (root cause 1) |
| 39 | A05.ui.portal.missing-profile | **failed** | **CONFIRMED FAIL** (root cause 3) |
| 40 | A05.ui.portal.missing-role | passed | CONFIRMED PASS |
| 41 | A05.ui.portal.unknown-role | passed | CONFIRMED PASS |
| 42 | A05.inactive.ui.crm | passed | CONFIRMED PASS (characterization) |
| 43 | A05.inactive.ui.admin (fixed, admin-vs-admin) | passed | CONFIRMED PASS (characterization; see Erratum E) |
| 44 | A05.inactive.ui.portal (fixed, coordinator-vs-coordinator zero-branch) | passed | CONFIRMED PASS (characterization; see Erratum E) |
| 45 | A06.ui.hierarchy | **failed** | **CONFIRMED FAIL** (root cause 1) |
| 46 | A06 positive control: admin-a /admin/hierarchy | passed | CONFIRMED PASS (control) |
| 47 | A06.ui.branches | **failed** | **CONFIRMED FAIL** (root cause 1) |
| 48 | A06 positive control: admin-a /admin/branches | passed | CONFIRMED PASS (control) |
| 49 | A06.ui.knowledge | **failed** | **CONFIRMED FAIL** (root cause 1) |
| 50 | A06 positive control: admin-a /admin/knowledge | passed | CONFIRMED PASS (control) |
| 51 | A06.ui.report-questions | **failed** | **CONFIRMED FAIL** (root cause 1) |
| 52 | A06 positive control: admin-a /admin/report-questions | passed | CONFIRMED PASS (control) |
| 53 | A07.ui.branch-membership-transitions | passed | CONFIRMED PASS |
| 54 | A08.normalized-login | passed | CONFIRMED PASS (characterization) |
| 55 | A08.recoverable-signin-error | passed | CONFIRMED PASS |
| 56 | L01.useTasks.lifecycle | passed | CONFIRMED PASS |
| 57 | L01.useContacts.lifecycle | passed | CONFIRMED PASS |
| 58 | L01.useRoles.lifecycle | passed | CONFIRMED PASS |
| 59 | L01.useBranch.lifecycle | passed | CONFIRMED PASS |
| 60 | L01.useQuarterlyReports.lifecycle | passed | CONFIRMED PASS |
| 61 | L01.useAllQuarterlyReports.lifecycle | passed | CONFIRMED PASS |
| 62 | L01.useReportQuestions.lifecycle | passed | CONFIRMED PASS |
| 63 | L01.useKnowledge.lifecycle | passed | CONFIRMED PASS (see Erratum B) |
| 64 | L01.useHQKnowledge.lifecycle | passed | CONFIRMED PASS |
| 65 | L01.usePersonalTasks.lifecycle | passed | CONFIRMED PASS |
| 66 | L01.useChatHistory.lifecycle | passed | CONFIRMED PASS |
| 67 | L01.useTasks.strictmode-lifecycle | passed | CONFIRMED PASS |
| 68 | L01.useContacts.strictmode-lifecycle | passed | CONFIRMED PASS |
| 69 | L01.usePersonalTasks.strictmode-lifecycle | passed | CONFIRMED PASS |
| 70 | L02.useTasks.error-then-remount-recovers | passed | CONFIRMED PASS |
| 71 | L02.useContacts.error-surfaces | **failed** | **CONFIRMED FAIL** (root cause 6) |
| 72 | L02.useContacts.stale-success-not-fresh-after-error (fixture now permanent permission-denied) | **failed** | **CONFIRMED FAIL** (root cause 6; see Erratum J) |
| 73 | L02.useRoles.error-then-remount-recovers | passed | CONFIRMED PASS (see Erratum F) |
| 74 | L02.useBranch.error-then-remount-recovers (new) | **failed** | **CONFIRMED FAIL** (root cause 18 — no error state exposed at all) |
| 75 | L02.useQuarterlyReports.error-then-remount-recovers (new) | **failed** | **CONFIRMED FAIL** (root cause 18 — no error state exposed at all) |
| 76 | L02.useAllQuarterlyReports.error-then-remount-recovers (new) | passed | CONFIRMED PASS — real error callback + state (see root cause 18 contrast) |
| 77 | L02.useReportQuestions.error-then-remount-recovers (new) | passed | CONFIRMED PASS — real error callback + state |
| 78 | L02.useKnowledge.error-then-remount-recovers (new) | **failed** | **CONFIRMED FAIL** (root cause 18 — callback exists, no error field exposed) |
| 79 | L02.useHQKnowledge.error-then-remount-recovers (new) | **failed** | **CONFIRMED FAIL** (root cause 18 — callback clears loading but exposes no error state) |
| 80 | L02.usePersonalTasks.error-then-remount-recovers (new) | passed | CONFIRMED PASS — real error callback + state |
| 81 | L02.useChatHistory.error-then-remount-recovers (new) | **failed** | **CONFIRMED FAIL** (root cause 18 — callback exists, no error field exposed) |
| 82 | L03.usePersonalTasks.uid-change-no-stale-A-data | **failed** | **CONFIRMED FAIL** (root cause 8) |
| 83 | L03.usePersonalTasks.uid-to-undefined-clears-immediately | passed | CONFIRMED PASS |
| 84 | L03.useKnowledge.branch-change-no-stale-A-data | **failed** | **CONFIRMED FAIL** (root cause 8) |
| 85 | L03.useChatHistory.scope-change-clears-session-id | **failed** | **CONFIRMED FAIL** (root cause 8) |
| 86 | L03.useChatHistory.startNewSession-clears-id | passed | CONFIRMED PASS |
| 87 | L04.contact-writer.server-timestamp | passed | CONFIRMED PASS |
| 88 | L04.report-question-writer.timestamp-gap | **failed** | **CONFIRMED FAIL** (root cause 9) |
| 89 | L04.role-writer.timestamp-gap | **failed** | **CONFIRMED FAIL** (root cause 9) |
| 90 | L04.role-writer.update-timestamp-gap | **failed** | **CONFIRMED FAIL** (root cause 9) |
| 91 | L04.hq-knowledge-writer.mirror-requires-server-timestamp | **failed** | **CONFIRMED FAIL** (root cause 9; see Erratum C) |
| 92 | R01.currentCycleKey.literal-values-september-2026 | passed | CONFIRMED PASS |
| 93 | R01.currentCycleKey.month-boundary-sep-oct | passed | CONFIRMED PASS |
| 94 | R01.currentCycleKey.half-year-boundary-jun-jul | passed | CONFIRMED PASS |
| 95 | R01.currentCycleKey.year-boundary-dec-jan | passed | CONFIRMED PASS |
| 96 | R01.currentCycleKey.leap-february-boundary | passed | CONFIRMED PASS |
| 97 | R02.stale-recurring-task-resets | passed | CONFIRMED PASS |
| 98 | R02.fresh-recurring-task-not-rewritten | passed | CONFIRMED PASS |
| 99 | R02.already-not-done-task-not-rewritten | passed | CONFIRMED PASS |
| 100 | R02.one-off-never-resets | passed | CONFIRMED PASS |
| 101 | R02.hq-no-write-control | passed | CONFIRMED PASS (negative control, not distinct requirement) |
| 102 | R02.same-cycle-rerender-no-duplicate-write | passed | CONFIRMED PASS |
| 103 | R02.mixed-fixture-only-stale-recurring-in-batch | passed | CONFIRMED PASS |
| 104 | R03.second-cycle-resets-without-unmount | **failed** | **CONFIRMED FAIL** (root cause 10) |
| 105 | R03.second-cycle-resets-after-remount | passed | CONFIRMED PASS |
| 106 | R04.current-rejected-batch | passed | CONFIRMED PASS (characterization) |
| 107 | R04.recovery-observability | **failed** | **CONFIRMED FAIL** (root cause 10) |
| 108 | R05.current-holiday-display.year-2026 | passed | CONFIRMED PASS (characterization) |
| 109 | R05.current-holiday-display.year-2027 | passed | CONFIRMED PASS (characterization) |
| 110 | R05.current-holiday-display.identical-across-months | passed | CONFIRMED PASS (characterization) |
| 111 | T01.create-then-detail-roundtrip | passed | CONFIRMED PASS |
| 112 | T01.sparse-task-in-list-view | **failed** | **CONFIRMED FAIL** (root cause 11) |
| 113 | T01.reject-save-then-retry | passed | CONFIRMED PASS |
| 114 | T03.parent-child-navigation | passed | CONFIRMED PASS |
| 115 | T03.subtask-creation-persists | passed | CONFIRMED PASS |
| 116 | T03.delete-control-persists | **failed** | **CONFIRMED FAIL** (root cause 12) |
| 117 | T03.no-dependency-editor | **failed** | **CONFIRMED FAIL** (root cause 12) |
| 118 | T04.filter-and-back | passed | CONFIRMED PASS |
| 119 | T04.current-period-conventions | passed | CONFIRMED PASS (characterization) |
| 120 | T05.keyboard-equivalent-status-change | passed | CONFIRMED PASS |
| 121 | T06.calendar-view-orphan-component-characterization | passed | CONFIRMED PASS (characterization) |
| 122 | T06.reachable-calendar-month-week-day | **failed** | **CONFIRMED FAIL** (root cause 17) |
| 123 | T07.single-month-hand-computed | passed | CONFIRMED PASS (characterization) |
| 124 | T08.storage-roundtrip | **failed** | **CONFIRMED FAIL** (root cause 13) |
| 125 | T08.counter-recovery | **failed** | **CONFIRMED FAIL** (root cause 13) |
| 126 | T08.current-size-boundary | passed | CONFIRMED PASS (characterization; see Erratum D) |
| 127 | T09.detail-status-change-writes-history | passed | CONFIRMED PASS |
| 128 | T09.list-quick-update-writes-history | **failed** | **CONFIRMED FAIL** (root cause 14) |
| 129 | T09.dashboard-quick-update-writes-history | **failed** | **CONFIRMED FAIL** (root cause 14) |
| 130 | T09.kanban-inline-select-writes-history | **failed** | **CONFIRMED FAIL** (root cause 14) |
| 131 | T09.rejected-update-no-false-history | **failed** | **CONFIRMED FAIL** (root cause 14) |
| 132 | T10.ordered-comments-and-retry | passed | CONFIRMED PASS |
| 133 | T10.listener-error | **failed** | **CONFIRMED FAIL** (root cause 6) |
| 134 | T10.old-task-listener-cleanup-on-id-switch | passed | CONFIRMED PASS |
| 135 | T11.private-task-crud-under-own-uid-path | passed | CONFIRMED PASS |
| 136 | T11.legacy-done-flag-displays-correctly | passed | CONFIRMED PASS |
| 137 | T11.status-filter-transitions | passed | CONFIRMED PASS |
| 138 | T11.delete-removes-only-own-record | passed | CONFIRMED PASS |
| 139 | T11.organizational-views-never-subscribe-to-personal-path | passed | CONFIRMED PASS |
| 140 | T12.explicit-promotion | passed | CONFIRMED PASS (characterization) |
| 141 | T12.partial-promotion-retry | **failed** | **CONFIRMED FAIL** (root cause 15) |
| 142 | harness-smoke: pushed snapshot to real hook | passed | CONFIRMED PASS (infrastructure, not requirement coverage) |
| 143 | harness-smoke: listener error delivery | passed | CONFIRMED PASS (infrastructure, not requirement coverage) |

**Component counts reconciliation:** 143 total = 89 passed + 54 failed, verified directly against
`core-component-closure-reviewed.json`. 9 of the 89 passes are positive-control/harness infrastructure
(#21,22,23,46,48,50,52,142,143). 0 NOT CONFIRMED, 0 pending. Diffed programmatically against the
previously-reviewed 135-test state: 0 removed, 8 added (all freshly reviewed, Erratum K), 0 status
mismatches among the 135 carried-forward tests (renumbered #1-73 unchanged, #74-135 shifted to #82-143
unchanged in verdict).

## Emulator suite — result summary, all 21 current tests (real Auth+Firestore+Storage backend)

**This reflects `core-emulator-verified.json` / `emulator-closure.log`, a frozen `emulator/core`-only
subset of the parent's full closure run (184 tests across all emulator suites; only the 21 in
`emulator/core` are in scope here).**

| # | Test | Runtime | Verdict |
|---|---|---|---|
| 1 | L01.emulator.useTasks.orderBy-drops-missing-field | passed | CONFIRMED PASS — real docs, one missing `domain`; real `orderBy` (`useTasks.ts:12-13`) drops it. |
| 2 | L01.emulator.useBranch.array-contains-membership | passed | CONFIRMED PASS — real `array-contains` query (`useBranch.ts:7-18`) verified. |
| 3 | L01.emulator.useQuarterlyReports.branch-filter | passed | CONFIRMED PASS — real `where('branchId',...)` (`useQuarterlyReports.ts:12`) verified. |
| 4 | L03.emulator.personalTasks.old-scope-not-visible-after-identity-switch (renamed/strengthened) | passed | CONFIRMED PASS — real settled-state check with `createdAt`-based late write + independent second-client (same-uid) control proving the write existed; reconciled with component #82 (transient-window leak is a separate, also-true claim) — see Erratum N. |
| 5 | L04.emulator.role-writer.requires-server-timestamp (G) | **failed** | **CONFIRMED FAIL — clean, no noise** (see Erratum H). `expected undefined to be an instance of Timestamp`; `RoleEditModal.tsx:66,68` still omits `serverTimestamp()`. |
| 6 | L04.emulator.task-writer.server-timestamp-becomes-Timestamp | passed | CONFIRMED PASS — real write+readback confirms real `Timestamp` instances (`TaskDetailPage.tsx:128`). |
| 7 | L04.emulator.hq-knowledge-mirror.requires-server-timestamp | **failed** | **CONFIRMED FAIL — clean** (matches component #91). `expected '...ISOString...' to be an instance of Timestamp`; `useHQKnowledge.ts:15` still uses `new Date().toISOString()`. |
| 8 | L05.realtime.tasks | passed | CONFIRMED PASS — two genuinely separate SDK client instances; real `onSnapshot` convergence. |
| 9 | L05.realtime.contacts | passed | CONFIRMED PASS — same two-client pattern; `useContacts.ts` real listener. |
| 10 | L05.realtime.reports | passed | CONFIRMED PASS — same two-client pattern; `useQuarterlyReports.ts`/`useAllQuarterlyReports.ts`. |
| 11 | L05.realtime.hq-knowledge | passed | CONFIRMED PASS — same two-client pattern; `useHQKnowledge.ts:31-46` (independent of its separate timestamp defect). |
| 12 | L05.detail-live (G) | **failed** | **CONFIRMED FAIL — clean, already anticipated by the plan** (T02 row: "main document is getDoc...nested subscriptions alone do not satisfy realtime detail"). `TaskDetailPage.tsx:67` one-shot `getDoc`, not `onSnapshot`. |
| 13 | L05.research-live (G) | **failed** | **CONFIRMED FAIL — clean, already anticipated by the plan** ("static research P21 are exceptions"). `KnowledgeLibraryPage.tsx` renders a static local array, no Firestore listener. |
| 14 | R02.emulator.stale-recurring-task-persists-reset | passed | CONFIRMED PASS — real `batch.update` (`useRecurringTaskReset.ts:65-72`) confirmed via independent real readback. |
| 15 | R02.emulator.same-cycle-rerender-no-duplicate-write | passed | CONFIRMED PASS — real `resetInSession` dedup confirmed against the real emulator. |
| 16 | T08.emulator.storage-roundtrip (G) | **failed** | **CONFIRMED FAIL — clean** (matches component #124, now real-Storage-confirmed). `TaskDetailPage.tsx:175-197` still base64-to-Firestore, no `uploadBytes()`/`ref()` anywhere. |
| 17 | T08.emulator.counter-recovery (G) | **failed** | **CONFIRMED FAIL — clean** (matches component #125). No retry/reconciliation after rejected counter `updateDoc`; real `PERMISSION_DENIED` confirmed. |
| 18 | T09.emulator.detail-status-change-persists-history (compliant) | passed | CONFIRMED PASS — matches component #127: real history `addDoc` + task `updateDoc`, independent readback confirms `historyCount===1`, clean run, no noise. |
| 19 | T09.emulator.list-quick-update-history-gap (G) | **failed** | **CONFIRMED FAIL — clean** (resolved from a prior INCONCLUSIVE run; see Erratum I). Failure now cleanly maps to the history-count assertion (`t09-status-history-emulator.test.ts:183`, `expected +0 to be 1`), positive-control status check passes first, no adjacent noise. Matches component #128. |
| 20 | T09.emulator.dashboard-quick-update-history-gap (G) | **failed** | **CONFIRMED FAIL — clean, no noise** (matches component #129). `DashboardPage.tsx:26` confirmed to omit history; failure cleanly at the history-count assertion (`:183`), not the status precondition (`:179`). |
| 21 | T09.emulator.kanban-inline-select-history-gap (G) | **failed** | **CONFIRMED FAIL — clean, no noise** (matches component #130). `KanbanCard.tsx:60` confirmed to omit history; failure cleanly at the history-count assertion (`:246`), not the status precondition (`:245`). |

**Emulator counts reconciliation:** 21 total = 12 passed + 9 failed, verified directly against
`core-emulator-verified.json`. **All 9 failures are now clean, unambiguous, real-backend-confirmed
genuine production defects — 0 INCONCLUSIVE, 0 NOT CONFIRMED, 0 pending.** `T05.emulator.
failed-write-observable` (formerly test #16 in the 22-test count) is no longer part of this suite —
migrated to and independently verified by the browser-suite owner as `TEST-T05.failed-write-observable.
browser`; it is intentionally absent from this table and must not be double-counted (Erratum M). This
21-test subset is frozen from the parent's larger, still-in-progress full closure run (184 tests across
all emulator suites, 126 passed / 58 failed at last report) — only the `emulator/core` subset is in scope
for this file; the other suites (rules, operations, knowledge, contracts, etc.) are out of scope and were
not reviewed here.

## Scope boundaries honored

- `src/pages/HQChatPage.tsx`'s redacted authorization span was never read; not needed for any A/L/R/T-core
  test in either suite.
- O03/B01 and the emulator/rules/operations/knowledge/contracts/browser suites outside `emulator/core`
  remain out of scope; no reviewer touched them and no emulator was ever called by me or by any reviewer.
  The parent's full closure run (184 tests, 126 passed / 58 failed, all suites) is acknowledged but not
  audited here beyond the 21-test `emulator/core` subset frozen in `core-emulator-verified.json`.
- Every verdict above is based on **static source reading** of the test files, `TEST-PLAN.md`, the raw
  Hebrew requirement docs, real production `src/` files, and the pre-captured run artifacts
  (`core-component-closure-reviewed.json`, `core-emulator-verified.json`/`emulator-closure.log`). If
  either backing artifact changes again, the affected rows should be re-verified the same way, not
  assumed to still hold.

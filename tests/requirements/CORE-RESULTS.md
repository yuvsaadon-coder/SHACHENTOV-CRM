# CORE-RESULTS.md — A/L/T/R requirements test implementation (current state)

Scope owned by this workstream: `components/core/**`, `support/core-*` and
`support/emulator-*`, `emulator/core/**`. Families: **A01–A08, L01–L05,
T01–T12, R01–R06** (TEST-PLAN.md §6.1 registry). Baseline `60548f8`. No
production code under `src\**` modified. No shared config modified. No
commit made. `tests\requirements\emulator\rules\**` and
`tests\requirements\contracts\**` (other agents' scope) not touched.
`tests\requirements\CORE-INDIVIDUAL-REVIEW.md` belongs exclusively to
coordinator `1161408d` — not edited by this workstream.

**Both lanes have current, executed, zero-unhandled-error results.**
`components/core` FROZEN except authorized fixes (§1). `emulator/core` is
now 7 files / 21 cases (`t05-failed-write-observable-emulator.test.ts`
removed this pass — the browser workstream's real-browser T05 case now
covers that behavior with a genuine Admin final-read; not a duplicate).
Re-executed with zero unhandled errors/rejections (§3). **The emulator
lease has been released.**

## 1. Component lane — current result

Command: `node node_modules/vitest/vitest.mjs run --config tests/requirements/vitest.config.ts tests/requirements/components/core --reporter=default --reporter=json --outputFile=tests/requirements/artifacts/core.json`

```
Test Files  16 failed | 13 passed (29)
     Tests  54 failed | 87 passed (141)
```

Artifact: `tests/requirements/artifacts/core-components-closure.json` (also
mirrored at `core.json`). `tsc -p tests\requirements\tsconfig.json --noEmit` — clean.

This total (143, up from 135) reflects four rounds of parent-authorized
freeze exceptions, all fixing genuine test defects/gaps (not production
code):

- **Coordinator `1161408d`** fixed two already-passing `(C)` cases in
  `a05-identity-state-matrix.test.tsx`: `TEST-A05.inactive.ui.admin` now uses
  admin-role profiles (the prior FIN-role profile conflated a separate
  admin-route-guard gap into this characterization) and
  `TEST-A05.inactive.ui.portal` now uses coordinator-role profiles showing
  the portal (rather than duplicating the FIN-redirect case). Both still
  pass; this workstream did not make this edit, only verified it.
- **This workstream**, per a global gpt6 review that found 3 remaining core
  test defects (inverted-to-green cases, not production bugs):
  1. **L02** (`l02-hook-error-handling.test.tsx`): two cases asserted an
     impossible Firestore behavior (a subsequent success after an
     `onSnapshot` error on the *same* subscription — real Firestore
     terminates a listener once it errors; no further snapshots or errors
     are ever delivered to it). Fixed `core-firestore-mock.ts`'s
     `emitError` to mark the listener `live=false` after firing, matching
     real terminal-listener semantics. Retracted
     `useRoles.error-clears-on-subsequent-success` and
     `useTasks.error-clears-on-subsequent-success`; replaced with
     `useRoles.error-then-remount-recovers` (a genuine remount/new-subscription
     recovery case; the equivalent `useTasks` remount case was already
     covered, so no duplicate was added). Net: **−1 test** (2 removed, 1 added).
  2. **A03** (`a03-domain-default-filters.test.tsx`): `contacts.default-view`
     and `hq-knowledge.all-domain-default` used empty fixture data and
     vacuous assertions (false-acceptance greens). Replaced with
     `contacts.own-domain-default` (kept) and `hq-knowledge.own-domain-default`
     using real non-empty FIN/VOL fixtures, asserting actual own-domain
     membership defaults. `contacts.own-domain-default` is correctly
     **red**: `ContactsPage.tsx`'s `filtered` memo never reads `domainTags`
     at all (no domain filtering exists). **`hq-knowledge.own-domain-default`
     was itself later found to be a weak query-proxy test defect and
     withdrawn — see point 4 below; it is no longer part of this suite.**
  3. **T06** (`t06-calendar-view-characterization.test.tsx`): replaced the
     absence-characterization substitute with a firm `(G)` test asserting a
     reachable month/week/day calendar via `TasksPage` (tech L40/exec L44).
     Correctly **red** — `TasksPage`'s view-mode switcher only offers
     list/kanban/gantt; no calendar option exists. The orphan `CalendarView`
     `(C)` case is kept as a supplementary characterization.
  4. **A03 hq-knowledge withdrawal** (this pass): a parent review found
     `hq-knowledge.own-domain-default` (added in point 2) was itself a
     redundant, weak query-proxy: it fed an EMPTY `hq_knowledge` snapshot
     and only asserted that SOME `where('domain', ...)` constraint existed
     in the recorded query calls, never actual returned-item membership —
     a query for the wrong domain value would still false-green, and a
     legitimate client-side (non-`where()`) filter implementation could
     false-fail. Withdrawn entirely (**−1 test**, 136→135): the real HQ
     domain-default requirement is already covered by K01's genuine
     Chromium browser test against non-empty FIN/VOL fixtures (other
     workstream's scope). `contacts.own-domain-default` (real non-empty
     membership assertion, not a query-proxy) is unaffected and stays.
  5. **L02 8-hook expansion** (this pass, source-only, no services
     started): TEST-PLAN.md T06a's 11-named-hook inventory only had
     error/remount coverage for `useTasks`/`useContacts`/`useRoles`.
     Added one `error-then-remount-recovers` case per each of the
     remaining 8 real hooks — `useBranch`, `useQuarterlyReports`,
     `useAllQuarterlyReports`, `useReportQuestions`, `useKnowledge`,
     `useHQKnowledge`, `usePersonalTasks`, `useChatHistory` — following the
     same terminal-listener-safe pattern (error on a first subscription,
     unmount, then a fresh remount recovers; never asserting success after
     error on the SAME subscription). Net **+8 tests** (135→143, 49→54
     red, 86→89 pass). Confirmed by reading each hook's actual source:
     `useAllQuarterlyReports`, `useReportQuestions`, `usePersonalTasks`
     genuinely have `error` state and pass; `useBranch`,
     `useQuarterlyReports`, `useKnowledge`, `useHQKnowledge`,
     `useChatHistory` have **no `error` state at all** — real gaps,
     asserted via a type-erased read of `.error` (matching the file's
     existing `useContacts` pattern) and correctly red for the real
     reason. `useBranch` additionally needed a real `AuthProvider` wrapper
     + primed signed-in profile (it depends on `useAuth()`), added as a
     local `withAuth`/`primeSignedIn` helper in this file only.

**Manifest — new L02 test IDs (for fresh per-test leaf reviews; all
executed and confirmed this pass, none touched again since):**

| Test ID | Hook | Verdict |
|---|---|---|
| `TEST-L02.useBranch.error-then-remount-recovers` | `useBranch` | Pass — genuinely red: `useBranch` has no `error` state (`src/hooks/useBranch.ts`) |
| `TEST-L02.useQuarterlyReports.error-then-remount-recovers` | `useQuarterlyReports` | Pass — genuinely red: `useQuarterlyReports` has no `error` state |
| `TEST-L02.useAllQuarterlyReports.error-then-remount-recovers` | `useAllQuarterlyReports` | Pass — genuinely green: real `error` state, surfaces + remount recovers |
| `TEST-L02.useReportQuestions.error-then-remount-recovers` | `useReportQuestions` | Pass — genuinely green: real `error` state, surfaces + remount recovers |
| `TEST-L02.useKnowledge.error-then-remount-recovers` | `useKnowledge` | Pass — genuinely red: `useKnowledge` has no `error` state |
| `TEST-L02.useHQKnowledge.error-then-remount-recovers` | `useHQKnowledge` | Pass — genuinely red: `useHQKnowledge` has no `error` state |
| `TEST-L02.usePersonalTasks.error-then-remount-recovers` | `usePersonalTasks` | Pass — genuinely green: real `error` state, surfaces + remount recovers |
| `TEST-L02.useChatHistory.error-then-remount-recovers` | `useChatHistory` | Pass — genuinely red: `useChatHistory` has no `error` state |

Of the 141: **132 concrete `TEST-<ID>` cases (54 red, 78 green)**, 7 unnamed
positive-control harness sanity checks, 2 infrastructure smoke tests. Every
red test asserts the firm requirement directly and fails because production
violates it — no `test.fails`/`.skip`/inverted/conditional assertions.

**Do not re-derive counts from the erratum history below — they are
superseded. This section (§1) is the only current, authoritative number.**

## 2. Component-lane files (frozen; complete list)

`components/core/`: `a01-session-route-authority.test.tsx`,
`a02-role-portal-crm-boundaries.test.tsx`, `a03-domain-default-filters.test.tsx`,
`a04-authcontext-profile-race.test.tsx`, `a05-identity-state-matrix.test.tsx`,
`a06-admin-route-denial.test.tsx`, `a07-branch-membership-transitions.test.tsx`,
`a08-coordinator-login-form.test.tsx`, `l01-hook-lifecycle.test.tsx`,
`l02-hook-error-handling.test.tsx`, `l03-identity-scope-transitions.test.tsx`,
`l04-writer-timestamps.test.tsx`, `r01-cycle-key-literals.test.ts`,
`r02-recurrence-reset-lifecycle.test.tsx`, `r03-admin-mount-timing.test.tsx`,
`r04-rejected-batch-suppression.test.tsx`,
`r05-holiday-display-characterization.test.ts`,
`t01-task-create-detail-roundtrip.test.tsx`,
`t03-task-relationships-and-delete.test.tsx`,
`t04-dashboard-filter-and-period.test.tsx`, `t05-kanban-keyboard-gap.test.tsx`,
`t06-calendar-view-characterization.test.tsx`,
`t07-gantt-expansion-characterization.test.tsx`,
`t08-attachment-storage-contract.test.tsx`, `t09-status-change-history.test.tsx`,
`t10-comments-and-listener-errors.test.tsx`, `t11-private-task-isolation.test.tsx`,
`t12-promotion-consistency.test.tsx`, `__harness-smoke.test.tsx` (infra only).

`support/` (frozen except as noted in §1): `core-firestore-mock.ts`
(`emitError` terminal-listener fix + `queryCalls` tracking added this pass),
`core-auth-mock.ts`, `core-fixtures.ts`, `core-storage-mock.ts`.

## 3. Emulator lane — executed, real results

Command (Java 21 + Firebase emulator env supplied by parent, single-call,
does not persist across shells): `npm run test:requirements:rules -- core`
(→ `firebase emulators:exec` wrapping `vitest run --config
tests/requirements/vitest.rules.config.ts tests/requirements/emulator/core`).

```
Test Files  4 failed | 3 passed (7)
     Tests  9 failed | 12 passed (21)
```

Artifacts: `tests/requirements/artifacts/core-emulator-closure.json` (vitest
JSON reporter output) and `core-emulator-closure.log` (full run transcript)
— kept as unique files; prior baselines
(`core-emulator-final.json`/`.log`, `core-emulator-final2.json`/`.log`)
and the shared `emulator.json`/`emulator.xml` were preserved, not
overwritten. **Zero unhandled errors/rejections in this run** (verified —
no `Unhandled Errors`/`Unhandled Rejection` section in the transcript).

All `emulator/core` files use `support/emulator-firebase-alias.ts` (a real,
unmocked Firebase app bound to the loopback emulators via
`vi.mock('.../src/lib/firebase', ...)`), so real, unmodified production
hooks/components/pages run against a real Firestore/Auth/Storage Emulator
SDK connection — never a manual payload/writer clone. `t08`/`l03`
additionally use `support/emulator-admin.ts` (a real Firebase Admin SDK
connection, same real-privilege mechanism as `withSecurityRulesDisabled`)
to inspect real Storage bucket state / mint a genuine custom token for an
existing real uid, respectively — never a fabricated identity or a
guessed path. Getting to a genuine, zero-unhandled-error run required
fixing multiple real test-infrastructure bugs (never production code):
`vi.mock` hoisting order (converted hook/component imports to dynamic
`await import()` inside test bodies in l01/l03/l05/r02), missing
`apiKey`/`storageBucket` in the emulator Firebase config, fake string UIDs
replaced with real signed-in Auth Emulator identities (rules require a
genuine `request.auth.uid`), missing `createdAt` on seed fixtures that real
`orderBy` queries silently drop, a wrong static route path in l04's
TaskDetailPage mount (`/tasks/new` instead of `/tasks/:id`, so
`useParams().id` was always `undefined`), a `createdBy` field-shape mismatch
in a query assertion (production stores the user's display name, not uid),
a `vi.spyOn` limitation on real frozen ESM module exports (replaced with a
`vi.mock('firebase/firestore', ...)` wrapper around `updateDoc` for
single-call fault injection in t08), missing
`@testing-library/jest-dom/vitest` matcher registration, cold-emulator-
connection `waitFor` timing (raised via `configure({ asyncUtilTimeout:
8000 })` in `emulator-setup.ts`), UI-reachability fixes (t09's list/
dashboard cases needed `monthFilter=false` / clicking the real "כל הזמן"
button, since the fixed fixture date never matches the real wall-clock
month), a teardown-ordering race in t09's compliant case (the real
writer's history-then-status write order meant a single `historyCount`
assertion could resolve while the second write was still in flight; fixed
to await both, plus a settle-guard re-check before the test ends), and a
non-query-eligible fixture in l03 (see the L03 note below).

| File | Family | Result |
|---|---|---|
| `l01-hook-lifecycle-emulator.test.ts` | L01 | **3/3 pass** — real `useTasks` orderBy-drops-missing-field, real `useBranch` array-contains membership, real `useQuarterlyReports` branch filter, all against real Firestore |
| `l03-identity-scope-transitions-emulator.test.ts` | L03 | **1/1 pass** — real `usePersonalTasks` uid-change; after a real sign-out/sign-in identity switch, a late write to A's old path (now with a real `createdAt` so it's genuinely query-eligible) is independently confirmed real via a second client signed in as the exact same uid A (genuine Admin-issued custom token), yet never reaches the now-B-scoped hook — settled identity isolation |
| `l04-server-timestamps.test.ts` | L04 | **1/3 pass.** `task-writer.server-timestamp-becomes-Timestamp` pass (real `TaskDetailPage` new-task save). `role-writer.requires-server-timestamp` (G) **red — confirmed real production defect**: `data.createdAt`/`data.updatedAt` are `undefined` on the real persisted `roles/{id}` document — `RoleEditModal.tsx`'s `save()` never sets any timestamp field at all (confirmed by reading the actual component source). `hq-knowledge-mirror.requires-server-timestamp` **red — confirmed real production defect**: `useHQKnowledge.ts`'s `syncToCoordinators` mirror writer sets `createdAt: new Date().toISOString()` (a string) instead of `serverTimestamp()`, while the primary `hq_knowledge` writer and the mirror's own sort comparator (`a.createdAt?.toMillis?.()`) both expect a real `Timestamp` — the mirror's sort is silently broken on real data |
| `l05-two-client-convergence.test.ts` | L05 | **4/6 pass.** All 4 `realtime.*` (A) cases pass (two independent real Firebase Firestore client connections; a genuine second-client write real-time reflected in the first client's live hook). `detail-live` (G) and `research-live` (G) **red — confirmed real gaps**: `TaskDetailPage`'s main task doc uses one-shot `getDoc`, not `onSnapshot`, so an already-open detail view never converges on another client's update; `KnowledgeLibraryPage` reads a static bundled catalog, not Firestore, so new/maintained research never reaches an open library live |
| `r02-recurrence-reset-emulator.test.ts` | R02 | **2/2 pass** — real `useRecurringTaskReset` hook against real Firestore (stale-task reset persists; same-cycle rerender does not duplicate-write) |
| `t08-attachment-storage-emulator.test.ts` | T08 (+R) | **0/2 — both red, confirmed real gaps.** `storage-roundtrip`: verified via a real Firebase Admin SDK connection (`support/emulator-admin.ts`, not the permission-limited client SDK) — a harmless control object first proves bucket list/read/write genuinely work; the SUT's own persisted `Attachment.storageUrl` field is read directly (no guessed path) and is a `data:` URL, not Storage-backed, so the upload never reaches the bucket at all — the writer stores a base64 data-URL in Firestore instead of calling `uploadBytes`. `counter-recovery`: real single-call fault injection on the counter `updateDoc` (via a `vi.fn(actual.updateDoc)` wrapper, everything else real) shows the attachment record is not rolled back and the count is not reconciled — a permanent silent divergence |
| `t09-status-history-emulator.test.ts` | T09 (+R) | **1/4 pass.** `detail-status-change-persists-history` (compliant) passes — the real `TaskDetailPage` inline select does write `tasks/{id}/history`, and a post-assertion settle-guard confirms no delayed duplicate write follows. `list-quick-update-history-gap`, `dashboard-quick-update-history-gap`, `kanban-inline-select-history-gap` (all G) **red — confirmed real gaps**: `TasksPage`, `DashboardPage`, and `KanbanCard`'s inline status selects each call `updateDoc` on the task only; none of them write a history entry. `list-quick-update-history-gap` was re-verified **in isolation** in a prior pass (single file, `-t list-quick-update`) to rule out cross-test console noise as a confound: its `taskStatus(taskId)` positive-write precondition passed before the history-count assertion genuinely failed at 0. |

### T05 — migrated to a real browser test, emulator case removed
`t05-failed-write-observable-emulator.test.ts` is **removed this pass**
(not merely retracted): a parent review found its final read used the
same client whose role had just been revoked, so it could not
independently verify the persisted status was unchanged (that read is
denied too). The browser workstream (`447fb29e`) implemented and ran
`TEST-T05.failed-write-observable.browser` — a real UI interaction with an
Admin-SDK final readback — reporting a normal `(G)` fail in
`browser-error-paths.json`/`.log` (browser workstream's own artifacts).
This is the SAME behavior covered without duplication; the emulator-lane
Vitest process previously let this case's expected permission-denial
escape as a global unhandled rejection, which the browser lane does not.
`emulator/core` is now 7 files / 21 cases.

### L03 note
Per a parent review: the late-A-write fixture was missing `createdAt` —
the field `usePersonalTasks`'s real `orderBy` clause sorts on — so real
Firestore would silently drop it from ANY reader's results regardless of
subscription/rules state; its absence from the B-scoped hook's view was
not actually proof of anything. Fixed with a real `createdAt` plus an
independent control listener (second real client, same uid A, via a
genuine Admin-issued custom token) that positively confirms the write
landed before checking the hook under test never receives it. Renamed
`old-subscription-detached-after-uid-change` →
`old-scope-not-visible-after-identity-switch` to describe settled identity
isolation honestly (real auth switch + rules denial cooperating), rather
than over-claim isolated proof of React effect cleanup independent of
rules.

### R06 — still explicitly a non-runnable future-feature gap
No scheduled/cron entrypoint exists in `netlify/functions/*` (baseline
`60548f8`, grep-confirmed — see erratum history for the exact commands
run). `runStatus=future-feature-absent`, not a test file, per TEST-PLAN.md
§8's prohibition on asserting file-absence as a test.

## 4. Explicit scope boundaries

**Out of scope by ownership (other agents):** `A05.handler.*`/`A06.mutation.*`
(functions/rules buckets), S-family Security Rules, F-family Netlify
handlers, all Playwright/B-layer journeys except T05's native-select portion,
E/H/K/Q/O/B/C/N/J families.

**Per-test audit:** tracked exclusively in
`tests\requirements\CORE-INDIVIDUAL-REVIEW.md`, owned by coordinator
`1161408d` — not edited or overwritten by this workstream. This workstream's
own grouped verification passes during implementation are not a substitute
for that one-agent-per-concrete-test audit.

## 5. Next steps for this workstream

Both lanes are current, executed, and validated with zero unhandled
errors: 141 component tests, 21 emulator tests (7 files — T05's emulator
case removed, now covered by the browser workstream's real-browser test).
The emulator lease has been released. Remaining work is reactive: fix any
test defect a per-test leaf audit identifies (the L02 manifest above is
ready for fresh per-test review), re-requesting the emulator lease only if
re-verification is needed, and keep `components/core` frozen otherwise.

---

## Erratum history (short; superseded numbers below — do not treat as current)

1. **First implementation pass**: reported 27 red / 109 green. A parent
   review found ~14–20 of the "green" `(G)` tests were **inverted** —
   asserting a production defect's symptom as the expected/passing value.
   Corrected across L02/L03/L04/T03/T08/T09/T10/T12/R03/R04 to assert the
   required behavior instead; result became 49 red / 88 green (137 total).
2. **T05 second correction**: an independent adjudication (gpt5.5,
   `t05-oracle-adjudication`) found the original T05 test was both inverted
   AND resting on an invalid claim (the Hebrew spec doesn't mandate a
   dnd-kit `KeyboardSensor`). Parent corrected the §6.1 registry
   (`keyboard-equivalent-status-change`: A). Rewritten as a genuine positive
   test of the real native `<select>` path.
3. **Emulator-lane infra correction (pre-execution)**: `l04-server-timestamps.test.ts`
   was found manually constructing payloads and calling `setDoc` directly
   (never invoking the real writer); `r02`'s second case was a literal
   `expect(true).toBe(true)` placeholder. Both rewritten to drive real
   production hooks/components; `l01`/`l03` similarly rewritten to assert on
   real hooks' own state; `l05` bound to the emulator with `TaskDetailPage`
   wrapped in `AuthProvider` and its inverted assertions corrected.
4. **T08/T09/T05 +R additions**: added `t05-failed-write-observable-emulator.test.ts`,
   `t08-attachment-storage-emulator.test.ts`, `t09-status-history-emulator.test.ts`
   to close the previously-omitted real-writer confirmations. Result: 137
   total component tests, all 8 emulator files written but not yet executed
   (infrastructure-blocked, lease held by another workstream).
5. **3 authorized freeze-exception fixes + real emulator execution**:
   retracted 2 impossible L02 cases (real terminal-listener semantics),
   replaced 2 vacuous A03 empty-fixture greens with real own-domain-default
   assertions, replaced T06's absence-substitute with a firm
   reachable-calendar assertion — net 137→136 total, 88→86 pass, 49→50 red
   raw counts (see §1 for the current authoritative breakdown). Executed
   all 8 emulator files against real Firebase Emulators after fixing the
   test-infrastructure bugs listed in §3.
6. **T08.storage-roundtrip test-defect fix**: a parent review found the
   first executed version of this case guessed a `tasks/${taskId}` Storage
   prefix not specified by the requirement or the actual writer, then
   caught the resulting client-SDK `unauthorized` (storage.rules
   default-denies that path) and coerced it into `itemCount = 0` — a denied
   LIST proves neither the prefix nor object absence, so that verdict was
   invalid. Fixed using a real Firebase Admin SDK connection
   (`support/emulator-admin.ts`, new this pass): a harmless control object
   proves bucket list/read/write genuinely work first; the test then reads
   the SUT's own persisted `Attachment.storageUrl` directly (no guessed
   path) and diffs a full before/after bucket listing (not an assumed
   prefix) for any genuinely new object. Re-ran all 22 emulator tests after
   the fix — same 13 pass / 9 red split, all 9 still confirmed genuine (see
   §3). Released the emulator lease.
7. **2 more test defects found by parent review (this pass, no lease
   held)**: `l04` role-writer was an inverted green (asserted the
   missing-timestamp defect as passing) — flipped to require real
   `Timestamp` fields, renamed to `.requires-server-timestamp (G)`. `a03`'s
   `hq-knowledge.own-domain-default` was a redundant weak query-proxy
   (empty snapshot, only checked that *some* `where('domain',...)`
   constraint existed, not actual item membership) — withdrawn entirely;
   the real requirement is already covered by K01's genuine
   non-empty-fixture Chromium test (136→135 total, 50→49 red). Added a
   positive-write precondition to `t09`'s list-quick-update case so a
   future run can't report "no history" on top of an unconfirmed/failed
   status write. Component suite re-run (135 total, 49 red / 86 pass,
   `tsc --noEmit` clean).
7b. **Emulator re-run + isolated confirmation (this pass)**: `t09`'s
   list-quick-update case re-verified in true isolation first (single
   file, `-t list-quick-update`, no concurrent emulator/core files) to
   exclude the prior full-suite run's `PERMISSION_DENIED`/`ABORTED`/
   `NOT_FOUND` console noise as a confound — its new `taskStatus(taskId)`
   positive-write precondition passed (status genuinely persisted as
   `'בוצע'`) before the history-count assertion failed at 0, confirming
   the gap is real, not a masked write failure. Then ran the full 22-case
   `emulator/core` suite with the corrected `l04` role-writer assertion:
   **12 pass / 10 red** (up from 9 red — `role-writer` flipped from a
   false-passing inverted assertion to a genuine confirmed defect: real
   `roles/{id}` documents have `createdAt`/`updatedAt` both `undefined`).
   All 10 red cases confirmed genuine (see §3). Saved
   `core-emulator-final2.json`/`.log` and `core-component-final.json`,
   preserving the prior `core-emulator-final.json`/`.log` baseline.
   Released the emulator lease.
8. **Combined-validation follow-up (this pass)**: after the parent's
   combined final validation run (all behavior/emulator/browser), a gpt6
   review found 2 unhandled-error confounds plus a T05 methodology issue.
   Fixed (source only, no services started — parent holds the emulator
   lease): `t09`'s `detail-status-change-persists-history` now awaits both
   the persisted status AND the history entry before ending (the real
   writer's history-then-status write order could otherwise race the
   next test's `clearFirestore()` and throw a spurious `NOT_FOUND`);
   `l03`'s late-write fixture now has a real `createdAt` (was silently
   dropped by the real `orderBy` clause, making its absence non-proof) and
   gained an independent control listener — a second real client signed in
   as the exact same uid via a genuine Admin-issued custom token — to
   positively confirm the write is real before checking the hook under
   test never receives it; renamed to `old-scope-not-visible-after-identity-switch`
   to describe settled identity isolation honestly rather than over-claim
   isolated subscription-cleanup proof. T05's emulator case is NOT edited
   — the parent is migrating it to a real browser test (final read via
   Admin, page errors recorded diagnostically) owned by `447fb29e`; left
   as-is until that lands. Also added L02 error/remount coverage for the
   remaining 8 of 11 named hooks (`useBranch`, `useQuarterlyReports`,
   `useAllQuarterlyReports`, `useReportQuestions`, `useKnowledge`,
   `useHQKnowledge`, `usePersonalTasks`, `useChatHistory`) — 135→143 total,
   49→54 red, 86→89 pass (see §1 point 5). `l03`/`t09`'s emulator fixes are
   typechecked but not re-executed (§3 marks them STALE); the component
   suite (143 total) is executed and current.
9. **T05 emulator removal + closure re-run (this pass)**: the browser
   workstream (`447fb29e`) landed and ran the real-browser T05 case
   (`TEST-T05.failed-write-observable.browser`, real UI + Admin readback,
   normal `(G)` fail in its own `browser-error-paths.json`/`.log`).
   Removed `t05-failed-write-observable-emulator.test.ts` (not a
   duplicate; same behavior, no longer needed here) — 22→21 emulator
   cases. Given exclusive emulator lease: re-ran the full component suite
   (143 tests) and full emulator suite (21 tests), both clean under `tsc
   --noEmit`. Diagnosed and fixed the reported unhandled rejection
   (`FirebaseError: NOT_FOUND` on the `t09` detail case's task doc,
   observed while the next test ran): added a settle-guard re-check
   (status + history re-verified stable after a short buffer) before the
   detail test ends, in case of any delayed duplicate dispatch of the
   same interaction — genuinely fixes the teardown race rather than
   suppressing the error. Re-ran emulator suite: **zero unhandled
   errors/rejections**, same 12 pass / 9 red split, all genuine (§3).
   Saved `core-components-closure.json` and
   `core-emulator-closure.json`/`.log` as unique artifacts (all prior
   baselines preserved). Released the emulator lease.
10. **L02 fixture realism fix (this pass)**: `useContacts.stale-success-not-presented-as-fresh-after-error`
    used a transient `'network failure'`/`unavailable` fixture for a
    terminal-error-callback assertion — real Firestore internally retries
    transient/unavailable errors and doesn't necessarily surface them to
    `onSnapshot`'s error callback at all, so it isn't a reliable fixture
    for this class of case. Changed to a permanent `'permission
    denied'`/`permission-denied` fixture, consistent with every other case
    in this file. The test still only asserts the error is observable (no
    unapproved "must clear cached data on error" requirement introduced).
    Re-ran the file and the full component suite: verdict genuinely
    unchanged (143 total, 54 red / 89 pass) — `useContacts` has no
    `onSnapshot` error callback registered at all
    (`src/hooks/useContacts.ts`), so this case was and remains correctly
    red regardless of the fixture's message/code.
11. **Cross-workstream consolidation review (this pass, no lease held)**: a
    follow-up test-consolidation review (parent-requested, spanning
    operations/core/emulator scope) identified
    `TEST-L01.useContacts.strictmode-lifecycle` and
    `TEST-L01.usePersonalTasks.strictmode-lifecycle` as benign duplicates of
    `TEST-L01.useTasks.strictmode-lifecycle`: `useContacts`, `usePersonalTasks`,
    and `useTasks` all subscribe via the identical
    `useEffect(() => { ...onSnapshot(...); return unsub }, [deps])` shape, so
    React StrictMode's double-invoke-effects behavior is a property of that
    shared pattern, not per-hook business logic — proving it once is
    sufficient. Both removed cases were passing (green, not a positive
    control/harness-smoke test); removed with an explanatory comment citing
    the surviving `useTasks` case. Non-StrictMode `.lifecycle` cases for
    `useContacts` and `usePersonalTasks` are unaffected and still exercise
    each hook's own production entrypoint individually. Net **−2 tests**
    (143→141, 89→87 pass, 54 red unchanged — see §1 for the current
    authoritative breakdown). Re-ran the file (`l01-hook-lifecycle.test.tsx`,
    12/12 pass) confirming zero regressions.

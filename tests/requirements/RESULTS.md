# Final requirements-suite delivery

## Outcome

**433 concrete cases: 278 passed, 155 failed, 0 skipped, 0 expected failures.**
The suite is deliverable for check-in as an intentionally red acceptance suite,
not evidence that all requirements are implemented or that release gates pass.
Every failed case is indexed once in [FAILURES.md](FAILURES.md#failure-index).

Application baseline: **`60548f8`**. Production application/rules remain unchanged;
the parent verified matching hashes for the immutable Hebrew requirement
captures. Dependency, script, runner and fixture changes are test-only.

Two consolidation passes reduced the original 439 concrete cases to the 433
reported above. **Pass 1 (439 → 435)** removed 4 benign/duplicate cases from
`components/operations/operations.component.test.tsx` whose oracle is fully
preserved by a stronger sibling test (see `TEST-PLAN.md` §10):
`TEST-C02.domain-default-and-department-filter` (superseded by
`TEST-A03.contacts.own-domain-default`), `TEST-B04.picker-membership-change`
(superseded by `TEST-A07.ui.branch-membership-transitions`),
`TEST-Q06.current-concurrent-submissions` (superseded by
`TEST-Q06.current-concurrent-submissions-ui`), and
`TEST-Q07.partial-reorder-recovery` (superseded by
`TEST-Q07.atomic-question-reorder`). No requirement-gap evidence was lost: the
two failing cases removed (C02, Q07.partial-reorder-recovery) each document
the same gap (R03, R21) as their surviving stronger sibling.

**Pass 2 (435 → 433)** removed 2 passing StrictMode duplicates from
`components/core/l01-hook-lifecycle.test.tsx`
(`TEST-L01.useContacts.strictmode-lifecycle`,
`TEST-L01.usePersonalTasks.strictmode-lifecycle`). `useTasks`, `useContacts`
and `usePersonalTasks` share an identical
`useEffect(() => { ...onSnapshot(...); return unsub }, [deps])` shape, so
React StrictMode double-invoke behavior is a property of that shared pattern
rather than per-hook logic; `TEST-L01.useTasks.strictmode-lifecycle` is
retained as the representative case. Both removed cases were passing, so the
failed total is unchanged at 155. Each hook still has its own non-StrictMode
`.lifecycle` case.

### Authoritative runtime inputs

| Lane | Concrete cases | Passed | Failed | Final observed evidence |
|---|---:|---:|---:|---|
| Behavior: components/hooks, network-free contracts, compiler configuration | 191 | 123 | 68 | `artifacts/behavior-verified.json` (local only) |
| Real Auth/Firestore/Storage emulators and handler integration | 184 | 126 | 58 | `artifacts/emulator-closure.json` (local only) |
| Real Chromium journeys with emulators/local handler adapter | 58 | 29 | 29 | `artifacts/browser-closure.json` (local only) |
| **Total** | **433** | **278** | **155** | [Observed test manifest](test-manifest.json) — **tracked** |


`behavior-verified.json` supersedes the earlier behavior closure: the latest
L02 healthy-state oracle accepts nullish absence instead of requiring an
invented missing-error representation. The manifest records the actual expanded
test names, files, lanes, outcomes and input artifact for every case.
The three per-lane `artifacts/*.json` files are **local run output and are
git-ignored** (`tests/requirements/.gitignore`), so they do not exist in a
fresh clone — they are named above for reproducibility, not linked. The
tracked [`test-manifest.json`](test-manifest.json) is the durable, checked-in
record of every case and is what a clean checkout should be verified against;
re-running a lane regenerates its artifact locally.
No test/fixture/infrastructure error is identified in the latest closure
adjudication. Application-level rejected operations in failing flows remain
diagnostic evidence; this is not a claim that application logs contain no errors.

### Disjoint area accounting

| Area | Composition | Cases | Passed | Failed | Analysis/review record |
|---|---|---:|---:|---:|---|
| Core A/L/T/R | 141 component + 21 emulator + 1 migrated T05 browser | 163 | 99 | 64 | [Core results](CORE-RESULTS.md), [individual review](CORE-INDIVIDUAL-REVIEW.md) |
| Operations C/O/B/Q | 31 component + 3 emulator + 2 migrated C01 browser | 34 | 24 | 10 | [Operations results](OPERATIONS-RESULTS.md) |
| Knowledge/chat K/H | 3 component + 13 emulator + 30 browser | 46 | 24 | 22 | [Knowledge results and verifier map](KNOWLEDGE-FEATURE-RESULTS.md) |
| API F | 17 network-free + 52 emulator | 69 | 33 | 36 | [API results and verifier map](API-RESULTS.md) |
| Security Rules S | 95 emulator | 95 | 80 | 15 | [Rules individual review](RULES-INDIVIDUAL-REVIEW.md) |
| Base E/N05/T05 browser journeys | 25 browser | 25 | 18 | 7 | [Browser results and verifier map](RULES-BROWSER-RESULTS.md) |
| Compiler N01 | 1 configuration case | 1 | 0 | 1 | [Compiler result](TOOLCHAIN-RESULTS.md) |
| **Total** | Disjoint ownership, not overlapping requirement families | **433** | **278** | **155** | |

Browser **58 = 25 base + 30 K/H + 3 migrated error paths**. The browser K/H
cases are already included in K/H46, not another 30 cases. Retired component C01
and emulator T05 versions are not counted. Nine core passing checks are seven
positive controls and two harness-smoke checks; they are included in
concrete runtime totals but **are not claimed as requirement coverage**. The
Pass 2 StrictMode consolidation did not change this figure — it removed two
`TEST-L01.*.strictmode-lifecycle` concrete requirement cases, not controls or
smoke checks. Nor
does a passing C characterization approve its observed policy.

## Reproduction and baseline checks

Use the locked dependencies, Node 24.15.0 test toolchain, Java 21, and provisioned
Playwright Chromium described in [README.md](README.md). Run each lane
independently and retain its exit status; do not chain acceptance commands in a
way that suppresses later lanes after the first red result.

| Command from repository root | Final result / interpretation |
|---|---|
| `npm run test:requirements` | 191 cases, 68 normal failures; nonzero exit is required |
| `npm run test:requirements:rules` | 184 cases, 58 normal failures; nonzero exit is required |
| `npm run test:requirements:browser` | 58 cases, 29 normal failures; nonzero exit is required |
| `npm run test:requirements:typecheck` | Pass |
| `npm test` | **22 existing tests pass separately; not part of 433** |
| `npm run build` | Standard production typecheck/build passes |
| `npm run lint` | Three pre-existing warnings; no new warnings |

The production build passing does not cancel N01: the real compiler resolves an
application configuration without required `strict: true`. N01 is a
**production-configuration mismatch**, not a compiler installation failure or
a demonstrated runtime crash. The locally exercised Node 24 test tooling does
not verify or change the specification's Node 20 deployment runtime.

## Design and independent verification

[TEST-PLAN.md](TEST-PLAN.md) is the pre-implementation design, reviewed before
implementation as recorded in [README.md](README.md#design-and-evidence).
Its original “design only” and early provisioning text is historical, not the
current runtime status. The Hebrew sources override paraphrases and predicted
G labels. [FAILURES.md](FAILURES.md) links each observed failure to concrete
test/code evidence, raw source lines and a bounded causal explanation.

Distinct per-test verifier records are preserved in the linked owner reports;
reviewer identities are not invented. The final global source and delivery
reviews have completed. During delivery preparation the core review was
refreshed to **143 component + 21 emulator cases, none pending/inconclusive**
(the component figure was subsequently reduced to **141** by the StrictMode
consolidation described above; that consolidation removed two passing
duplicates and changed no review verdict).
Its errata K–N now record all eight expanded L02 hook reviews, direct verification
of the five nullish post-remount changes, the corrected L03 settled-identity
control, current clean T09 history failures and removal of the migrated emulator
T05 case. The previous inconclusive T09 run remains explicitly historical.

The browser report records distinct leaf reviewers for all three migrated
error-path cases; its older migration-pending prose is superseded by the final
manifest. K/H46 records six fresh and forty source/status-matched carried
reviews, not an invented historical byte-hash comparison. API69, rules95,
operations and N01 retain their own per-test maps.

**Final review status: complete.** The design was reviewed before implementation;
the multi-persona source review and strict re-reviews converged, and two delivery
review rounds reconciled the final evidence. No final-current case-audit gap remains
reported by the refreshed owners. The failure
index was mechanically reconciled to all **155 unique failed file/ID pairs**
(after the operations-lane consolidation described above removed 2 failed
cases whose gap evidence is preserved by a surviving sibling test),
with zero missing/extra rows and valid local Markdown links.

## Limits and unimplemented evidence

**U — unresolved policy:** collection/model naming, final coordinator
authentication, approved HQ cross-domain access, allowed AI data, shared-device
draft retention, historical question labels, duplicate-report amendment rules,
hierarchy repair and numerical resource/retention/performance policies remain
owner decisions. Current interoperability and default-filter failures do not
choose those policies.

**F — future runtime:** scheduled browser-independent recurrence, AI writes with
human approval, FCM, optional persistent offline mode and route splitting remain
explicit source-described gaps. Passing client recurrence/scaffold
characterizations do not implement them.

**M — deployment/manual:** Netlify routing/runtime/timeout behavior, deployed
rules/IAM/App Check, secret rotation, correlation logs/metrics (**F09**),
production recovery, model semantics/injection resistance, broader accessibility,
load/performance and measured coverage/mutation evidence are not established by
this local suite. No response-ID schema, exact error-object representation,
KeyboardSensor implementation, separate B01 type-filter button, or O03 dashboard
linked-task-title requirement is invented. No unmeasured budget or coverage
percentage is reported.

The protected HQChatPage Authorization span and old F07 header bytes were not
read or reconstructed. Exclusion is an evidence boundary, **not a defect**;
no exact-byte assertion about that content is made.

[AUTOMATION.md](AUTOMATION.md) proposes independent required commit/PR jobs,
sanitized always-uploaded evidence and exact-commit release checks. Workflows,
branch protection and deployment controls are **proposal only**, not enabled by
this delivery. Red acceptance cases must not be hidden with skips, expected
failures, retries or `continue-on-error`.

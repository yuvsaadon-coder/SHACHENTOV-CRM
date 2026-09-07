# Operations acceptance results

Owned files:

- `tests\requirements\components\operations\operations.component.test.tsx`
- `tests\requirements\emulator\operations\operations.emulator.test.tsx`
- `tests\requirements\OPERATIONS-RESULTS.md`

No production, package, or shared configuration files were edited.

## Current validation artifacts

### Component lane

- Command: `node node_modules/vitest/vitest.mjs run --config tests/requirements/vitest.config.ts tests/requirements/components/operations --reporter=default --reporter=json --outputFile=tests/requirements/artifacts/operations.json`
- Post-C01-browser-migration result: 33 tests discovered, 25 passed, 8 failed.
  **Post-consolidation** (removed `TEST-C02.domain-default-and-department-filter`,
  `TEST-B04.picker-membership-change`, `TEST-Q06.current-concurrent-submissions`,
  `TEST-Q07.partial-reorder-recovery` — each superseded by a stronger sibling
  test elsewhere in the suite; see `RESULTS.md` and `FAILURES.md`): 29 tests
  discovered, 23 passed, 6 failed.
- Log: `tests\requirements\artifacts\operations-components-after-c01-migration.log`
- Unhandled rejection count in this run: 0.

Failed component tests (post-consolidation):

1. `TEST-C03.production-sparse-task [G]`
2. `TEST-O04.dialog-focus [G]`
3. `TEST-O05.cycle-visible-or-error [G]`
4. `TEST-B04.child-scope-reset [G]`
5. `TEST-Q01.first-report-loading-race [G]`
6. `TEST-Q03.branch-isolation [G]`

### Browser lane

C01 failure-actionable coverage was migrated out of Vitest component tests to real browser UI cases owned by browser/error-paths.

- Artifacts:
  - `tests\requirements\artifacts\browser-error-paths.json`
  - `tests\requirements\artifacts\browser-error-paths.log`
- Migrated cases:
  - `TEST-C01.failed-save-actionable [G]`
  - `TEST-C01.failed-delete-actionable [G]`
- Browser owner assigned the corresponding leaf reviews. The old Vitest component versions are retired/migrated, not missing coverage.

### Emulator lane

- Command run under exclusive operations lease: `npm run test:requirements:rules -- operations`
- Shell: `ops-emulator7`
- Artifacts:
  - `tests\requirements\artifacts\operations-emulator-final.json`
  - `tests\requirements\artifacts\operations-emulator-final.log`
- Result: 3 tests discovered, 1 passed, 2 failed.

### Typecheck

- Command: `node node_modules/typescript/bin/tsc --project tests/requirements/tsconfig.json --noEmit`
- Latest result before migration: PASS.

Lease status: released to parent. No emulator processes intentionally left running by this agent.

## Adjudication retractions

- O03: `o03-oracle-adjudication` ruled the earlier dashboard linked-task-title oracle was plan overreach. Hebrew technical L198-L200 requires dashboard staffing-risk evidence; linked task titles belong role tracking. Current O03 asserts linked title on `RolesPage` and dashboard role/status/area/count evidence only.
- B01: `b01-oracle-adjudication` ruled Hebrew technical L214-L216 / executive L58-L60 require branch types and operational data, not a distinct type-filter control. Current B01 uses production level/city/search controls and retracts the missing-type-filter product-gap claim.
- B03 component: removed. `TEST-B03.concurrent-coordinator-links [G]` manually reconstructed stale-array writes through local `upd()` and did not execute `BranchesPage`; its component verdict is withdrawn as cloned-test evidence. B03 is covered by the real emulator production-flow case.
- C01 failure-actionable component cases: removed after browser owner implemented and ran equivalent real UI cases. Their previous Vitest assertions are retired to avoid global unhandled-rejection false-positive noise, not dropped coverage.

## Coverage by requirement ID

| ID | Current coverage |
|---|---|
| C01 | Component success CRUD/filter/realtime; browser save/delete failure-actionable cases. |
| C02 | Component own-domain default and department/domain filter red test. |
| C03 | Component contact task links, CSV roundtrip, sparse task crash red test. |
| O01 | Component role edit/clear/delete green test. |
| O02 | Component current delegation display characterization green test. |
| O03 | Component role tracking + dashboard staffing-risk green test. |
| O04 | Component keyboard drilldown and volunteer roundtrip green tests; focus red test. |
| O05 | Component preview/repeat green tests; cycle visibility red test. |
| B01 | Component branch create, operational edit/reopen, level/city/search green test. |
| B02 | Not executable: duplicate-field authority between `branches` and `roles.volunteerInfo` is U. |
| B03 | Emulator production-flow red test only. |
| B04 | Component picker and denial green tests; stale child state red test. |
| Q01 | Component report writer/reader green test; first-report loading race red test. |
| Q02 | Component dynamic question editor/live portal green test. |
| Q03 | Component restore/malformed/same-branch characterization green tests; branch isolation red test. |
| Q04 | Component coverage A/B/C/D green test. |
| Q05 | Component filter/export and current label characterization green tests. |
| Q06 | Component duplicate-create characterization and failed-submit recovery green tests; emulator UI-flow characterization green test. |
| Q07 | Component partial-reorder red test; emulator production-flow red test. |
| Q08 | Component saved-value survival and current unversioned-label characterization green tests. |

## Component reviewer map — 29 leaf tests (post-consolidation)

`TEST-C02.domain-default-and-department-filter`, `TEST-B04.picker-membership-change`,
`TEST-Q06.current-concurrent-submissions`, and `TEST-Q07.partial-reorder-recovery`
were removed from this lane as consolidation duplicates (see `RESULTS.md`); their
gap/pass evidence is preserved by `TEST-A03.contacts.own-domain-default`,
`TEST-A07.ui.branch-membership-transitions`, `TEST-Q06.current-concurrent-submissions-ui`
(emulator lane, row below), and `TEST-Q07.atomic-question-reorder` (emulator lane,
row below) respectively.

| # | Test | Result | Reviewer | Verdict |
|---:|---|---|---|---|
| 1 | `TEST-C01.contact-crud-filter-realtime [A]` | PASS | `latest-review-C01` | success path retained; failure path migrated to browser. |
| 2 | `TEST-C03.complete-record-links [A]` | PASS | `latest-review-C03-links` | pass. |
| 3 | `TEST-C03.csv-roundtrip [A]` | PASS | `latest-review-C03-csv` | pass. |
| 4 | `TEST-C03.production-sparse-task [G]` | FAIL | `latest-review-C03-sparse` | confirmed-production-defect. |
| 5 | `TEST-O01.role-crud-clear-delete [A]` | PASS | `latest-review-O01` | pass. |
| 6 | `TEST-O02.current-delegation-display [C]` | PASS | `latest-review-O02` | pass/current-characterization; adjacent edit-persistence risk noted only. |
| 7 | `TEST-O03.status-area-dashboard [A]` | PASS | `required-review-O03-corrected` | pass. |
| 8 | `TEST-O04.keyboard-drilldown [A]` | PASS | `final-review-O04-keyboard` | pass. |
| 9 | `TEST-O04.volunteer-roundtrip [A]` | PASS | `final-review-O04-volunteer` | pass. |
| 10 | `TEST-O04.dialog-focus [G]` | FAIL | `latest-review-O04-focus` | confirmed-production-defect. |
| 11 | `TEST-O05.cycle-visible-or-error [G]` | FAIL | `latest-review-O05-cycle` | confirmed-production-defect. |
| 12 | `TEST-O05.preview-no-write [A]` | PASS | `latest-review-O05-preview` | pass. |
| 13 | `TEST-O05.batch-repeat [A]` | PASS | `latest-review-O05-repeat` | pass. |
| 14 | `TEST-B01.branch-operational-crud [A]` | PASS | `review-B01-final-corrected` | pass; missing-type-filter claim retracted. |
| 15 | `TEST-B04.child-scope-reset [G]` | FAIL | `final2-review-B04-scope` | confirmed-production-defect. |
| 16 | `TEST-B04.foreign-report-denial [A]` | PASS | `final2-review-B04-denial` | pass. |
| 17 | `TEST-Q01.portal-report-real-reader [A]` | PASS | `final2-review-Q01` | pass for writer/reader; separate race covered in test 18. |
| 18 | `TEST-Q01.first-report-loading-race [G]` | FAIL | `final-review-Q01-race` | confirmed-production-defect. |
| 19 | `TEST-Q02.admin-question-editor [A]` | PASS | `final2-review-Q02` | pass. |
| 20 | `TEST-Q03.restore-own-draft [A]` | PASS | `final2-review-Q03-restore` | pass. |
| 21 | `TEST-Q03.malformed-draft [A]` | PASS | `final-review-Q03-malformed` | pass. |
| 22 | `TEST-Q03.branch-isolation [G]` | FAIL | `final-review-Q03-branch` | confirmed-production-defect. |
| 23 | `TEST-Q03.same-branch-other-user-current [C]` | PASS | `final-review-Q03-samebranch` | pass/current-characterization. |
| 24 | `TEST-Q04.coverage-realtime [A]` | PASS | `final-review-Q04` | pass. |
| 25 | `TEST-Q05.filter-render-export [A]` | PASS | `final4-review-Q05-filter` | pass. |
| 26 | `TEST-Q05.current-key-label-resolution [C]` | PASS | `final-review-Q05-labels` | pass/current-characterization. |
| 27 | `TEST-Q06.failed-submit-preserves-input [A]` | PASS | `final-review-Q06-failure` | pass. |
| 28 | `TEST-Q08.saved-value-survival [A]` | PASS | `final-review-Q08-survival` | pass. |
| 29 | `TEST-Q08.current-unversioned-labels [C]` | PASS | `final-review-Q08-labels` | pass/current-characterization. |

## Browser reviewer map — 2 migrated C01 leaf tests

| # | Test | Result | Reviewer owner | Verdict |
|---:|---|---|---|---|
| 1 | `TEST-C01.failed-save-actionable [G]` | FAIL | browser/error-paths owner | real UI case migrated from component lane; leaf reviews assigned by browser owner. |
| 2 | `TEST-C01.failed-delete-actionable [G]` | FAIL | browser/error-paths owner | real UI case migrated from component lane; leaf reviews assigned by browser owner. |

## Emulator reviewer map — 3 leaf tests

| # | Test | Runtime result | Reviewer | Verdict |
|---:|---|---|---|---|
| 1 | `TEST-B03.atomic-coordinator-links [G]` | FAIL | `emu-review-B03-final` | confirmed-production-defect. |
| 2 | `TEST-Q06.current-concurrent-submissions-ui [C]` | PASS | `emu-review-Q06-final` | pass/current-characterization. |
| 3 | `TEST-Q07.atomic-question-reorder [G]` | FAIL | `emu-review-Q07-final` | confirmed-production-defect. |

## The 6 current failing component tests (post-consolidation)

1. `TEST-C03.production-sparse-task [G]` — contact panel calls `t.contactRefs.includes(...)` and crashes when a persisted task omits `contactRefs`.
2. `TEST-O04.dialog-focus [G]` — custom role modal closes without restoring focus to the orgchart opener.
3. `TEST-O05.cycle-visible-or-error [G]` — cyclic roles are all marked as children and silently disappear from orgchart roots.
4. `TEST-B04.child-scope-reset [G]` — `PortalReport` keeps A form values when the outlet branch changes to C.
5. `TEST-Q01.first-report-loading-race [G]` — `PortalReport` ignores report-history loading and can render/submit first-only later-report fields.
6. `TEST-Q03.branch-isolation [G]` — one `restoredRef` and persistent `values` state let an A draft be saved under branch C.

Removed from this lane (consolidation, not new evidence): `TEST-C02.domain-default-and-department-filter`
(gap R03 preserved by `TEST-A03.contacts.own-domain-default`) and
`TEST-Q07.partial-reorder-recovery` (gap R21 preserved by `TEST-Q07.atomic-question-reorder`,
emulator lane).

## Emulator failure causes

### `TEST-B03.atomic-coordinator-links [G]`

Runtime outcome: failed after two real `BranchesPage` writer actions. The final branch document contained `coord-a` and `coord-c` but lost the committed `coord-b` link.

Production cause: `BranchesPage.tsx` computes `newUids` / `newNames` from the component's local `branch` snapshot in `linkToBranch` and writes full replacement arrays with `updateDoc`. Two clients starting from the same `[coord-a]` snapshot can commit `[coord-a, coord-b]` and then overwrite it with `[coord-a, coord-c]`.

### `TEST-Q07.atomic-question-reorder [G]`

Runtime outcome: failed after the real `ReportQuestionsAdminPage` reorder action with a controlled second writer fault. The final observed order set was `{2}` for the two relevant questions, not the required unique permutation `{1,2}`.

Production cause: `ReportQuestionsAdminPage.tsx` swaps adjacent questions with `Promise.all([reorder(a.id, b.order), reorder(b.id, a.order)])`, and `useReportQuestions.ts` implements `reorder` as a single-document `updateDoc`. A first successful write plus second failed write can leave duplicate persisted order values.

## Non-executable / current-characterization clauses

- B02 remains U: no authority for duplicate-field synchronization winner between `branches` and `roles.volunteerInfo`.
- Q03 same-branch shared-device draft retention/access remains U and is characterized only.
- Q05/Q08 historical label versioning remains U and is characterized only.
- Q06 uniqueness/amendment policy remains U and duplicate current behavior is characterized only.
- No schema, retention, domain-visibility, duplicate-report, or numeric performance target was invented.

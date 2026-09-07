# Rules and browser requirements results

## Implementation manifest — ready for parent execution

Source authority: `tests\requirements\TEST-PLAN.md` §4 S matrix lines 367–374, §6.1 registry lines 467–475 and 479; Hebrew requirements: `docs\requirements\technical-specification.he.md` §4–5 and §15, `docs\requirements\executive-summary.he.md` lines 73–92.

### Real Security Rules emulator tests

| Planned ID | Test name/pattern | Expected result |
|---|---|---|
| TEST-S01.anonymous.{resource}.{crud,list} | `anonymous and invalid-profile Security Rules > TEST-S01.anonymous.%s.crud/list denies anonymous with positive controls` | A: anonymous denied on each resource/operation after authorized controls. |
| TEST-S01.no-profile-read.{branches,knowledgeItems,knowledge_articles,reportQuestions} | `TEST-S01.no-profile-read.%s denies app-data reads...` | G: no-profile authenticated identities must be denied; current broad authenticated reads may fail red. |
| TEST-S01.missing-role-read.{branches,knowledgeItems,knowledge_articles,reportQuestions} | `TEST-S01.missing-role-read.%s denies app-data reads...` | G: missing-role profiles must be denied; current broad authenticated reads may fail red. |
| TEST-S02.valid-hq.{admin,CEO,JLM,SUP,FIN,DON,DES,PUB,VOL} | `TEST-S02.valid-hq.%s permits base CRM reads and writes` | A: every HQ/admin role can read/write base CRM resources. |
| TEST-S02.cross-domain-current.{CEO,JLM,SUP,FIN,DON,DES,PUB,VOL} | `TEST-S02.cross-domain-current.%s characterizes current cross-domain task read` | C: characterize current broad cross-domain access; no denial invented. |
| TEST-S03.* | `coordinator branch and knowledge boundaries` tests | G: own controls pass; foreign branch/knowledge and A→B mutation must deny, likely red under current broad rules. |
| TEST-S04.* | `quarterly report boundaries` tests | A: own create/read and admin update/delete pass; forged/foreign/coordinator update/delete deny. |
| TEST-S05.admin-only-write.{users,branches,reportQuestions,hq_knowledge,knowledge_articles} | `TEST-S05.admin-only-write.%s permits admin and denies non-admin HQ` | A: admin create/update/delete controls pass, non-admin HQ create/update/delete deny. |
| TEST-S06.positive.{hq_knowledge,knowledge_articles} | `TEST-S06.positive.%s permits authenticated exact-prefix upload/read` | A: exact Storage rule prefixes work. |
| TEST-S06.anonymous.{hq_knowledge,knowledge_articles} | `TEST-S06.anonymous.%s denies anonymous access after positive control` | A: anonymous Storage denied. |
| TEST-S06.foreign-overwrite.{hq_knowledge,knowledge_articles} | `TEST-S06.foreign-overwrite.%s denies unrelated coordinator overwrite` | G: unrelated coordinator overwrite denied; likely red because current Storage allows any authenticated write. |
| TEST-S06.foreign-delete.{hq_knowledge,knowledge_articles} | `TEST-S06.foreign-delete.%s denies unrelated coordinator delete` | G: unrelated coordinator delete denied; likely red because current Storage allows any authenticated write. |
| TEST-S07.owner-only.{personalTasks,chatSessions} | `TEST-S07.owner-only.%s allows owner and denies other users including admin` | A: private subcollections are owner-only, including admin denial. |
| TEST-S07.foreign-list.{other-hq,admin,coordinator}.{personalTasks,chatSessions} | `TEST-S07.foreign-list.%s.%s denies foreign authenticated list` | A: owner list positive control passes; other HQ/admin/coordinator list deny without query filters. |
| TEST-S07.foreign-update.{other-hq,admin,coordinator}.{personalTasks,chatSessions} | `TEST-S07.foreign-update.%s.%s denies foreign authenticated update` | A: owner update positive control passes; other HQ/admin/coordinator update deny. |
| TEST-S07.foreign-delete.{other-hq,admin,coordinator}.{personalTasks,chatSessions} | `TEST-S07.foreign-delete.%s.%s denies foreign authenticated delete` | A: owner delete positive control passes; other HQ/admin/coordinator delete deny. |
| TEST-S08.self-role-escalation | `TEST-S08.self-role-escalation denies own users document self-promotion` | A: own user document cannot self-promote. |
| TEST-S08.forged-report-owner | `TEST-S08.forged-report-owner denies mismatched submittedBy body` | A: forged report owner denied. |
| TEST-S08.current-authorized-body-validation | `TEST-S08.current-authorized-body-validation characterizes current authorized malformed task body` | C: current malformed authorized task write is characterized, not converted into schema policy. |

### Actual Playwright browser independent journeys

| Planned ID | Test name | Expected result |
|---|---|---|
| TEST-E01.task-create-reader | creates an HQ task and reads it from the actual task list | G: real App create→reader journey should work. |
| TEST-E01.contact-link-controls | shows independently seeded task/contact link controls | G: linked contact UI visible from actual task detail. |
| TEST-E01.private-task-and-logout | protects private task deep links after logout | A: private fixture visible to owner, protected route returns login after logout. |
| TEST-E02.branch-link | seeded coordinator branch link reaches portal home | A: branch membership is visible in portal. |
| TEST-E02.question-to-form | admin question appears in actual portal report form | A: seeded report question renders in form. |
| TEST-E02.role-drilldown | opens seeded role and preserves edited holder after reopen | A: role edit/reopen round trip. |
| TEST-E02.shared-knowledge-reader | shared HQ item reaches portal knowledge filtering | G: shared HQ knowledge reaches portal reader. |
| TEST-E03.login-and-selection | uses exact coordinator UID and branch picker selection | A: coordinator UID sees two memberships and selected branch. |
| TEST-E03.report-to-coverage | submits portal report and observes HQ coverage | A: one known seeded branch moves from missing to reported for the submitted quarter/year, and raw report value appears in HQ reports. |
| TEST-E03.shared-knowledge | production-written mirror item is visible in portal | G: production portal writer creates global mirror visible to reader. |
| TEST-E03.branch-chat-context | sends actual portal chat request and renders deterministic reply | A: browser calls local handler boundary and renders reply. |
| TEST-E03.foreign-chat-denial | demonstrates authorized branch positive control before foreign denial | A: positive chat control then foreign branch denial through local handler adapter. |
| TEST-E04.task-detail-live | updates an open task detail from another client | G: realtime detail update visible. |
| TEST-E04.contact-reconnect | observes contact updates after page reconnect | A: reload/reconnect shows updated contact. |
| TEST-E04.report-reconnect | observes report updates after page reconnect | A: reload/reconnect shows updated report data. |
| TEST-E04.identity-transition | separates HQ and coordinator surfaces in one browser | G: logout/login role transition reaches correct surfaces. |
| TEST-N05.orgcard-keyboard | opens org card details with keyboard activation | A: keyboard can open actual org card detail. |
| TEST-N05.kanban-keyboard | changes native Kanban status select with keyboard | A: native browser keyboard operation changes a `בעבודה` task to `בוצע` and persists Firestore status. |
| TEST-N05.actual-dialog-focus | focuses first control in real contact dialog | G: actual custom contact dialog opens with focus on its first field. |
| TEST-N05.dialog-tab-wrap | keeps focus inside real contact dialog | G: Tab and Shift+Tab wrap inside the actual ContactsPage custom modal. |
| TEST-N05.dialog-escape-close | closes real contact dialog with Escape | A: Escape closes the actual ContactsPage custom modal. |
| TEST-N05.rtl-critical-controls | keeps core pages and portal forms RTL | A: critical HQ/portal surfaces expose RTL containers. |
| TEST-T05.pointer-move | moves a Kanban card with real pointer drag | A: real dnd-kit pointer drag moves `בעבודה` task to `בוצע` and persists status. |
| TEST-T05.cancelled-drop | keeps Kanban status after a real cancelled drag | A: real drag cancellation does not change Firestore status or UI column. |
| TEST-T05.same-column-drop | keeps Kanban status after dropping on the current column | A: real same-column drop remains a no-op in Firestore/UI. |

## Independent reviewer tracking

Browser initial execution (`tests\requirements\artifacts\browser-initial.json`) produced 20 tests / 7 pass / 13 fail, but those results are not stable product evidence. Fixed harness/test defects before rerun:

- Actual Netlify handler adapter remains the only local function implementation; Anthropic is the only stubbed transport.
- Browser cleanup now removes run-owned Firestore/Auth fixtures after each test, including failure paths.
- Functional journeys no longer depend on unlabeled-form a11y selectors; N05 remains responsible for dialog/focus evidence.
- Strict duplicate-text assertions are scoped to `main`/report-card buttons.
- Foreign chat denial now uses the connected browser Firebase token helper and a foreign branch owned by another coordinator.

Final browser execution before the T05 Kanban expansion: `npm run test:requirements:browser` completed with clean emulator shutdown, 20 tests / 15 pass / 5 fail / exit 1. The remaining failing cases are reviewed as product gaps, not harness failures:

- `TEST-E01.contact-link-controls`
- `TEST-E02.shared-knowledge-reader`
- `TEST-E03.shared-knowledge`
- `TEST-E04.task-detail-live`
- `TEST-N05.actual-dialog-focus`

Frozen combined browser execution before the E04/N05 accessibility corrections: `npm run test:requirements:browser` completed with clean emulator shutdown, 50 tests / 28 pass / 22 fail / exit 1. The normal wrapper included the original 23 cases plus 27 K/H cases.

Latest runtime checkpoint:

- Rules: `npm run test:requirements:rules -- rules` wrote `tests\requirements\artifacts\rules-final.json` and `tests\requirements\artifacts\rules-final.log`; 95 tests / 80 pass / 15 fail / exit 1. Emulators shut down cleanly.
- Browser: `npm run test:requirements:browser` wrote `tests\requirements\artifacts\browser-final.json` and `tests\requirements\artifacts\browser-final.log`; 55 tests / 29 pass / 26 fail / exit 1. Emulators shut down cleanly.
- Browser owned subset: 25 tests / 18 pass / 7 fail. Fresh leaf reviews are complete for changed/new base browser cases: `TEST-E04.contact-reconnect`, `TEST-E04.report-reconnect`, `TEST-N05.actual-dialog-focus`, `TEST-N05.dialog-tab-wrap`, `TEST-N05.dialog-escape-close`. Rules95 review is owned by coordinator `14f10d3b`; K/H30 review is owned by `8a9f58c2`.

Pending error-path migration:

- Added `tests\requirements\browser\error-paths.spec.ts` with browser-lane replacements for Vitest global-unhandled-rejection cases. No existing browser/rules/K/H source files were changed for this migration.
- Stable IDs: `TEST-C01.failed-save-actionable.browser`, `TEST-C01.failed-delete-actionable.browser`, `TEST-T05.failed-write-observable.browser`.
- These should replace, not double-count with, the corresponding migrated Vitest cases once parent removes/retargets them.
- Runtime checkpoint: targeted browser run wrote `tests\requirements\artifacts\browser-error-paths.json` and `tests\requirements\artifacts\browser-error-paths.log`; 3 tests / 0 pass / 3 fail / exit 1 with clean emulator shutdown and no port listeners afterward.

| Migrated browser case | Actual result | Runtime status / observed causal evidence |
|---|---:|---|
| TEST-C01.failed-save-actionable.browser | fail | `leaf-review-c01-save-browser`: valid product failure. Positive edit write succeeded first; injected real Firestore `FAILED_PRECONDITION` was observed in `browser-error-paths.log`; admin readback/failing modal state show the attempted value was preserved, but ContactsPage rendered no Hebrew failure/retry message. Page errors are diagnostic attachment only, not a prerequisite. |
| TEST-C01.failed-delete-actionable.browser | fail | `leaf-review-c01-delete-browser`: valid product failure. Positive delete control succeeded first; server role revocation after cached HQ view caused real rules `PERMISSION_DENIED` on target delete; admin readback confirmed the contact remained, but the real edit modal showed no visible failure/retry message. |
| TEST-T05.failed-write-observable.browser | fail | `leaf-review-t05-failed-browser`: valid product failure. Valid HQ Kanban mounted and positive native-select status write persisted first; server profile revocation to coordinator made the second native select write deny under real rules; admin readback stayed `בעבודה`, but TasksPage/Kanban showed no user-visible failure message. |

## Browser reviewer tracking

| Test ID | Final result | Independent reviewer | Verdict validity / checked assertion path |
|---|---:|---|---|
| TEST-E01.task-create-reader | pass | `browser-review-e01-task-final` | Valid: real `/tasks/new` save, `TASK-*` navigation, then task-list link reader. |
| TEST-E01.contact-link-controls | fail | `browser-review-e01-contact` | Valid failure: seeded `contactRefs[]` never renders on task detail. |
| TEST-E01.private-task-and-logout | pass | `browser-review-e01-private` | Valid: owner private task appears, logout then `/my-tasks` redirects to `/login`. |
| TEST-E02.branch-link | pass | `browser-review-e02-branch` | Valid: coordinator-linked branch reaches portal; assertion scoped to `main`. |
| TEST-E02.question-to-form | pass | `browser-review-e02-question` | Valid: seeded `reportQuestions` doc renders in real portal report form. |
| TEST-E02.role-drilldown | pass | `browser-review-e02-role` | Valid: role row edit opens modal, saves holder, reopens with persisted value. |
| TEST-E02.shared-knowledge-reader | fail | `browser-review-e02-shared-final` | Valid failure: HQ share write fails before item appears. |
| TEST-E03.login-and-selection | pass | `browser-review-e03-selection` | Valid: real `portal-login` handler issues token for exact UID; branch picker selects B. |
| TEST-E03.report-to-coverage | pass | `browser-review-e03-report`; `leaf-review-e03-report-final` | Valid: pre-submit coverage shows the known fixture branch missing, post-submit coverage shows the same branch reported for the exact submitted quarter/year, then the HQ report card opens and shows the raw answer. |
| TEST-E03.shared-knowledge | fail | `browser-review-e03-shared` | Valid failure: portal global knowledge write fails before modal closes/item appears. |
| TEST-E03.branch-chat-context | pass | `browser-review-e03-chat` | Valid: real chat handler path executes; only Anthropic HTTP is stubbed. |
| TEST-E03.foreign-chat-denial | pass | `browser-review-e03-foreign` | Valid: browser obtains real current ID token; own branch 200, other coordinator branch 403. |
| TEST-E04.task-detail-live | fail | `browser-review-e04-task-final` | Valid failure: anti-race hidden check then admin update never reaches open detail. |
| TEST-E04.contact-reconnect | pass | `browser-review-e04-contact-final`; `leaf-current-e04-contact-live` | Valid: online admin update appears while page remains mounted; then browser Firestore network disable/enable converges after an offline admin update, without reload. |
| TEST-E04.report-reconnect | pass | `browser-review-e04-report`; `leaf-current-e04-report-live` | Valid: open report card updates while mounted; then browser Firestore network disable/enable converges after an offline admin update, without reload. |
| TEST-E04.identity-transition | pass | `browser-review-e04-identity` | Valid: HQ logout then coordinator login shows portal branch, no stale HQ surface. |
| TEST-N05.orgcard-keyboard | pass | `browser-review-n05-org-final` | Valid: focuses actual `role=button` org card, Enter opens edit modal and holder field. |
| TEST-N05.kanban-keyboard | pass | `browser-review-n05-kanban`; `leaf-review-n05-kanban-final` | Valid: focus native select in real Kanban card, use browser keyboard to change `בעבודה` to `בוצע`, then assert Firestore and UI status. |
| TEST-N05.actual-dialog-focus | fail | `browser-review-n05-focus`; `leaf-current-n05-initial-focus` | Valid failure: current oracle is initial focus only; contact modal first input resolves but is not focused. |
| TEST-N05.rtl-critical-controls | pass | `browser-review-n05-rtl` | Valid: HQ and portal surfaces expose RTL containers after isolated role transition. |
| TEST-T05.pointer-move | pass | `leaf-review-t05-pointer` | Valid: real pointer drag across dnd-kit columns persists status once. |
| TEST-T05.cancelled-drop | pass | `leaf-review-t05-cancel` | Valid: real cancelled drag keeps status unchanged in Firestore/UI. |
| TEST-T05.same-column-drop | pass | `leaf-review-t05-same` | Valid: real same-column drop keeps status unchanged in Firestore/UI. |
| TEST-N05.dialog-tab-wrap | fail | `leaf-current-n05-tab-trap` | Valid failure: actual ContactsPage custom modal does not wrap Shift+Tab/Tab focus between first field and last button. |
| TEST-N05.dialog-escape-close | fail | `leaf-current-n05-escape` | Valid failure: actual ContactsPage custom modal remains visible after Escape. |

## K/H browser reviewer tracking

Informational only for coordination. The K/H 30 authoritative oracle/report, including any K05/K07 corrections by the new actor, is owned by the K/H feature report owner; this table must not be treated as the final K/H disposition source or accepted final disposition.

| Test ID | Final result | Independent reviewer | Verdict validity / checked assertion path |
|---|---:|---|---|
| TEST-H02.branch-switch-no-session-mixing | fail | `leaf-review-h02-mixing` | Valid failure: delayed branch-A reply remains visible after switching to branch B. |
| TEST-H07.save-failure-visible | fail | `leaf-review-h07-save-failure` | Valid failure: injected save precondition error leaves no visible Hebrew save-failure message. |
| TEST-H06.challenge-content | fail | `leaf-review-h06-challenge` | Valid failure: actual HQ handler provider prompt omits portal-written challenge content. |
| TEST-H06.year-disambiguation | fail | `leaf-review-h06-year` | Valid failure: provider prompt omits Q3/2025 and Q3/2026 facts/year sentinels. |
| TEST-H06.missing-roster-context | fail | `leaf-review-h06-roster` | Valid failure: handler does not compute/include missing branch roster context. |
| TEST-H06.branch-analysis-context | pass | `leaf-review-h06-branch-analysis` | Valid: actual BranchReportsModal/handler path passes report facts to provider context. |
| TEST-H06.reply-rendering | pass | `leaf-review-h06-reply` | Valid: deterministic actual-handler reply is rendered; no semantic grounding overclaim. |
| TEST-K01.explicit-filters-and-edit | pass | `leaf-review-k01-explicit` | Valid: explicit domain/tag/visibility filtering and update path matched UI/data assertions. |
| TEST-K01.domain-default | fail | `leaf-review-k01-default` | Valid failure: HQ knowledge defaults to all domains, so FIN sees VOL-only item. |
| TEST-K02.local-create-with-sparse-fields | fail | `leaf-review-k02-sparse` | Valid failure: portal local writer sends undefined optional fields to Firestore. |
| TEST-K02.local-create-valid-nonempty-checklist | pass | `leaf-review-k02-valid-checklist` | Valid: nonempty checklist path persists and renders expected items. |
| TEST-K02.local-create-document-modal | fail | `leaf-review-k02-document-modal` | Valid failure: document modal save hits same undefined optional field write bug. |
| TEST-K02.local-create-checklist-modal | fail | `leaf-review-k02-checklist-modal` | Valid failure: checklist modal save hits same undefined optional field write bug. |
| TEST-K03.hq-storage-success | pass | `leaf-review-k03-hq-storage` | Valid: HQ upload uses real Storage path and downloaded bytes/metadata are asserted. |
| TEST-K03.local-storage-contract | fail | `leaf-review-k03-local-storage` | Valid failure: portal local file producer stores DataURL/Firestore value, not Storage object contract. |
| TEST-K03.partial-upload-recovery | fail | `leaf-review-k03-partial` | Valid failure: partial write fault leaves inconsistent source/storage/mirror state. |
| TEST-K03.current-size-boundaries | pass | `leaf-review-k03-size` | Valid C: UI size boundary characterized only; no persistence overclaim. |
| TEST-K04.produced-mirror-tag-filter | fail | `leaf-review-k04-mirror-tag` | Valid failure: HQ coordinator mirror omits tags needed by portal tag filtering. |
| TEST-K04.unshare-current-retrieval | pass | `leaf-review-k04-unshare` | Valid: current unshare retrieval behavior matched the asserted case. |
| TEST-K04.delete-current-retrieval | fail | `leaf-review-k04-delete` | Valid failure: deleting HQ source leaves `knowledgeItems/hq-*` mirror present. |
| TEST-K04.old-bearer-url-current | pass | `leaf-review-k04-bearer` | Valid C: only characterizes current bearer URL behavior; no revocation claim. |
| TEST-K05.mirror-write-failure-recovery | fail | `leaf-review-k05-mirror` | Valid failure: HQ source update and mirror write are non-atomic/no recovery. |
| TEST-K06.research-item-reaches-open-library | fail | `leaf-review-k06-research` | Valid failure: open library reads static catalog, not admin-created research items. |
| TEST-K07.research-write-roundtrip | pass | `leaf-review-k07-roundtrip` | Valid: admin research source/mirror/storage round trip passed. |
| TEST-K07.second-write-failure | fail | `leaf-review-k07-second-failure` | Valid failure: injected second write leaves source/mirror count mismatch. |
| TEST-K08.current-title-only-request | pass | `leaf-review-k08-title` | Valid C: summarizes actual title-only provider request. |
| TEST-K08.document-content-grounding | fail | `leaf-review-k08-grounding` | Valid failure: summarize handler sends title only, not document content/bytes. |

## Failure explanations

### TEST-E01.contact-link-controls — task detail does not render linked contacts

- **Requirement:** The Hebrew data model says `tasks/{id}` carries `contactRefs[]` and `contacts/{id}` are linked through those refs ([technical-specification.he.md#L80](..\..\docs\requirements\technical-specification.he.md#L80)-[L81](..\..\docs\requirements\technical-specification.he.md#L81)); the executive flow explicitly says contacts can be linked to tasks ([executive-summary.he.md#L85](..\..\docs\requirements\executive-summary.he.md#L85)). Registry §6.1 requires `TEST-E01.contact-link-controls` as an independent task/contact link UI journey ([TEST-PLAN.md#L472](TEST-PLAN.md#L472)).
- **Test evidence:** The test seeds a contact with a unique visible name ([e01-e04-n05.spec.ts#L113](browser\e01-e04-n05.spec.ts#L113)-[L119](browser\e01-e04-n05.spec.ts#L119)), seeds a task whose `contactRefs` contains that contact id ([e01-e04-n05.spec.ts#L120](browser\e01-e04-n05.spec.ts#L120)-[L123](browser\e01-e04-n05.spec.ts#L123)), opens the real task detail route ([e01-e04-n05.spec.ts#L125](browser\e01-e04-n05.spec.ts#L125)), and asserts the contact name is visible ([e01-e04-n05.spec.ts#L127](browser\e01-e04-n05.spec.ts#L127)).
- **Observed output:** Playwright failed with `Locator: getByText('E01 איש קשר ...-linked-contact')`, `Expected: visible`, `Error: element(s) not found` ([browser.json#L143](artifacts\browser.json#L143)-[L159](artifacts\browser.json#L159)).
- **Causal path:** `TaskDetailPage` reads the task document once with `getDoc` ([TaskDetailPage.tsx#L67](..\..\src\pages\TaskDetailPage.tsx#L67)-[L71](..\..\src\pages\TaskDetailPage.tsx#L71)) and retains `contactRefs` in new/subtask defaults ([TaskDetailPage.tsx#L63](..\..\src\pages\TaskDetailPage.tsx#L63), [TaskDetailPage.tsx#L230](..\..\src\pages\TaskDetailPage.tsx#L230)), but the visible detail fields render category, involved, frequency, dates, activator, steps and notes, not contacts ([TaskDetailPage.tsx#L520](..\..\src\pages\TaskDetailPage.tsx#L520)-[L526](..\..\src\pages\TaskDetailPage.tsx#L526)). There is no contact lookup/render path in `TaskDetailPage`.
- **Why harness causes are excluded:** Auth and routing succeeded because the seeded HQ user reached `/tasks/{taskId}` and the test waited on the real page before the assertion. The selector is just the unique seeded contact name; it cannot be a duplicate/strict-mode issue. The fixture is correct because the task document contains `contactRefs: [contactId]` before navigation. The environment is excluded because other Firestore-backed task create/read cases passed in the same final run.

### TEST-E02.shared-knowledge-reader — HQ shared item write fails before coordinator mirror

- **Requirement:** The Hebrew model defines `hq_knowledge/{id}` with `fileUrl` and `visibleToCoordinators` ([technical-specification.he.md#L84](..\..\docs\requirements\technical-specification.he.md#L84)) and the portal has `/portal/knowledge` ([technical-specification.he.md#L184](..\..\docs\requirements\technical-specification.he.md#L184)-[L190](..\..\docs\requirements\technical-specification.he.md#L190)). Executive requirements require searchable/filterable knowledge ([executive-summary.he.md#L73](..\..\docs\requirements\executive-summary.he.md#L73)). Registry §6.1 requires `TEST-E02.shared-knowledge-reader`: production-created/shared HQ item reaches portal filtering ([TEST-PLAN.md#L473](TEST-PLAN.md#L473)).
- **Test evidence:** The test logs in as admin, opens `/hq-knowledge`, fills the real "הוסף פריט ידע למטה" modal, enables "שתף עם רכזים", saves, then expects the new title to appear before coordinator login ([e01-e04-n05.spec.ts#L225](browser\e01-e04-n05.spec.ts#L225)-[L234](browser\e01-e04-n05.spec.ts#L234)).
- **Observed output:** Playwright did not find the newly-created title after save ([browser.json#L357](artifacts\browser.json#L357)-[L373](artifacts\browser.json#L373)). The run output also recorded the actual client error: `FirebaseError: Function addDoc() called with invalid data. Unsupported field value: undefined (found in field fileUrl in document hq_knowledge/...)`.
- **Causal path:** `HQKnowledgePage` builds an add payload with `fileUrl: existingFileUrl`, where `existingFileUrl` is `undefined` for a new item with no file ([HQKnowledgePage.tsx#L167](..\..\src\pages\HQKnowledgePage.tsx#L167)-[L175](..\..\src\pages\HQKnowledgePage.tsx#L175)). `useAddHQKnowledge` destructures only `file`/`visibleToCoordinators` and spreads the remaining `rest` directly into `addDoc` ([useHQKnowledge.ts#L75](..\..\src\hooks\useHQKnowledge.ts#L75)-[L78](..\..\src\hooks\useHQKnowledge.ts#L78)), so Firestore rejects the explicit `fileUrl: undefined` field before the coordinator mirror can be created ([useHQKnowledge.ts#L89](..\..\src\hooks\useHQKnowledge.ts#L89)-[L90](..\..\src\hooks\useHQKnowledge.ts#L90)).
- **Why harness causes are excluded:** This is not a selector issue: the save path throws before the title exists. It is not an auth issue: the admin reached the real HQ modal and clicked its real save button. It is not a fixture issue: the journey intentionally covers "shared without file", a normal UI state. It is not an environment issue: the actual Firestore client error names an invalid write payload field, not connectivity or rules denial.

### TEST-E03.shared-knowledge — portal global knowledge writer fails on optional undefined fields

- **Requirement:** The Hebrew model requires `knowledgeItems/{id}` for branch/general knowledge ([technical-specification.he.md#L85](..\..\docs\requirements\technical-specification.he.md#L85)), `/portal/knowledge` is a required portal route ([technical-specification.he.md#L184](..\..\docs\requirements\technical-specification.he.md#L184)-[L190](..\..\docs\requirements\technical-specification.he.md#L190)), and knowledge must be searchable/filterable ([executive-summary.he.md#L73](..\..\docs\requirements\executive-summary.he.md#L73)). Registry §6.1 requires `TEST-E03.shared-knowledge`: a separate production-written mirror/global scenario ([TEST-PLAN.md#L474](TEST-PLAN.md#L474)).
- **Test evidence:** The test logs in as coordinator, opens the real portal add-knowledge modal, chooses "מסמך", fills title/content, selects "🌐 כלל-ארגוני", saves, expects the modal to close, then opens the org tab and expects the title ([e01-e04-n05.spec.ts#L303](browser\e01-e04-n05.spec.ts#L303)-[L320](browser\e01-e04-n05.spec.ts#L320)).
- **Observed output:** The modal remained visible after save (`Expected: hidden`, `Received: visible`) ([browser.json#L503](artifacts\browser.json#L503)-[L519](artifacts\browser.json#L519)). The run output recorded the actual write error: `FirebaseError: Function addDoc() called with invalid data. Unsupported field value: undefined (found in field url in document knowledgeItems/...)`.
- **Causal path:** `PortalKnowledge` passes `url: type === 'link' ? url.trim() || undefined : undefined` for non-link items and also passes other optional fields such as `checklistItems` as `undefined` when not applicable ([PortalKnowledge.tsx#L280](..\..\src\pages\portal\PortalKnowledge.tsx#L280)-[L284](..\..\src\pages\portal\PortalKnowledge.tsx#L284)). `useAddKnowledge` spreads the complete `data` object into `addDoc` ([useKnowledge.ts#L52](..\..\src\hooks\useKnowledge.ts#L52)-[L54](..\..\src\hooks\useKnowledge.ts#L54)); Firestore rejects explicit undefined fields. Because `onClose()` is only called after `addItem` resolves ([PortalKnowledge.tsx#L287](..\..\src\pages\portal\PortalKnowledge.tsx#L287)), the modal stays open and the item never appears.
- **Why harness causes are excluded:** The failure happens after the real modal is found, filled and submitted, so selectors and authentication already worked. It is the same optional-undefined payload class as `TEST-E02.shared-knowledge-reader`, but on the coordinator `knowledgeItems` writer, so both IDs are retained. Environment is excluded by the precise Firestore validation error for `url`; the adapter/network is not involved in this direct Firestore write.

### TEST-E04.task-detail-live — open task detail has no live subscription for task document fields

- **Requirement:** The Hebrew technical spec lists `useTasks` and requires correct subscription management ([technical-specification.he.md#L110](..\..\docs\requirements\technical-specification.he.md#L110)-[L116](..\..\docs\requirements\technical-specification.he.md#L116)). Registry §6.1 requires `TEST-E04.task-detail-live` as an independent browser transition ([TEST-PLAN.md#L475](TEST-PLAN.md#L475)).
- **Test evidence:** The test opens a task detail page, verifies the future value is initially hidden, waits to avoid a load/update race, performs a separate admin-side update of `tasks/{taskId}.notes`, and expects the open browser page to show `E04 עדכון חי` ([e01-e04-n05.spec.ts#L395](browser\e01-e04-n05.spec.ts#L395)-[L407](browser\e01-e04-n05.spec.ts#L407)).
- **Observed output:** The updated note was not found: `Locator: getByText('E04 עדכון חי')`, `Expected: visible`, `Error: element(s) not found` (frozen final run in `tests\requirements\artifacts\browser-final.json`).
- **Causal path:** The main task document is loaded via one-shot `getDoc` ([TaskDetailPage.tsx#L67](..\..\src\pages\TaskDetailPage.tsx#L67)-[L71](..\..\src\pages\TaskDetailPage.tsx#L71)). `onSnapshot` is present for subtasks and subcollections only ([TaskDetailPage.tsx#L80](..\..\src\pages\TaskDetailPage.tsx#L80)-[L86](..\..\src\pages\TaskDetailPage.tsx#L86), [TaskDetailPage.tsx#L107](..\..\src\pages\TaskDetailPage.tsx#L107)-[L113](..\..\src\pages\TaskDetailPage.tsx#L113)). The notes field would render if `task.notes` changed ([TaskDetailPage.tsx#L523](..\..\src\pages\TaskDetailPage.tsx#L523)-[L526](..\..\src\pages\TaskDetailPage.tsx#L526)), but no listener updates `task` after the admin write.
- **Why harness causes are excluded:** The test deliberately proves it is not a timing false-positive by asserting the note is hidden before the admin update ([e01-e04-n05.spec.ts#L404](browser\e01-e04-n05.spec.ts#L404)) and delaying before the update ([e01-e04-n05.spec.ts#L405](browser\e01-e04-n05.spec.ts#L405)). Auth, routing, and the initial task load all succeeded because the title was visible before the update. The failure exactly matches the source: no realtime listener on `tasks/{id}`.

### TEST-N05.actual-dialog-focus — contact modal opens without moving focus into the dialog

- **Requirement:** The Hebrew production target explicitly includes accessibility tests ([technical-specification.he.md#L292](..\..\docs\requirements\technical-specification.he.md#L292)), and registry §6.1 requires `TEST-N05.actual-dialog-focus` as a real actual-dialog focus case ([TEST-PLAN.md#L479](TEST-PLAN.md#L479)).
- **Test evidence:** The test opens the real contacts page, clicks "+ הוסף איש קשר", verifies the dialog heading is visible, then asserts the first real input inside that dialog is focused ([e01-e04-n05.spec.ts#L655](browser\e01-e04-n05.spec.ts#L655)-[L662](browser\e01-e04-n05.spec.ts#L662)).
- **Observed output:** The locator resolved to the input but it was not focused: `Expected: focused`, `Received: inactive` ([browser-final.json#L982](artifacts\browser-final.json#L982)-[L1046](artifacts\browser-final.json#L1046)).
- **Causal path:** The add-contact modal is rendered when opened ([ContactsPage.tsx#L172](..\..\src\pages\ContactsPage.tsx#L172)-[L183](..\..\src\pages\ContactsPage.tsx#L183)), and its first "שם *" input is a plain input without `autoFocus` or a ref-driven focus call ([ContactsPage.tsx#L62](..\..\src\pages\ContactsPage.tsx#L62)-[L65](..\..\src\pages\ContactsPage.tsx#L65)). No focus management is present around modal open.
- **Why harness causes are excluded:** This is not the earlier missing-label problem: the test now scopes to `modal(...).locator('input').first()` and Playwright reports that exact input resolves but is inactive. It is not auth/routing/environment because the heading is visible before the focus assertion. It is not a selector issue because the assertion found the intended input and failed only on focus state.

### TEST-N05.dialog-tab-wrap — contact modal does not trap Tab/Shift+Tab focus

- **Requirement:** The Hebrew production target requires accessibility testing ([technical-specification.he.md#L292](..\..\docs\requirements\technical-specification.he.md#L292)); registry §6.1 requires actual dialog focus evidence under N05 without claiming an unapproved WCAG level ([TEST-PLAN.md#L479](TEST-PLAN.md#L479)).
- **Test evidence:** The test opens the real ContactsPage custom modal, focuses the first input, presses `Shift+Tab`, expects focus to wrap to the last `ביטול` button, presses `Tab`, and expects focus to return to the first input ([e01-e04-n05.spec.ts#L668](browser\e01-e04-n05.spec.ts#L668)-[L684](browser\e01-e04-n05.spec.ts#L684)).
- **Observed output:** The `ביטול` button resolved but was not focused after `Shift+Tab`: `Expected: focused`, `Received: inactive` ([browser-final.json#L1056](artifacts\browser-final.json#L1056)-[L1132](artifacts\browser-final.json#L1132)).
- **Causal path:** ContactsPage renders a custom overlay and dialog with click-to-close only ([ContactsPage.tsx#L172](..\..\src\pages\ContactsPage.tsx#L172)-[L183](..\..\src\pages\ContactsPage.tsx#L183)); the first input is a normal input ([ContactsPage.tsx#L62](..\..\src\pages\ContactsPage.tsx#L62)-[L65](..\..\src\pages\ContactsPage.tsx#L65)) and the last cancel button is a normal button ([ContactsPage.tsx#L188](..\..\src\pages\ContactsPage.tsx#L188)). No focus trap or Tab/Shift+Tab handler exists, so focus can leave the dialog instead of wrapping.
- **Why harness causes are excluded:** The test proves the prerequisite by explicitly focusing the first input and asserting it is focused before `Shift+Tab` ([e01-e04-n05.spec.ts#L678](browser\e01-e04-n05.spec.ts#L678)-[L679](browser\e01-e04-n05.spec.ts#L679)). The failing locator resolves to the intended `ביטול` button, so this is not selector ambiguity. Auth/routing succeeded because the modal heading is visible before the keyboard assertions.

### TEST-N05.dialog-escape-close — contact modal does not close on Escape

- **Requirement:** The Hebrew production target requires accessibility testing ([technical-specification.he.md#L292](..\..\docs\requirements\technical-specification.he.md#L292)); registry §6.1 requires real actual-dialog focus/keyboard evidence under N05 without inventing a conformance level ([TEST-PLAN.md#L479](TEST-PLAN.md#L479)).
- **Test evidence:** The independent Escape case opens the real ContactsPage custom modal, verifies the `איש קשר חדש` heading is visible, presses `Escape`, and expects that heading to become hidden ([e01-e04-n05.spec.ts#L687](browser\e01-e04-n05.spec.ts#L687)-[L695](browser\e01-e04-n05.spec.ts#L695)).
- **Observed output:** The heading stayed visible after `Escape`: `Expected: hidden`, `Received: visible` ([browser-final.json#L1134](artifacts\browser-final.json#L1134)-[L1175](artifacts\browser-final.json#L1175)).
- **Causal path:** The add-contact modal has overlay click-close and explicit button close handlers ([ContactsPage.tsx#L172](..\..\src\pages\ContactsPage.tsx#L172)-[L188](..\..\src\pages\ContactsPage.tsx#L188)), but no `onKeyDown`, document key listener, dialog role, or Escape handling around the custom modal. Pressing Escape therefore has no code path to call `onClose`.
- **Why harness causes are excluded:** The test has no dependency on initial focus or Tab behavior; it only requires the modal heading to be visible before pressing Escape, and Playwright reports the same heading remains visible. The UI is authenticated and mounted; the failure is exactly the missing key handler in the custom ContactsPage modal, not shared Modal behavior.

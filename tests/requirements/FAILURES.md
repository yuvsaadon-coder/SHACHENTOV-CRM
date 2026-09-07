# Final failure analysis

## Accounting and interpretation

**155 actual failed cases out of 433: behavior 68, emulator 58, browser 29.**
The [failure index](#failure-index) contains each failed `(file, test ID)` from
[test-manifest.json](test-manifest.json) exactly once. IDs are the stable portion
of the actual expanded runtime names; the manifest retains their full wording.
Different cases/layers can confirm one cause; **155 is not a count of unique
defects**. Passing cases, withdrawn tests and non-runnable requirements are not
included in this index.

A consolidation pass removed 2 failed cases whose gap evidence is fully
preserved by a stronger surviving sibling test:
`TEST-C02.domain-default-and-department-filter` (gap still proven by
`TEST-A03.contacts.own-domain-default`, same R03) and
`TEST-Q07.partial-reorder-recovery` (gap still proven by
`TEST-Q07.atomic-question-reorder`, same R21). Index numbers below are
renumbered sequentially after this removal.

Final runtime authority is [behavior-verified.json](artifacts/behavior-verified.json),
[emulator-closure.json](artifacts/emulator-closure.json) and
[browser-closure.json](artifacts/browser-closure.json), against unchanged
application `60548f8`. Earlier owner-report totals are history. The latest L02
nullish correction is included. Current runs identify application/configuration
gaps, not outstanding test/fixture/infrastructure failures. Application rejection
diagnostics are not hidden, and passing characterizations do not approve policy.

Every index row links its actual test source and raw Hebrew requirement lines.
Its analysis group supplies production source-line links, a worked example and
the owner evidence. A G label is never the reason a verdict is accepted.
Examples use synthetic values only; no runtime credentials, download tokens or
raw logs are copied here. See [RESULTS.md](RESULTS.md#design-and-independent-verification)
for the completed final review provenance. The
core owner refreshed its final-current case reviews during delivery preparation.

## Analysis groups

### R01 — UI guards accept identities outside the route's role matrix

[T58–74][t-rbac] says “`CRM ללא דפי אדמין`” for HQ roles and
“`/portal/* בלבד`” for coordinators. [App guards](../../src/App.tsx#L29-L42)
reject a coordinator at CRM but do not positively validate other roles;
admin routes reuse the ordinary guard, and a missing profile falls through the
portal guard. Example: FIN can directly open `/admin/branches`; a signed-in
identity with no application profile can render CRM. This proves UI boundary
failure, not an inferred server-side permission. [Core review](CORE-INDIVIDUAL-REVIEW.md#root-cause-groupings--54-confirmed-component-suite-defects-current-test-numbers-see-result-summary-below).

### R02 — asynchronous profile resolution outlives its identity

The role comes from `users/{uid}` under [T58–74][t-rbac].
[AuthContext](../../src/context/AuthContext.tsx#L22-L47) neither clears the prior
profile on a new authenticated identity nor guards late reads by auth generation.
Example: A's delayed lookup resolves after B signs in or after logout and restores
A's profile. Missing/rejected B lookup also leaves A's authority visible.
The four controlled real-provider cases establish separate transitions.
[Core review](CORE-INDIVIDUAL-REVIEW.md).

### R03 — own-domain defaults and contact department filtering are absent

[E29][e-domain] requires “`רואים כברירת מחדל את התחום שלהם`”;
[E85][e-contacts] also requires “`לסנן אותם לפי סוג ומחלקה`”.
[TasksPage](../../src/pages/TasksPage.tsx#L116-L123) disables the domain default
when any query parameter exists; [ContactsPage](../../src/pages/ContactsPage.tsx#L254-L291)
has no domain/department predicate; [HQKnowledgePage](../../src/pages/HQKnowledgePage.tsx#L367-L403)
starts at all domains. Example: FIN sees a VOL-only fixture by default.
These are view-default/filter failures, not an invented cross-domain denial
policy. [Core](CORE-RESULTS.md), [operations](OPERATIONS-RESULTS.md),
[K/H](KNOWLEDGE-FEATURE-RESULTS.md).

### R04 — listener failures do not reach the consumer's error contract

[T94–116][t-live] specifies `{ data, loading, error }` and “`ניהול נכון של
subscriptions, שגיאות`”. [useContacts](../../src/hooks/useContacts.ts#L6-L30) and the
[comments listener](../../src/pages/TaskDetailPage.tsx#L107-L113) have no error
callback. [useHQKnowledge](../../src/hooks/useHQKnowledge.ts#L56-L60) clears loading
in its error callback but exposes no error state. [useBranch](../../src/hooks/useBranch.ts#L7-L46),
[useQuarterlyReports](../../src/hooks/useQuarterlyReports.ts#L6-L29),
[useKnowledge](../../src/hooks/useKnowledge.ts#L7-L32) and
[useChatHistory](../../src/hooks/useChatHistory.ts#L26-L83) do not expose the error.
Example: terminal permission denial leaves a spinner or stale data without an
error. Remount tests fail at error observability; their later recovery is not
claimed executed. A fresh subscription, not impossible same-listener recovery,
is the recovery oracle. [Core results](CORE-RESULTS.md), [review](CORE-INDIVIDUAL-REVIEW.md).

### R05 — identity/branch changes retain prior-scope data or session state

[T153][t-ai-scope] requires “`לפי זהות, role, domain וסניף`”;
[E81][e-private] requires private work invisible to other users.
[usePersonalTasks](../../src/hooks/usePersonalTasks.ts#L6-L33) and
[useKnowledge](../../src/hooks/useKnowledge.ts#L7-L32) retain A data while B's
first snapshot is pending. [useChatHistory](../../src/hooks/useChatHistory.ts#L26-L83)
retains A's session ID across user/type changes; a real B save attempts a
nonexistent B-path document. [PortalChat](../../src/pages/portal/PortalChat.tsx#L10-L75)
allows A's pending reply to render after an in-place switch to B.
Settled emulator isolation can pass while immediate stale-state cases fail.
Example: a hook showing `task-a` for `user-a` is rerendered for `user-b`.
Before B's first snapshot arrives, it still returns `task-a`, exposing A's
previously loaded data under B's current scope.
[Core](CORE-RESULTS.md), [K/H](KNOWLEDGE-FEATURE-RESULTS.md).

### R06 — persisted timestamps are missing or client-clock strings

[T92][t-consistency] says “`כל מסמך אמור להשתמש ב-serverTimestamp()`”.
[RoleEditModal](../../src/components/roles/RoleEditModal.tsx#L54-L70) and
[question create/update writers](../../src/hooks/useReportQuestions.ts#L60-L73) omit applicable
timestamps; the [HQ mirror writer](../../src/hooks/useHQKnowledge.ts#L8-L28)
uses an ISO string. Example: real role readback has no creation/update timestamp,
and a mirror has a string rather than Firestore `Timestamp`. Component and real
emulator cases are separate confirmations. [Core results](CORE-RESULTS.md#3-emulator-lane--executed-real-results).

### R07 — recurrence suppression is permanent within the mounted session

[E48][e-recurrence] requires reset “`בתחילת כל מחזור חדש`”, with consistency
under [T92][t-consistency]. [useRecurringTaskReset](../../src/hooks/useRecurringTaskReset.ts#L46-L73)
adds task IDs to `resetInSession` before commit, never keys them by cycle, and
does not remove them after rejection. Example: a September reset suppresses the
same task in October; a rejected first batch suppresses retry too. This is an
existing-hook defect, distinct from the non-runnable future server scheduler.
[Core review](CORE-INDIVIDUAL-REVIEW.md).

### R08 — actual sparse task producers break downstream readers

[T194–204][t-task-contact] requires usable task CRUD/contact linkage.
[TaskDetailPage defaults](../../src/pages/TaskDetailPage.tsx#L58-L79) can omit
consumer fields. [TasksPage](../../src/pages/TasksPage.tsx#L100-L110) unconditionally
calls `category.toLowerCase()` and [ContactsPage](../../src/pages/ContactsPage.tsx#L280-L291)
calls `contactRefs.includes()`. Example: create a minimal task using production,
then open the list or linked-contact panel: the respective missing field crashes
the reader. This is production writer/reader incompatibility, not a hand-made
invalid fixture. [Core](CORE-RESULTS.md), [operations](OPERATIONS-RESULTS.md).

### R09 — task CRUD and relationship controls are unreachable

[T194–196][t-task] explicitly includes “`CRUD`” and “`אנשי קשר, תלויות ותתי-משימות`”.
[TaskDetailPage](../../src/pages/TaskDetailPage.tsx#L269) has subtask support but no
top-level delete or dependency editor; stored contact references do not render
the linked contact in the browser case. Example: independently seed a valid
contact link, open its real task, and the contact is absent. No cascading-delete
or dependency-cycle policy is inferred. [Core](CORE-RESULTS.md),
[browser verdicts](RULES-BROWSER-RESULTS.md#browser-reviewer-tracking).

### R10 — the task calendar is not reachable

[E44][e-task] requires “`לוח שנה`”; [T40][t-calendar] names month/week/day.
[TasksPage](../../src/pages/TasksPage.tsx#L272-L284) exposes list/Kanban/Gantt only.
Example: the actual task-page user cannot select a calendar mode. Directly
mounting the orphan [CalendarView](../../src/components/calendar/CalendarView.tsx#L30-L64)
is a passing characterization, not evidence of a reachable feature.
[Core results](CORE-RESULTS.md).

### R11 — task attachments are embedded in Firestore instead of Storage

[T16–20][t-storage] specifies Firebase Storage; [E44][e-task] includes files.
[TaskDetailPage](../../src/pages/TaskDetailPage.tsx#L175-L197) reads file data as a
base64 URL and persists it as attachment metadata, without a Storage upload.
Example: the actual `storageUrl` starts with `data:` and no corresponding object
exists in the independently inspected emulator bucket. A harmless Admin
bucket control proves that inspection is authorized. [Core results](CORE-RESULTS.md).

### R12 — attachment metadata and counter writes diverge

[T92][t-consistency] explicitly requires “`טרנזקציות, מנגנוני תיקון ובדיקות עקביות`”.
[Attachment save](../../src/pages/TaskDetailPage.tsx#L175-L224) persists the
attachment and then separately updates its task counter, with no rollback or
reconciliation. Example: a single injected counter-write failure leaves one
attachment and a zero count. Both component and real-emulator cases call this
production sequence rather than duplicating a writer. [Core results](CORE-RESULTS.md).

### R13 — quick status updates omit history

[E44][e-task] requires “`יומן שינויים מלא`”.
[TasksPage](../../src/pages/TasksPage.tsx#L25-L33),
[DashboardPage](../../src/pages/DashboardPage.tsx#L25-L30) and
[KanbanCard](../../src/components/kanban/KanbanCard.tsx#L54-L64) update the task
without creating history. Example: a valid `בעבודה`→`בוצע` update persists,
but independently read history remains empty. Final emulator results, not the
old inconclusive list-write run, support this observation; the refreshed
individual review now confirms that current failure.
[Core owner evidence](CORE-RESULTS.md#3-emulator-lane--executed-real-results),
[current review](CORE-INDIVIDUAL-REVIEW.md).

### R14 — failed task update leaves a false successful-change history entry

[E44][e-task]'s full history must describe actual changes; [T92][t-consistency]
requires consistent multi-record writes.
[TaskDetailPage](../../src/pages/TaskDetailPage.tsx#L128-L158) writes history before
the task update, without rollback. Example: reject the status update after
history succeeds; the task retains the old status but the history reports the new
one. This differs from R13's missing-history cause. [Core review](CORE-INDIVIDUAL-REVIEW.md).

### R15 — retried promotion duplicates the organizational task

[T92][t-consistency] requires repair and consistency.
[PersonalTasksPage](../../src/pages/PersonalTasksPage.tsx#L31-L51) creates an
organizational task, then completes the private task without a transaction or
deduplication link. Example: fail the second write, then retry the same promotion:
another organizational task is created. Explicit promotion itself is only
characterized; no general private-data sharing policy is approved.
[Core review](CORE-INDIVIDUAL-REVIEW.md).

### R16 — real failed writes have no actionable user feedback

[T94–116][t-live] requires error management, with consistency under
[T92][t-consistency]. [ContactsPage](../../src/pages/ContactsPage.tsx#L15-L125)
does not display save/delete rejection; [KanbanCard](../../src/components/kanban/KanbanCard.tsx#L54-L64)
discards its update promise; [PortalChat](../../src/pages/portal/PortalChat.tsx#L61-L74)
discards history-save failure; [KnowledgeAdminPage](../../src/pages/admin/KnowledgeAdminPage.tsx#L320-L369)
has `try/finally` without caught UI error state. Example: after a successful
control write, revoke authority or inject a real write conflict; Admin readback
proves no intended commit, but no visible retry/failure message appears.
Browser page errors are diagnostics, not required assertions.
[Browser](RULES-BROWSER-RESULTS.md), [K/H](KNOWLEDGE-FEATURE-RESULTS.md).

### R17 — custom dialogs do not preserve keyboard focus behavior

[T292][t-a11y] requires “`בדיקות נגישות`”.
[ContactsPage custom modal](../../src/pages/ContactsPage.tsx#L15-L190) lacks initial
focus, Tab trapping and Escape dismissal. The
[role modal](../../src/components/roles/RoleEditModal.tsx#L14-L91) does not restore
focus to the orgchart opener. Example: Shift+Tab escapes the contact modal and
Escape leaves it open; closing role details loses opener focus. Real browser
focus assertions distinguish this from functional CRUD checks.
[Operations](OPERATIONS-RESULTS.md), [browser reviews](RULES-BROWSER-RESULTS.md#browser-reviewer-tracking).

### R18 — cyclic hierarchy nodes silently disappear

[E56][e-org] requires “`היררכיה חזותית של הארגון`”.
[OrgChartView](../../src/components/orgchart/OrgChartView.tsx#L6-L18) marks both
members of A→B→A as children, leaving no root to render either. Example: two
existing roles vanish without an error. The test accepts visibility or explicit
error; it does not dictate an unresolved cycle-repair algorithm.
[Operations](OPERATIONS-RESULTS.md#the-8-current-failing-component-tests).

### R19 — report state/draft crosses a branch change

[T241][t-branch] says “`לסניפים שאליהם הוא משויך`” and
[T153][t-ai-scope] identifies branch as a data boundary.
[PortalReport](../../src/pages/portal/PortalReport.tsx#L70-L155) retains `values`
and a restore-once ref when the outlet branch changes, even though the draft key
changes. Example: A's answers remain on C's form and are autosaved as C's draft.
These two cases establish visible child state and persisted draft mixing;
same-branch shared-device retention remains unresolved.
[Operations](OPERATIONS-RESULTS.md).

### R20 — first-report-only fields render before history resolves

[T86][t-questions] includes `firstReportOnly`; [T94–116][t-live] requires loading
management. [PortalReport](../../src/pages/portal/PortalReport.tsx#L70-L155)
computes first-report status without waiting for report-history loading.
Example: an existing-report branch sees and can submit first-only fields while
its history snapshot is deferred. This is a first-report race, not a demand for
period-versioned questions. [Operations](OPERATIONS-RESULTS.md).

### R21 — independent question-order writes leave duplicate ordering

[T92][t-consistency] requires transactional denormalization.
[ReportQuestionsAdminPage](../../src/pages/admin/ReportQuestionsAdminPage.tsx#L20-L48)
uses two concurrent reorder calls; [useReportQuestions](../../src/hooks/useReportQuestions.ts#L60-L73)
writes one document each. Example: swapping orders 1 and 2 with the second write
rejected leaves both at 2, with no explicit recovery. Component and emulator
tests run the actual page/writer; no cloned swap algorithm supplies the verdict.
[Operations emulator causes](OPERATIONS-RESULTS.md#emulator-failure-causes).

### R22 — coordinator link replacement loses another client's committed link

[T92][t-consistency] requires consistency and [T214–216][t-branch-ops] includes
linked coordinators. [BranchesPage](../../src/pages/BranchesPage.tsx#L298-L337)
replaces full UID/name arrays computed from its local snapshot.
Example: two clients begin with coordinator A, add B and C, then the final
document contains A/C but loses committed B. Only the real production-flow
emulator case counts; the earlier cloned component case was withdrawn.
[Operations emulator causes](OPERATIONS-RESULTS.md#emulator-failure-causes).

### R23 — real knowledge forms pass undefined optional fields to Firestore

[E68–73][e-knowledge] requires local/organizational knowledge.
[HQKnowledgePage](../../src/pages/HQKnowledgePage.tsx#L159-L176) passes undefined
file metadata, and [useAddHQKnowledge](../../src/hooks/useHQKnowledge.ts#L63-L94)
spreads it into `addDoc`. [PortalKnowledge](../../src/pages/portal/PortalKnowledge.tsx#L253-L292)
similarly constructs undefined URL/file fields consumed by
[useAddKnowledge](../../src/hooks/useKnowledge.ts#L40-L56).
Example: a valid document title/content is rejected for an unrelated undefined
`url`; link/file paths fail on their own optional fields. E02 stops at the HQ
save; E03 stops at the portal save. K03 local-storage also stops at save:
**its later Storage-object assertions are not independently established**.
[Browser](RULES-BROWSER-RESULTS.md), [current K/H](KNOWLEDGE-FEATURE-RESULTS.md#all-22-failed-cases--actual-versus-required).

### R24 — failed HQ file metadata leaves an unlinked object

[T92][t-consistency] requires repair/consistency.
[useAddHQKnowledge](../../src/hooks/useHQKnowledge.ts#L76-L94) commits source,
uploads bytes, then writes file metadata with no compensating cleanup.
Example: fail that metadata update; the real uploaded object remains without the
source's file link. This is not a test deleting metadata after a successful
operation. [K/H evidence](KNOWLEDGE-FEATURE-RESULTS.md#all-22-failed-cases--actual-versus-required).

### R25 — the real mirror producer omits tags required by its reader

[E73][e-knowledge] requires “`תגיות`” filtering.
[syncToCoordinators](../../src/hooks/useHQKnowledge.ts#L8-L28) omits tags, while
[PortalKnowledge ItemCard](../../src/pages/portal/PortalKnowledge.tsx#L66)
unconditionally calls `tags.map`. Example: the actual shared HQ item crashes
the real portal reader before tag filtering. No malformed manually seeded mirror
is used. [K/H evidence](KNOWLEDGE-FEATURE-RESULTS.md).

### R26 — deleting HQ source leaves retrievable mirror content

[T92][t-consistency] requires consistent denormalization.
[HQ delete](../../src/hooks/useHQKnowledge.ts#L127-L132) removes only its source
document, leaving the coordinator mirror. Example: after verified source
deletion, a fresh coordinator handler request still includes the deleted content.
This is current retrieval, not an unsupported cache/URL-revocation claim.
[K/H evidence](KNOWLEDGE-FEATURE-RESULTS.md).

### R27 — source and mirror updates commit mixed versions

[T92][t-consistency] explicitly says “`טרנזקציות`”.
[HQ update](../../src/hooks/useHQKnowledge.ts#L97-L124) writes source then mirror
separately. Example: reject the mirror write and wait for settlement; fresh
reads show new source content with old mirror content before any retry.
The separate passing K05 retry proves convergence after explicit retry, not
atomicity of the first attempt. [Current revised-case evidence](KNOWLEDGE-FEATURE-RESULTS.md#six-revisednew-cases--actual-current-outcomes).

### R28 — research library is a static catalog, not the maintained live data

[E70–73][e-knowledge] includes “`מחקרים`”; [T94–116][t-live] requires realtime
knowledge hooks. [KnowledgeLibraryPage](../../src/pages/KnowledgeLibraryPage.tsx#L101-L136)
reads its bundled catalog. Example: actual admin source/mirror writes succeed,
but a maintained item never appears in the open real library. Browser K06 and
emulator L05 are distinct cases confirming this consumer disconnect.
[Core](CORE-RESULTS.md), [K/H](KNOWLEDGE-FEATURE-RESULTS.md).

### R29 — research save is non-atomic and retry allocates a new identity

[T92][t-consistency] requires transactions, repair and consistency.
[KnowledgeAdminPage](../../src/pages/admin/KnowledgeAdminPage.tsx#L320-L369)
uses separate source/mirror writes and allocates `custom-${Date.now()}` on every
Save. Example: the actual first attempt settles at one source/zero mirrors;
retrying the same retained panel and reloading yields two sources/one mirror.
The error-visibility case belongs to R16 and is not hidden in this atomicity
assertion. [Current K07 evidence](KNOWLEDGE-FEATURE-RESULTS.md#six-revisednew-cases--actual-current-outcomes).

### R30 — document summarization sends only its title

[T126][t-summary] says “`סיכום תוכן דרך Claude`” and
[T159][t-grounding] requires source-grounded answers.
[KnowledgeAdminPage](../../src/pages/admin/KnowledgeAdminPage.tsx#L299-L311)
and [summarize-article](../../netlify/functions/summarize-article.ts#L11-L35)
send title only. Example: a selected PDF's unique synthetic fact/bytes never
reach the captured provider request. The failure is missing input grounding,
not a judgment of a canned model response's semantic quality.
[K08 evidence](KNOWLEDGE-FEATURE-RESULTS.md).

### R31 — HQ report context reads a different answer field from its writer

[T85][t-report-schema] says “`סכמת התשובות חייבת להיות מוגדרת ואחידה`”;
[E92][e-report-ai] requires answers about volunteer challenges.
[PortalReport](../../src/pages/portal/PortalReport.tsx#L229-L250) writes `data`;
[hq-chat](../../netlify/functions/hq-chat.ts#L184-L200) formats `answers`.
Example: a genuine submitted challenge is persisted and readable but absent
from the provider context. Emulator H03 and browser H06 independently confirm
loss; the final choice of schema name remains unresolved.
[K/H evidence](KNOWLEDGE-FEATURE-RESULTS.md).

### R32 — report context omits year

[E91–92][e-report-ai] explicitly distinguishes “`רבעון ושנה`”.
[hq-chat report formatter](../../netlify/functions/hq-chat.ts#L184-L200) includes
quarter but not year. Example: real Q3/2025 and Q3/2026 submissions collapse
into indistinguishable Q3 context lines, so their facts cannot be assigned to
the requested year. Real UI/persistence controls precede provider capture.
[K/H evidence](KNOWLEDGE-FEATURE-RESULTS.md).

### R33 — missing-report answers lack the branch population

[E92][e-report-ai] asks “`אילו סניפים לא דיווחו`”.
[hq-chat](../../netlify/functions/hq-chat.ts#L184-L200) queries reports but not
the branch roster. Example: seeded branches A/B/C/D with actual A/C submissions
yield no B/D facts in context. Names or IDs are acceptable; inactive/new-branch
eligibility policy is not invented. [K/H evidence](KNOWLEDGE-FEATURE-RESULTS.md).

### R34 — HQ AI context never collects tasks

[E77][e-ai] explicitly includes “`משימות`”.
[hq-chat source collection](../../netlify/functions/hq-chat.ts#L107-L205)
contains knowledge/research/reports but no tasks. Example: a valid stored task's
unique notes never reach the captured provider context after genuine token
verification. No particular new scope name or response schema is prescribed.
[H05 evidence](KNOWLEDGE-FEATURE-RESULTS.md).

### R35 — JSON and field types reach operations before full validation

[T131–134][t-validation] requires “`validation מלא לגוף הבקשה`”.
[portal-login](../../netlify/functions/portal-login.ts#L28-L38) parses,
destructures and trims without a surrounding body-validation guard;
[chat](../../netlify/functions/chat.ts#L58-L68) parses/destructures and passes
branchId directly to Firestore. [hq-chat](../../netlify/functions/hq-chat.ts#L39-L78)
and [summarize-article](../../netlify/functions/summarize-article.ts#L10-L57)
turn malformed/type exceptions into 500 rather than a client rejection;
truthy non-string titles can also reach the provider. Example: JSON `null`
throws in portal/chat; a numeric branch ID causes SDK path validation.
Actual F01 diagnostics identify those production operations.
[API verdict map](API-RESULTS.md#full-f69-test--verdict-mapping-persistent-record).

### R36 — authenticated chat endpoints ignore request media type

[T131][t-validation] says “`לאמת Method ו-Content-Type`”.
[chat](../../netlify/functions/chat.ts#L32-L59) and
[hq-chat](../../netlify/functions/hq-chat.ts#L50-L75) check method but not media
type. Example: valid authenticated JSON sent with missing or wrong Content-Type
still returns 200 and calls the provider instead of a client rejection.
Positive credentials exclude an unrelated authorization failure.
[API map](API-RESULTS.md).

### R37 — coordinator login enumerates names and accepts empty normalized phones

[T307][t-public] requires protection against “`enumeration`”, and
[T66][t-rbac] requires name/phone authentication.
[portal-login](../../netlify/functions/portal-login.ts#L40-L58) emits different
responses for unknown name versus wrong phone, and compares normalized strings
without rejecting zero digits. Example: punctuation-only input matches a stored
phone that also normalizes empty and returns success. This does not prescribe a
new login method or claim phone ownership verification.
[API map](API-RESULTS.md).

### R38 — function authorization lacks a positive role check

[T123–124][t-functions] describes coordinator `chat` and HQ `hq-chat`;
[T133][t-validation] requires server-side role/scope validation.
[chat](../../netlify/functions/chat.ts#L58-L74) checks branch membership but not
the user's role. [hq-chat](../../netlify/functions/hq-chat.ts#L69-L73) only
excludes an explicitly coordinator profile. Example: a member with the wrong
role reaches chat, while missing/roleless/unknown HQ profiles return 200.
Real Auth/Admin/Firestore positive controls precede denials.
[API map](API-RESULTS.md).

### R39 — malformed message collections/entries are not rejected safely

[T134][t-validation] requires full body validation.
[chat](../../netlify/functions/chat.ts#L132-L145) directly maps and forwards
messages; [hq-chat](../../netlify/functions/hq-chat.ts#L225-L249) assumes an array
and does not validate allowed roles. Example: `messages: {}` throws or becomes
500; an invalid role reaches the provider and returns 200. Chat also forwards
non-string/blank content. No speculative response-ID or empty-error-object
schema is asserted. [API map](API-RESULTS.md).

### R40 — API failures reflect unredacted provider/transport detail

[T136][t-safe-errors] requires “`שגיאות בטוחות ללא secrets או פרטי ספק`”.
[chat](../../netlify/functions/chat.ts#L149-L151) reflects provider text;
[hq-chat](../../netlify/functions/hq-chat.ts#L250-L273) reflects provider details
and [source warnings](../../netlify/functions/hq-chat.ts#L90-L96);
[health](../../netlify/functions/hq-chat-health.ts#L35-L83) returns transport/provider
details. Example: a synthetic nonpublic diagnostic marker injected at the real
provider/SDK fault boundary reappears in the response, including partial-source
success. Counters/remaining successful sources prove the fault path occurred.
Protected HQChatPage/old F07 header bytes are neither needed nor examined.
[API current review](API-RESULTS.md).

### R41 — summarizer attempts outbound work with unusable configuration

[T268–273][t-secrets] describes server-held configuration; [T136][t-safe-errors]
requires safe failures. [summarize-article](../../netlify/functions/summarize-article.ts#L3-L35)
captures a possibly empty key at import and does not reject before `fetch`.
Example: isolated import with unusable configuration still makes one attempted
provider call, caught by the test transport guard. This is a server handler
configuration-handling gap, distinct from N01's compiler settings.
[API map](API-RESULTS.md).

### R42 — authenticated data reads bypass the required profile/role matrix

[T58–74][t-rbac] requires actual rule enforcement:
“`אכיפת ההרשאות בפועל נדרשת גם בכללי Firestore, Storage`”.
[Firestore rules](../../firestore.rules#L5-L94) allow authenticated-only reads
for branches, knowledgeItems, research and reportQuestions, without requiring a
valid profile/role. Example: real reads succeed for a signed-in identity with no
profile or missing role after an authorized control succeeds.
[Rules group A](RULES-INDIVIDUAL-REVIEW.md#group-a--s01-authenticated-but-invalid-profile-reads-bypass-profilerole-checks-8-tests-2633).

### R43 — coordinator branch scope is absent from branch/knowledge rules

[T241][t-branch] says “`רכז חייב להיות מוגבל בצד השרת ובכללי הנתונים לסניפים
שאליהם הוא משויך`”. [Firestore rules](../../firestore.rules#L5-L94) allow
authenticated branch/item reads and broad coordinator item writes without
branch membership predicates. Example: A's coordinator reads B's branch/item
or changes an item to B's branch. Real own-branch controls pass first.
This does not invent global knowledge authorship policy.
[Rules group B](RULES-INDIVIDUAL-REVIEW.md#group-b--s03-coordinator-branchknowledge-boundary-is-not-enforced-3-tests-5254).

### R44 — Storage permits unrelated authenticated overwrite/delete

[T306][t-file-owner] says “`קבצים מוגבלים לפי בעלות`”.
[Storage rules](../../storage.rules#L1-L13) require authentication, not ownership,
for both HQ/research prefixes. Example: a different coordinator overwrites or
deletes a proven existing file under either exact permitted prefix. Owner setup
and anonymous-denial controls exclude a wrong-path or public-access confound.
[Rules group C](RULES-INDIVIDUAL-REVIEW.md).

### R45 — production compiler configuration does not enable strict mode

[T31][t-strict] explicitly requires “`strict: true`”.
[tsconfig.app.json](../../tsconfig.app.json#L1-L24) omits it and the
[build project](../../tsconfig.json#L1-L7) references that configuration.
Example: the installed TypeScript compiler successfully resolves the real
inherited configuration, but effective strict is not enabled. Compiler version
and parse controls pass. **Configuration gap, not a runtime UI/API defect or
missing-tool failure.** [Independent N01 review](TOOLCHAIN-RESULTS.md).

## Failure index

The source link in each row identifies one concrete failed case. R references
link the corresponding explanation above; T/E references link raw Hebrew lines.
Rows 1–29 are browser, 30–97 behavior, and 98–155 emulator.

| # | Actual test ID / source file | Concrete failure and code cause | Raw requirement | Analysis |
|---:|---|---|---|---|
| 1 | [TEST-E01.contact-link-controls](browser/e01-e04-n05.spec.ts) | Stored contact link never renders on task detail; no linked-contact UI. | [T194–204][t-task-contact] | [R09](#r09--task-crud-and-relationship-controls-are-unreachable) |
| 2 | [TEST-E02.shared-knowledge-reader](browser/e01-e04-n05.spec.ts) | HQ save rejects undefined fileUrl from its real form; reader journey stops before sharing. | [E68–73][e-knowledge] | [R23](#r23--real-knowledge-forms-pass-undefined-optional-fields-to-firestore) |
| 3 | [TEST-E03.shared-knowledge](browser/e01-e04-n05.spec.ts) | Portal global document save rejects undefined url; modal never closes. | [E68–73][e-knowledge] | [R23](#r23--real-knowledge-forms-pass-undefined-optional-fields-to-firestore) |
| 4 | [TEST-E04.task-detail-live](browser/e01-e04-n05.spec.ts) | Another client's update never reaches open detail; one-shot getDoc. | [E96][e-live] | [R28a](#task-detail-realtime-evidence) |
| 5 | [TEST-N05.actual-dialog-focus](browser/e01-e04-n05.spec.ts) | Contact modal opens without focusing its first control. | [T292][t-a11y] | [R17](#r17--custom-dialogs-do-not-preserve-keyboard-focus-behavior) |
| 6 | [TEST-N05.dialog-escape-close](browser/e01-e04-n05.spec.ts) | Escape leaves the contact modal open; no dismissal handler. | [T292][t-a11y] | [R17](#r17--custom-dialogs-do-not-preserve-keyboard-focus-behavior) |
| 7 | [TEST-N05.dialog-tab-wrap](browser/e01-e04-n05.spec.ts) | Tab/Shift+Tab escapes the contact modal; no focus trap. | [T292][t-a11y] | [R17](#r17--custom-dialogs-do-not-preserve-keyboard-focus-behavior) |
| 8 | [TEST-C01.failed-delete-actionable.browser](browser/error-paths.spec.ts) | Real denied delete leaves contact persisted without visible retry/failure feedback. | [T116][t-live] | [R16](#r16--real-failed-writes-have-no-actionable-user-feedback) |
| 9 | [TEST-C01.failed-save-actionable.browser](browser/error-paths.spec.ts) | Real failed save retains attempted input but exposes no failure/retry message. | [T116][t-live] | [R16](#r16--real-failed-writes-have-no-actionable-user-feedback) |
| 10 | [TEST-T05.failed-write-observable.browser](browser/error-paths.spec.ts) | Denied Kanban select write leaves persisted status unchanged without feedback. | [T116][t-live] | [R16](#r16--real-failed-writes-have-no-actionable-user-feedback) |
| 11 | [TEST-H02.branch-switch-no-session-mixing](browser/knowledge/H02-H06-H07.spec.ts) | Pending A reply appears after switching to B; no stale-request scope guard. | [T153][t-ai-scope] | [R05](#r05--identitybranch-changes-retain-prior-scope-data-or-session-state) |
| 12 | [TEST-H06.challenge-content](browser/knowledge/H02-H06-H07.spec.ts) | Portal-written challenge omitted from HQ context; data writer versus answers reader. | [T85][t-report-schema], [E92][e-report-ai] | [R31](#r31--hq-report-context-reads-a-different-answer-field-from-its-writer) |
| 13 | [TEST-H06.missing-roster-context](browser/knowledge/H02-H06-H07.spec.ts) | Missing B/D branch facts absent; reports-only collection never loads roster. | [E92][e-report-ai] | [R33](#r33--missing-report-answers-lack-the-branch-population) |
| 14 | [TEST-H06.year-disambiguation](browser/knowledge/H02-H06-H07.spec.ts) | Q3 submissions from different years indistinguishable; formatter omits year. | [E91–92][e-report-ai] | [R32](#r32--report-context-omits-year) |
| 15 | [TEST-H07.save-failure-visible](browser/knowledge/H02-H06-H07.spec.ts) | Reply renders but failed history save yields no session or warning; promise discarded. | [T116][t-live] | [R16](#r16--real-failed-writes-have-no-actionable-user-feedback) |
| 16 | [TEST-K01.domain-default](browser/knowledge/K01-K07.spec.ts) | FIN sees VOL-only item by default; knowledge page initializes all domains. | [E29][e-domain] | [R03](#r03--own-domain-defaults-and-contact-department-filtering-are-absent) |
| 17 | [TEST-K02.local-create-checklist-modal](browser/knowledge/K01-K07.spec.ts) | Valid checklist rejected for unrelated undefined optional fields in modal payload. | [T222–224][t-knowledge] | [R23](#r23--real-knowledge-forms-pass-undefined-optional-fields-to-firestore) |
| 18 | [TEST-K02.local-create-document-modal](browser/knowledge/K01-K07.spec.ts) | Valid document save rejected for undefined url from actual modal. | [T222–224][t-knowledge] | [R23](#r23--real-knowledge-forms-pass-undefined-optional-fields-to-firestore) |
| 19 | [TEST-K02.local-create-with-sparse-fields](browser/knowledge/K01-K07.spec.ts) | Valid link save rejected for undefined file metadata spread into addDoc. | [E68–73][e-knowledge] | [R23](#r23--real-knowledge-forms-pass-undefined-optional-fields-to-firestore) |
| 20 | [TEST-K03.local-storage-contract](browser/knowledge/K01-K07.spec.ts) | Accepted file cannot save undefined optional fields; later Storage checks are unreached. | [T16–20][t-storage], [T222–224][t-knowledge] | [R23](#r23--real-knowledge-forms-pass-undefined-optional-fields-to-firestore) |
| 21 | [TEST-K03.partial-upload-recovery](browser/knowledge/K01-K07.spec.ts) | Metadata failure leaves uploaded object unlinked; no compensation after prior commits. | [T92][t-consistency] | [R24](#r24--failed-hq-file-metadata-leaves-an-unlinked-object) |
| 22 | [TEST-K04.delete-current-retrieval](browser/knowledge/K01-K07.spec.ts) | Fresh coordinator request still retrieves deleted HQ content; mirror never deleted. | [T92][t-consistency] | [R26](#r26--deleting-hq-source-leaves-retrievable-mirror-content) |
| 23 | [TEST-K04.produced-mirror-tag-filter](browser/knowledge/K01-K07.spec.ts) | Real mirror lacks tags and ItemCard crashes at tags.map before filtering. | [E73][e-knowledge] | [R25](#r25--the-real-mirror-producer-omits-tags-required-by-its-reader) |
| 24 | [TEST-K05.mirror-write-failure-recovery](browser/knowledge/K01-K07.spec.ts) | Settled source/mirror versions differ before retry; sequential update is non-atomic. | [T92][t-consistency] | [R27](#r27--source-and-mirror-updates-commit-mixed-versions) |
| 25 | [TEST-K06.research-item-reaches-open-library](browser/knowledge/K01-K07.spec.ts) | Maintained item commits but never appears; library uses static catalog. | [E70–73][e-knowledge], [T116][t-live] | [R28](#r28--research-library-is-a-static-catalog-not-the-maintained-live-data) |
| 26 | [TEST-K07.error-visibility](browser/knowledge/K01-K07.spec.ts) | Persistent real research write conflict settles without a visible error; no catch/UI state. | [T92][t-consistency], [T116][t-live] | [R16](#r16--real-failed-writes-have-no-actionable-user-feedback) |
| 27 | [TEST-K07.retry-idempotency](browser/knowledge/K01-K07.spec.ts) | Retry/reload yields two sources and one mirror; each Save allocates a fresh ID. | [T92][t-consistency] | [R29](#r29--research-save-is-non-atomic-and-retry-allocates-a-new-identity) |
| 28 | [TEST-K07.second-write-failure](browser/knowledge/K01-K07.spec.ts) | Settled first attempt leaves one source/zero mirrors; separate writes lack rollback. | [T92][t-consistency] | [R29](#r29--research-save-is-non-atomic-and-retry-allocates-a-new-identity) |
| 29 | [TEST-K08.document-content-grounding](browser/knowledge/K08.spec.ts) | Actual selected document fact/bytes never reach provider; title-only summarization. | [T126][t-summary], [T159][t-grounding] | [R30](#r30--document-summarization-sends-only-its-title) |
| 30 | [TEST-A03.contacts.own-domain-default](components/core/a03-domain-default-filters.test.tsx) | FIN default includes VOL contacts; no domain predicate. | [E29][e-domain] | [R03](#r03--own-domain-defaults-and-contact-department-filtering-are-absent) |
| 31 | [TEST-A03.tasks.own-domain-default-with-unrelated-query](components/core/a03-domain-default-filters.test.tsx) | Unrelated URL parameter disables own-domain default. | [E29][e-domain] | [R03](#r03--own-domain-defaults-and-contact-department-filtering-are-absent) |
| 32 | [TEST-A04.a-transition-to-profile-missing](components/core/a04-authcontext-profile-race.test.tsx) | A profile survives transition to an identity lacking a profile. | [T58–74][t-rbac] | [R02](#r02--asynchronous-profile-resolution-outlives-its-identity) |
| 33 | [TEST-A04.b-profile-read-rejected](components/core/a04-authcontext-profile-race.test.tsx) | Rejected B profile read leaves A authority in state. | [T58–74][t-rbac] | [R02](#r02--asynchronous-profile-resolution-outlives-its-identity) |
| 34 | [TEST-A04.late-a-resolves-after-b-signin](components/core/a04-authcontext-profile-race.test.tsx) | Late A lookup overwrites B profile; no generation guard. | [T58–74][t-rbac] | [R02](#r02--asynchronous-profile-resolution-outlives-its-identity) |
| 35 | [TEST-A04.late-a-resolves-after-logout](components/core/a04-authcontext-profile-race.test.tsx) | Late A lookup restores profile after logout. | [T58–74][t-rbac] | [R02](#r02--asynchronous-profile-resolution-outlives-its-identity) |
| 36 | [TEST-A05.ui.admin.missing-profile.branches](components/core/a05-identity-state-matrix.test.tsx) | Profileless identity renders branches admin; route lacks admin gate. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 37 | [TEST-A05.ui.admin.missing-profile.hierarchy](components/core/a05-identity-state-matrix.test.tsx) | Profileless identity renders hierarchy admin; ordinary CRM guard reused. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 38 | [TEST-A05.ui.admin.missing-profile.knowledge](components/core/a05-identity-state-matrix.test.tsx) | Profileless identity renders knowledge admin; no admin-role predicate. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 39 | [TEST-A05.ui.admin.missing-profile.report-questions](components/core/a05-identity-state-matrix.test.tsx) | Profileless identity renders report-question admin; guard falls through. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 40 | [TEST-A05.ui.admin.missing-role.branches](components/core/a05-identity-state-matrix.test.tsx) | Roleless profile renders branches admin; no admin-role predicate. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 41 | [TEST-A05.ui.admin.missing-role.hierarchy](components/core/a05-identity-state-matrix.test.tsx) | Roleless profile renders hierarchy admin; ordinary guard accepts it. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 42 | [TEST-A05.ui.admin.missing-role.knowledge](components/core/a05-identity-state-matrix.test.tsx) | Roleless profile renders knowledge admin; admin gate absent. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 43 | [TEST-A05.ui.admin.missing-role.report-questions](components/core/a05-identity-state-matrix.test.tsx) | Roleless profile renders question admin; admin gate absent. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 44 | [TEST-A05.ui.admin.unknown-role.branches](components/core/a05-identity-state-matrix.test.tsx) | Unknown role renders branches admin; only coordinator is excluded. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 45 | [TEST-A05.ui.admin.unknown-role.hierarchy](components/core/a05-identity-state-matrix.test.tsx) | Unknown role renders hierarchy admin; no positive admin check. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 46 | [TEST-A05.ui.admin.unknown-role.knowledge](components/core/a05-identity-state-matrix.test.tsx) | Unknown role renders knowledge admin; no positive admin check. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 47 | [TEST-A05.ui.admin.unknown-role.report-questions](components/core/a05-identity-state-matrix.test.tsx) | Unknown role renders question admin; no positive admin check. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 48 | [TEST-A05.ui.crm.missing-profile](components/core/a05-identity-state-matrix.test.tsx) | Profileless signed-in identity renders CRM; profile validity unchecked. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 49 | [TEST-A05.ui.crm.missing-role](components/core/a05-identity-state-matrix.test.tsx) | Roleless identity renders CRM; non-coordinator treated as sufficient. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 50 | [TEST-A05.ui.crm.unknown-role](components/core/a05-identity-state-matrix.test.tsx) | Unknown role renders CRM; role allowlist absent. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 51 | [TEST-A05.ui.portal.missing-profile](components/core/a05-identity-state-matrix.test.tsx) | Missing profile falls through coordinator guard and renders portal. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 52 | [TEST-A06.ui.branches](components/core/a06-admin-route-denial.test.tsx) | Non-admin HQ user reaches branches admin directly. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 53 | [TEST-A06.ui.hierarchy](components/core/a06-admin-route-denial.test.tsx) | Non-admin HQ user reaches hierarchy admin directly. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 54 | [TEST-A06.ui.knowledge](components/core/a06-admin-route-denial.test.tsx) | Non-admin HQ user reaches knowledge admin directly. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 55 | [TEST-A06.ui.report-questions](components/core/a06-admin-route-denial.test.tsx) | Non-admin HQ user reaches question admin directly. | [T58–74][t-rbac] | [R01](#r01--ui-guards-accept-identities-outside-the-routes-role-matrix) |
| 56 | [TEST-L02.useBranch.error-then-remount-recovers](components/core/l02-hook-error-handling.test.tsx) | Branch hook clears loading but exposes no permission error. | [T94–116][t-live] | [R04](#r04--listener-failures-do-not-reach-the-consumers-error-contract) |
| 57 | [TEST-L02.useChatHistory.error-then-remount-recovers](components/core/l02-hook-error-handling.test.tsx) | History hook does not return listener error to caller. | [T94–116][t-live] | [R04](#r04--listener-failures-do-not-reach-the-consumers-error-contract) |
| 58 | [TEST-L02.useContacts.error-surfaces](components/core/l02-hook-error-handling.test.tsx) | Contacts listener has no error callback; loading/error contract never resolves correctly. | [T94–116][t-live] | [R04](#r04--listener-failures-do-not-reach-the-consumers-error-contract) |
| 59 | [TEST-L02.useContacts.stale-success-not-presented-as-fresh-after-error](components/core/l02-hook-error-handling.test.tsx) | Permanent denial leaves prior contacts with no error indication. | [T94–116][t-live] | [R04](#r04--listener-failures-do-not-reach-the-consumers-error-contract) |
| 60 | [TEST-L02.useHQKnowledge.error-then-remount-recovers](components/core/l02-hook-error-handling.test.tsx) | HQ knowledge callback clears loading but exposes no error state. | [T94–116][t-live] | [R04](#r04--listener-failures-do-not-reach-the-consumers-error-contract) |
| 61 | [TEST-L02.useKnowledge.error-then-remount-recovers](components/core/l02-hook-error-handling.test.tsx) | Local knowledge hook clears loading but drops listener error. | [T94–116][t-live] | [R04](#r04--listener-failures-do-not-reach-the-consumers-error-contract) |
| 62 | [TEST-L02.useQuarterlyReports.error-then-remount-recovers](components/core/l02-hook-error-handling.test.tsx) | Branch reports hook exposes no listener-error state. | [T94–116][t-live] | [R04](#r04--listener-failures-do-not-reach-the-consumers-error-contract) |
| 63 | [TEST-L03.useChatHistory.scope-change-clears-session-id](components/core/l03-identity-scope-transitions.test.tsx) | Prior scope session ID survives identity/type change. | [T153][t-ai-scope] | [R05](#r05--identitybranch-changes-retain-prior-scope-data-or-session-state) |
| 64 | [TEST-L03.useKnowledge.branch-change-no-stale-A-data](components/core/l03-identity-scope-transitions.test.tsx) | A knowledge remains visible while B's first snapshot is pending. | [T241][t-branch], [T116][t-live] | [R05](#r05--identitybranch-changes-retain-prior-scope-data-or-session-state) |
| 65 | [TEST-L03.usePersonalTasks.uid-change-no-stale-A-data](components/core/l03-identity-scope-transitions.test.tsx) | A private tasks retained across defined UID switch before B snapshot. | [E81][e-private] | [R05](#r05--identitybranch-changes-retain-prior-scope-data-or-session-state) |
| 66 | [TEST-L04.hq-knowledge-writer.mirror-requires-server-timestamp](components/core/l04-writer-timestamps.test.tsx) | Mirror creation uses client ISO time instead of server timestamp. | [T92][t-consistency] | [R06](#r06--persisted-timestamps-are-missing-or-client-clock-strings) |
| 67 | [TEST-L04.report-question-writer.timestamp-gap](components/core/l04-writer-timestamps.test.tsx) | Question writer omits required server timestamp on the exercised write. | [T92][t-consistency] | [R06](#r06--persisted-timestamps-are-missing-or-client-clock-strings) |
| 68 | [TEST-L04.role-writer.timestamp-gap](components/core/l04-writer-timestamps.test.tsx) | Role creation omits creation/update server timestamps. | [T92][t-consistency] | [R06](#r06--persisted-timestamps-are-missing-or-client-clock-strings) |
| 69 | [TEST-L04.role-writer.update-timestamp-gap](components/core/l04-writer-timestamps.test.tsx) | Role edit omits server-assigned updatedAt. | [T92][t-consistency] | [R06](#r06--persisted-timestamps-are-missing-or-client-clock-strings) |
| 70 | [TEST-R03.second-cycle-resets-without-unmount](components/core/r03-admin-mount-timing.test.tsx) | Prior-cycle ID remains suppressed in the mounted hook's session set. | [E48][e-recurrence] | [R07](#r07--recurrence-suppression-is-permanent-within-the-mounted-session) |
| 71 | [TEST-R04.recovery-observability](components/core/r04-rejected-batch-suppression.test.tsx) | Rejected reset remains suppressed; IDs marked before failed commit are never released. | [T92][t-consistency] | [R07](#r07--recurrence-suppression-is-permanent-within-the-mounted-session) |
| 72 | [TEST-T01.sparse-task-in-list-view](components/core/t01-task-create-detail-roundtrip.test.tsx) | Production-created sparse task crashes at category.toLowerCase. | [T194–196][t-task] | [R08](#r08--actual-sparse-task-producers-break-downstream-readers) |
| 73 | [TEST-T03.delete-control-persists](components/core/t03-task-relationships-and-delete.test.tsx) | No top-level task delete control to execute required CRUD action. | [T194–196][t-task] | [R09](#r09--task-crud-and-relationship-controls-are-unreachable) |
| 74 | [TEST-T03.no-dependency-editor](components/core/t03-task-relationships-and-delete.test.tsx) | Real task page has no dependency editor. | [T194–196][t-task] | [R09](#r09--task-crud-and-relationship-controls-are-unreachable) |
| 75 | [TEST-T06.reachable-calendar-month-week-day](components/core/t06-calendar-view-characterization.test.tsx) | Actual task view offers no reachable month/week/day calendar. | [T40][t-calendar], [E44][e-task] | [R10](#r10--the-task-calendar-is-not-reachable) |
| 76 | [TEST-T08.counter-recovery](components/core/t08-attachment-storage-contract.test.tsx) | Metadata survives rejected counter write; no consistency recovery. | [T92][t-consistency] | [R12](#r12--attachment-metadata-and-counter-writes-diverge) |
| 77 | [TEST-T08.storage-roundtrip](components/core/t08-attachment-storage-contract.test.tsx) | Real attachment writer embeds data URL instead of uploading Storage bytes. | [T16–20][t-storage] | [R11](#r11--task-attachments-are-embedded-in-firestore-instead-of-storage) |
| 78 | [TEST-T09.dashboard-quick-update-writes-history](components/core/t09-status-change-history.test.tsx) | Dashboard status update omits history write. | [E44][e-task] | [R13](#r13--quick-status-updates-omit-history) |
| 79 | [TEST-T09.kanban-inline-select-writes-history](components/core/t09-status-change-history.test.tsx) | Kanban native select updates only the task. | [E44][e-task] | [R13](#r13--quick-status-updates-omit-history) |
| 80 | [TEST-T09.list-quick-update-writes-history](components/core/t09-status-change-history.test.tsx) | List status update has no history append. | [E44][e-task] | [R13](#r13--quick-status-updates-omit-history) |
| 81 | [TEST-T09.rejected-update-no-false-history](components/core/t09-status-change-history.test.tsx) | History commits before failed task update and is not rolled back. | [E44][e-task], [T92][t-consistency] | [R14](#r14--failed-task-update-leaves-a-false-successful-change-history-entry) |
| 82 | [TEST-T10.listener-error](components/core/t10-comments-and-listener-errors.test.tsx) | Comments subscription lacks a user-observable listener error path. | [T116][t-live] | [R04](#r04--listener-failures-do-not-reach-the-consumers-error-contract) |
| 83 | [TEST-T12.partial-promotion-retry](components/core/t12-promotion-consistency.test.tsx) | Retry after private completion failure duplicates organizational task creation. | [T92][t-consistency] | [R15](#r15--retried-promotion-duplicates-the-organizational-task) |
| 84 | [TEST-B04.child-scope-reset](components/operations/operations.component.test.tsx) | PortalReport displays A values under selected C; state not reset. | [T241][t-branch] | [R19](#r19--report-statedraft-crosses-a-branch-change) |
| 85 | [TEST-C03.production-sparse-task](components/operations/operations.component.test.tsx) | Contact panel crashes at contactRefs.includes on production sparse task. | [T194–204][t-task-contact] | [R08](#r08--actual-sparse-task-producers-break-downstream-readers) |
| 86 | [TEST-O04.dialog-focus](components/operations/operations.component.test.tsx) | Closing role modal fails to restore orgchart opener focus. | [T292][t-a11y] | [R17](#r17--custom-dialogs-do-not-preserve-keyboard-focus-behavior) |
| 87 | [TEST-O05.cycle-visible-or-error](components/operations/operations.component.test.tsx) | Cyclic roles disappear because neither becomes a rendered root. | [E56][e-org] | [R18](#r18--cyclic-hierarchy-nodes-silently-disappear) |
| 88 | [TEST-Q01.first-report-loading-race](components/operations/operations.component.test.tsx) | First-only fields appear before existing-report history finishes loading. | [T86][t-questions], [T116][t-live] | [R20](#r20--first-report-only-fields-render-before-history-resolves) |
| 89 | [TEST-Q03.branch-isolation](components/operations/operations.component.test.tsx) | A's retained values autosave under C's changed draft key. | [T241][t-branch] | [R19](#r19--report-statedraft-crosses-a-branch-change) |
| 90 | [TEST-F01.portal-login.invalid-shape.null](contracts/F01.test.ts) | JSON null causes uncaught destructuring TypeError. | [T134][t-validation] | [R35](#r35--json-and-field-types-reach-operations-before-full-validation) |
| 91 | [TEST-F01.portal-login.invalid-shape.wrong-field-type](contracts/F01.test.ts) | Non-string name reaches name.trim and throws. | [T134][t-validation] | [R35](#r35--json-and-field-types-reach-operations-before-full-validation) |
| 92 | [TEST-F01.portal-login.malformed-json](contracts/F01.test.ts) | JSON.parse error escapes instead of a client rejection. | [T134][t-validation] | [R35](#r35--json-and-field-types-reach-operations-before-full-validation) |
| 93 | [TEST-F01.summarize-article.invalid-shape.null](contracts/F01.test.ts) | Null destructuring becomes server 500, not validated client error. | [T134][t-validation] | [R35](#r35--json-and-field-types-reach-operations-before-full-validation) |
| 94 | [TEST-F01.summarize-article.invalid-shape.wrong-field-type](contracts/F01.test.ts) | Truthy non-string title passes guard into provider path, then 500. | [T134][t-validation] | [R35](#r35--json-and-field-types-reach-operations-before-full-validation) |
| 95 | [TEST-F01.summarize-article.malformed-json](contracts/F01.test.ts) | Malformed JSON returns 500 through generic catch. | [T134][t-validation] | [R35](#r35--json-and-field-types-reach-operations-before-full-validation) |
| 96 | [TEST-F08.summarize-unusable-config](contracts/F08.test.ts) | Missing/unusable captured key still permits an attempted outbound call. | [T268–273][t-secrets], [T136][t-safe-errors] | [R41](#r41--summarizer-attempts-outbound-work-with-unusable-configuration) |
| 97 | [TEST-N01.strict-production-compiler](contracts/toolchain/strict.test.ts) | Compiler resolves app config successfully but required strict mode is disabled. | [T31][t-strict] | [R45](#r45--production-compiler-configuration-does-not-enable-strict-mode) |
| 98 | [TEST-L04.emulator.hq-knowledge-mirror.requires-server-timestamp](emulator/core/l04-server-timestamps.test.ts) | Real mirror createdAt is an ISO string, not Timestamp. | [T92][t-consistency] | [R06](#r06--persisted-timestamps-are-missing-or-client-clock-strings) |
| 99 | [TEST-L04.emulator.role-writer.requires-server-timestamp](emulator/core/l04-server-timestamps.test.ts) | Real persisted role has undefined creation/update timestamps. | [T92][t-consistency] | [R06](#r06--persisted-timestamps-are-missing-or-client-clock-strings) |
| 100 | [TEST-L05.detail-live](emulator/core/l05-two-client-convergence.test.ts) | Second-client task update does not converge in open getDoc-based detail. | [E96][e-live] | [R28a](#task-detail-realtime-evidence) |
| 101 | [TEST-L05.research-live](emulator/core/l05-two-client-convergence.test.ts) | Persisted research changes never reach static library. | [E70–73][e-knowledge], [T116][t-live] | [R28](#r28--research-library-is-a-static-catalog-not-the-maintained-live-data) |
| 102 | [TEST-T08.emulator.counter-recovery](emulator/core/t08-attachment-storage-emulator.test.ts) | Real single counter fault leaves committed attachment/count mismatch. | [T92][t-consistency] | [R12](#r12--attachment-metadata-and-counter-writes-diverge) |
| 103 | [TEST-T08.emulator.storage-roundtrip](emulator/core/t08-attachment-storage-emulator.test.ts) | Persisted attachment URL is data:, with no SUT object in accessible bucket. | [T16–20][t-storage] | [R11](#r11--task-attachments-are-embedded-in-firestore-instead-of-storage) |
| 104 | [TEST-T09.emulator.dashboard-quick-update-history-gap](emulator/core/t09-status-history-emulator.test.ts) | Real dashboard status persists; history remains empty. | [E44][e-task] | [R13](#r13--quick-status-updates-omit-history) |
| 105 | [TEST-T09.emulator.kanban-inline-select-history-gap](emulator/core/t09-status-history-emulator.test.ts) | Real native-select status persists without history append. | [E44][e-task] | [R13](#r13--quick-status-updates-omit-history) |
| 106 | [TEST-T09.emulator.list-quick-update-history-gap](emulator/core/t09-status-history-emulator.test.ts) | Final run confirms status write before empty-history failure; list writer omits history. | [E44][e-task] | [R13](#r13--quick-status-updates-omit-history) |
| 107 | [TEST-F01.chat.invalid-shape.null](emulator/knowledge/contracts/F01.test.ts) | Authenticated JSON null reaches uncaught branchId destructuring. | [T134][t-validation] | [R35](#r35--json-and-field-types-reach-operations-before-full-validation) |
| 108 | [TEST-F01.chat.invalid-shape.wrong-field-type](emulator/knowledge/contracts/F01.test.ts) | Non-string branchId reaches Firestore doc() and throws. | [T134][t-validation] | [R35](#r35--json-and-field-types-reach-operations-before-full-validation) |
| 109 | [TEST-F01.chat.malformed-json](emulator/knowledge/contracts/F01.test.ts) | Authenticated malformed JSON throws outside a body-validation catch. | [T134][t-validation] | [R35](#r35--json-and-field-types-reach-operations-before-full-validation) |
| 110 | [TEST-F01.chat.media.missing](emulator/knowledge/contracts/F01.test.ts) | Missing Content-Type is accepted with 200; no media validation. | [T131][t-validation] | [R36](#r36--authenticated-chat-endpoints-ignore-request-media-type) |
| 111 | [TEST-F01.chat.media.wrong](emulator/knowledge/contracts/F01.test.ts) | Wrong Content-Type is accepted with 200; no media validation. | [T131][t-validation] | [R36](#r36--authenticated-chat-endpoints-ignore-request-media-type) |
| 112 | [TEST-F01.hq-chat.invalid-shape.null](emulator/knowledge/contracts/F01.test.ts) | Null body access becomes 500 instead of client rejection. | [T134][t-validation] | [R35](#r35--json-and-field-types-reach-operations-before-full-validation) |
| 113 | [TEST-F01.hq-chat.invalid-shape.wrong-field-type](emulator/knowledge/contracts/F01.test.ts) | Wrong body-field type reaches array operations and generic 500. | [T134][t-validation] | [R35](#r35--json-and-field-types-reach-operations-before-full-validation) |
| 114 | [TEST-F01.hq-chat.malformed-json](emulator/knowledge/contracts/F01.test.ts) | JSON parse failure is wrapped as server 500. | [T134][t-validation] | [R35](#r35--json-and-field-types-reach-operations-before-full-validation) |
| 115 | [TEST-F01.hq-chat.media.missing](emulator/knowledge/contracts/F01.test.ts) | Missing Content-Type still returns 200 after provider work. | [T131][t-validation] | [R36](#r36--authenticated-chat-endpoints-ignore-request-media-type) |
| 116 | [TEST-F01.hq-chat.media.wrong](emulator/knowledge/contracts/F01.test.ts) | Wrong Content-Type still returns 200 after provider work. | [T131][t-validation] | [R36](#r36--authenticated-chat-endpoints-ignore-request-media-type) |
| 117 | [TEST-F02.empty-digits-denial](emulator/knowledge/contracts/F02.test.ts) | Punctuation-only phone matches empty-normalized stored phone and returns 200. | [T66][t-rbac], [T134][t-validation] | [R37](#r37--coordinator-login-enumerates-names-and-accepts-empty-normalized-phones) |
| 118 | [TEST-F02.non-enumerating-failure](emulator/knowledge/contracts/F02.test.ts) | Unknown-name and wrong-phone responses differ, revealing name existence. | [T307][t-public] | [R37](#r37--coordinator-login-enumerates-names-and-accepts-empty-normalized-phones) |
| 119 | [TEST-F03.role-required](emulator/knowledge/contracts/F03.test.ts) | Branch member with non-coordinator role receives chat 200; role is never checked. | [T123][t-functions], [T133][t-validation] | [R38](#r38--function-authorization-lacks-a-positive-role-check) |
| 120 | [TEST-F04.missing-profile-denial](emulator/knowledge/contracts/F04.test.ts) | HQ handler accepts missing profile; only explicit coordinator is denied. | [T58–74][t-rbac], [T133][t-validation] | [R38](#r38--function-authorization-lacks-a-positive-role-check) |
| 121 | [TEST-F04.missing-role-denial](emulator/knowledge/contracts/F04.test.ts) | HQ handler accepts roleless profile with 200. | [T58–74][t-rbac], [T133][t-validation] | [R38](#r38--function-authorization-lacks-a-positive-role-check) |
| 122 | [TEST-F04.unknown-role-denial](emulator/knowledge/contracts/F04.test.ts) | HQ handler accepts unknown role with 200; no role allowlist. | [T58–74][t-rbac], [T133][t-validation] | [R38](#r38--function-authorization-lacks-a-positive-role-check) |
| 123 | [TEST-F05.chat.blank-content](emulator/knowledge/contracts/F05.test.ts) | Blank content forwarded and accepted, rather than rejected locally. | [T134][t-validation] | [R39](#r39--malformed-message-collectionsentries-are-not-rejected-safely) |
| 124 | [TEST-F05.chat.branchId-wrong-type](emulator/knowledge/contracts/F05.test.ts) | Numeric branchId causes real SDK path exception; no type guard. | [T134][t-validation] | [R35](#r35--json-and-field-types-reach-operations-before-full-validation) |
| 125 | [TEST-F05.chat.invalid-role](emulator/knowledge/contracts/F05.test.ts) | Invalid message role is sent to provider and returns 200. | [T134][t-validation] | [R39](#r39--malformed-message-collectionsentries-are-not-rejected-safely) |
| 126 | [TEST-F05.chat.messages-null](emulator/knowledge/contracts/F05.test.ts) | Null messages reaches map and throws uncaught. | [T134][t-validation] | [R39](#r39--malformed-message-collectionsentries-are-not-rejected-safely) |
| 127 | [TEST-F05.chat.messages-object](emulator/knowledge/contracts/F05.test.ts) | Object messages reaches map and throws uncaught. | [T134][t-validation] | [R39](#r39--malformed-message-collectionsentries-are-not-rejected-safely) |
| 128 | [TEST-F05.chat.nonstring-content](emulator/knowledge/contracts/F05.test.ts) | Non-string content forwarded successfully; message entry validation absent. | [T134][t-validation] | [R39](#r39--malformed-message-collectionsentries-are-not-rejected-safely) |
| 129 | [TEST-F05.hq-chat.invalid-role](emulator/knowledge/contracts/F05.test.ts) | HQ forwards invalid message role and returns 200. | [T134][t-validation] | [R39](#r39--malformed-message-collectionsentries-are-not-rejected-safely) |
| 130 | [TEST-F05.hq-chat.messages-object](emulator/knowledge/contracts/F05.test.ts) | Object messages causes array-operation error and 500. | [T134][t-validation] | [R39](#r39--malformed-message-collectionsentries-are-not-rejected-safely) |
| 131 | [TEST-F07.chat.provider-error-redaction](emulator/knowledge/contracts/F07.test.ts) | Raw upstream diagnostic marker reflected in error response. | [T136][t-safe-errors] | [R40](#r40--api-failures-reflect-unredacted-providertransport-detail) |
| 132 | [TEST-F07.hq-chat.partial-source-error-redaction](emulator/knowledge/contracts/F07.test.ts) | Successful partial reply appends unredacted failed-source diagnostic. | [T136][t-safe-errors] | [R40](#r40--api-failures-reflect-unredacted-providertransport-detail) |
| 133 | [TEST-F07.hq-chat.provider-error-redaction](emulator/knowledge/contracts/F07.test.ts) | Parsed/raw provider error detail reaches client without redaction. | [T136][t-safe-errors] | [R40](#r40--api-failures-reflect-unredacted-providertransport-detail) |
| 134 | [TEST-F08.configured-firestore-failure-redaction](emulator/knowledge/contracts/F08.test.ts) | Configured health response exposes real injected Firestore transport detail. | [T136][t-safe-errors] | [R40](#r40--api-failures-reflect-unredacted-providertransport-detail) |
| 135 | [TEST-F08.configured-provider-failure-redaction](emulator/knowledge/contracts/F08.test.ts) | Configured health response exposes synthetic upstream diagnostic marker. | [T136][t-safe-errors] | [R40](#r40--api-failures-reflect-unredacted-providertransport-detail) |
| 136 | [TEST-H03.source.reports](emulator/knowledge/H03.test.tsx) | Stored data.note omitted from provider context because formatter reads answers. | [T85][t-report-schema], [E92][e-report-ai] | [R31](#r31--hq-report-context-reads-a-different-answer-field-from-its-writer) |
| 137 | [TEST-H05.task-evidence-reaches-context](emulator/knowledge/H05.test.tsx) | Valid task facts never enter context; handler has no task source query. | [E77][e-ai] | [R34](#r34--hq-ai-context-never-collects-tasks) |
| 138 | [TEST-H07.scope-session-isolation](emulator/knowledge/H07.test.tsx) | B save reuses A session ID and fails at nonexistent B document. | [T90][t-history], [T153][t-ai-scope] | [R05](#r05--identitybranch-changes-retain-prior-scope-data-or-session-state) |
| 139 | [TEST-B03.atomic-coordinator-links](emulator/operations/operations.emulator.test.tsx) | Second actual page writer replaces arrays and loses committed coordinator B. | [T92][t-consistency], [T214–216][t-branch-ops] | [R22](#r22--coordinator-link-replacement-loses-another-clients-committed-link) |
| 140 | [TEST-Q07.atomic-question-reorder](emulator/operations/operations.emulator.test.tsx) | Real partial swap persists order 2 for both questions; writes not atomic. | [T92][t-consistency] | [R21](#r21--independent-question-order-writes-leave-duplicate-ordering) |
| 141 | [TEST-S01.missing-role-read.branches](emulator/rules/security-boundaries.test.ts) | Roleless authenticated branch read succeeds under isAuthed-only rule. | [T58–74][t-rbac] | [R42](#r42--authenticated-data-reads-bypass-the-required-profilerole-matrix) |
| 142 | [TEST-S01.missing-role-read.knowledge_articles](emulator/rules/security-boundaries.test.ts) | Roleless authenticated research read succeeds; no profile-role predicate. | [T58–74][t-rbac] | [R42](#r42--authenticated-data-reads-bypass-the-required-profilerole-matrix) |
| 143 | [TEST-S01.missing-role-read.knowledgeItems](emulator/rules/security-boundaries.test.ts) | Roleless authenticated knowledge read succeeds under broad read rule. | [T58–74][t-rbac] | [R42](#r42--authenticated-data-reads-bypass-the-required-profilerole-matrix) |
| 144 | [TEST-S01.missing-role-read.reportQuestions](emulator/rules/security-boundaries.test.ts) | Roleless authenticated question read succeeds; role ignored. | [T58–74][t-rbac] | [R42](#r42--authenticated-data-reads-bypass-the-required-profilerole-matrix) |
| 145 | [TEST-S01.no-profile-read.branches](emulator/rules/security-boundaries.test.ts) | Profileless authenticated branch read succeeds; profile existence unchecked. | [T58–74][t-rbac] | [R42](#r42--authenticated-data-reads-bypass-the-required-profilerole-matrix) |
| 146 | [TEST-S01.no-profile-read.knowledge_articles](emulator/rules/security-boundaries.test.ts) | Profileless authenticated research read succeeds under isAuthed. | [T58–74][t-rbac] | [R42](#r42--authenticated-data-reads-bypass-the-required-profilerole-matrix) |
| 147 | [TEST-S01.no-profile-read.knowledgeItems](emulator/rules/security-boundaries.test.ts) | Profileless authenticated knowledge read succeeds; profile-role validation absent. | [T58–74][t-rbac] | [R42](#r42--authenticated-data-reads-bypass-the-required-profilerole-matrix) |
| 148 | [TEST-S01.no-profile-read.reportQuestions](emulator/rules/security-boundaries.test.ts) | Profileless authenticated question read succeeds under broad rule. | [T58–74][t-rbac] | [R42](#r42--authenticated-data-reads-bypass-the-required-profilerole-matrix) |
| 149 | [TEST-S03.foreign-branch-read](emulator/rules/security-boundaries.test.ts) | A coordinator reads B branch; branch read lacks membership gate. | [T241][t-branch] | [R43](#r43--coordinator-branch-scope-is-absent-from-branchknowledge-rules) |
| 150 | [TEST-S03.foreign-knowledge-mutation](emulator/rules/security-boundaries.test.ts) | Coordinator moves item into foreign branch; write lacks branch scope. | [T241][t-branch] | [R43](#r43--coordinator-branch-scope-is-absent-from-branchknowledge-rules) |
| 151 | [TEST-S03.foreign-knowledge-read](emulator/rules/security-boundaries.test.ts) | A coordinator reads B knowledge; authenticated-only read rule. | [T241][t-branch] | [R43](#r43--coordinator-branch-scope-is-absent-from-branchknowledge-rules) |
| 152 | [TEST-S06.foreign-delete.hq_knowledge/item-a/proof.txt](emulator/rules/security-boundaries.test.ts) | Unrelated coordinator deletes proven HQ-prefix object; ownership unchecked. | [T306][t-file-owner] | [R44](#r44--storage-permits-unrelated-authenticated-overwritedelete) |
| 153 | [TEST-S06.foreign-delete.knowledge_articles/article-a/proof.txt](emulator/rules/security-boundaries.test.ts) | Unrelated coordinator deletes proven research-prefix object; auth-only writes. | [T306][t-file-owner] | [R44](#r44--storage-permits-unrelated-authenticated-overwritedelete) |
| 154 | [TEST-S06.foreign-overwrite.hq_knowledge/item-a/proof.txt](emulator/rules/security-boundaries.test.ts) | Unrelated coordinator overwrites existing HQ file; no owner/ACL check. | [T306][t-file-owner] | [R44](#r44--storage-permits-unrelated-authenticated-overwritedelete) |
| 155 | [TEST-S06.foreign-overwrite.knowledge_articles/article-a/proof.txt](emulator/rules/security-boundaries.test.ts) | Unrelated coordinator overwrites existing research file; no owner/ACL check. | [T306][t-file-owner] | [R44](#r44--storage-permits-unrelated-authenticated-overwritedelete) |

### Task-detail realtime evidence

**R28a** is separate from the static research-library cause. [E96][e-live]
requires changes “`ללא צורך ברענון ידני`”.
[TaskDetailPage](../../src/pages/TaskDetailPage.tsx#L58-L79) reads its main task
with `getDoc`; nested comments/history subscriptions do not refresh that document.
Example: a second client successfully changes an already-open task's title,
but the title remains stale until reopening. Browser E04 and emulator L05
independently exercise this. [Core results](CORE-RESULTS.md),
[browser verdict](RULES-BROWSER-RESULTS.md#browser-reviewer-tracking).

## Non-failure exclusions and audit boundary

F09 platform correlation/logging is manual/deployment evidence, not an automated
response-ID requirement; its retired tests do not belong among 155. Future
scheduler/AI writes/FCM/offline/splitting and unresolved policies remain explicit
in [RESULTS.md](RESULTS.md#limits-and-unimplemented-evidence). No B01 dedicated
type-filter button, O03 dashboard linked-task title, KeyboardSensor, exact
error-object representation, or protected-header byte defect is asserted.
Content exclusion is not a product finding.

The latest K/H owner analysis supersedes the older browser summary that described
K03 local-storage as a completed Storage verdict: the actual failed save prevents
that downstream conclusion. The older core individual review's inconclusive
T09 list run is retained as history; final runtime/owner evidence and the
refreshed distinct-review record establish the current clean history failure.
The parent's final global review/callback consolidation remains outstanding.
These limits do not change the exact failed case membership.

[t-storage]: ../../docs/requirements/technical-specification.he.md#L16-L20
[t-strict]: ../../docs/requirements/technical-specification.he.md#L31
[t-calendar]: ../../docs/requirements/technical-specification.he.md#L40
[t-rbac]: ../../docs/requirements/technical-specification.he.md#L58-L74
[t-report-schema]: ../../docs/requirements/technical-specification.he.md#L85
[t-questions]: ../../docs/requirements/technical-specification.he.md#L86
[t-history]: ../../docs/requirements/technical-specification.he.md#L90
[t-consistency]: ../../docs/requirements/technical-specification.he.md#L92
[t-live]: ../../docs/requirements/technical-specification.he.md#L94-L116
[t-functions]: ../../docs/requirements/technical-specification.he.md#L123-L124
[t-summary]: ../../docs/requirements/technical-specification.he.md#L126
[t-validation]: ../../docs/requirements/technical-specification.he.md#L131-L134
[t-safe-errors]: ../../docs/requirements/technical-specification.he.md#L136
[t-ai-scope]: ../../docs/requirements/technical-specification.he.md#L153
[t-grounding]: ../../docs/requirements/technical-specification.he.md#L159
[t-task]: ../../docs/requirements/technical-specification.he.md#L194-L196
[t-task-contact]: ../../docs/requirements/technical-specification.he.md#L194-L204
[t-branch-ops]: ../../docs/requirements/technical-specification.he.md#L214-L216
[t-knowledge]: ../../docs/requirements/technical-specification.he.md#L222-L224
[t-branch]: ../../docs/requirements/technical-specification.he.md#L241
[t-secrets]: ../../docs/requirements/technical-specification.he.md#L268-L273
[t-a11y]: ../../docs/requirements/technical-specification.he.md#L292
[t-file-owner]: ../../docs/requirements/technical-specification.he.md#L306
[t-public]: ../../docs/requirements/technical-specification.he.md#L307
[e-domain]: ../../docs/requirements/executive-summary.he.md#L29
[e-task]: ../../docs/requirements/executive-summary.he.md#L44
[e-recurrence]: ../../docs/requirements/executive-summary.he.md#L48
[e-org]: ../../docs/requirements/executive-summary.he.md#L56
[e-knowledge]: ../../docs/requirements/executive-summary.he.md#L68-L73
[e-ai]: ../../docs/requirements/executive-summary.he.md#L77
[e-private]: ../../docs/requirements/executive-summary.he.md#L81
[e-contacts]: ../../docs/requirements/executive-summary.he.md#L85
[e-report-ai]: ../../docs/requirements/executive-summary.he.md#L91-L92
[e-live]: ../../docs/requirements/executive-summary.he.md#L96

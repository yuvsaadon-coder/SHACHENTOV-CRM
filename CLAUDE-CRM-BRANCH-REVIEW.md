# Review: `claude/crm-shachen-tov-gwm5ew`

**Reviewed target:** `origin/claude/crm-shachen-tov-gwm5ew` at `60548f8`  
**Merge base:** `d1b4a9a` on `origin/main`  
**Review scope:** 152 files, about 60,000 added lines

## Executive summary

This branch delivers a broad React/TypeScript CRM implementation: task and organization
management, coordinator workflows, quarterly reporting, knowledge libraries, Firebase
authentication and storage, Netlify Functions, Anthropic-backed chatbots, seed/migration
scripts, and basic automated tests.

The application has a promising feature set and generally clear domain modeling, but it
should **not be deployed in its current state**. The review identified one critical
credential/PII exposure, three high-severity authorization or cost-abuse risks, and several
data-integrity defects. The highest priority is to replace the coordinator authentication
scheme, remove sensitive operational data from public assets and repository history, and
tighten all server-side authorization rules.

| Priority | Finding | Severity | Recommended release decision |
|---|---|---:|---|
| P0 | Coordinator phone numbers act as exposed credentials | Critical | Block deployment |
| P0 | HQ chatbot accepts unprovisioned Firebase users | High | Block deployment |
| P0 | Firestore/Storage knowledge rules allow cross-scope access | High | Block deployment |
| P0 | Public functions can consume Anthropic budget | High | Block deployment |
| P1 | Recurring-task rollover can undo valid completions | High | Fix before production |
| P1 | Quarterly reports can duplicate or mix period data | Medium | Fix before production |
| P1 | HQ chatbot reads the wrong report data field | Medium | Fix before production |
| P1 | HQ knowledge mirrors become stale and lose attachments | Medium | Fix before production |
| P1 | Inline task status changes can be silently reverted | Medium | Fix before production |
| P1 | New tasks can omit their required frequency | Medium | Fix before production |
| P1 | Netlify Node version conflicts with `firebase-admin` | Medium | Fix before deployment |
| P2 | CSV export permits spreadsheet formula injection | Medium | Fix before broad use |

## Detailed findings

### 1. Coordinator credentials and personal data are publicly exposed

**Severity:** Critical  
**Locations:** `scripts/seedCoordinators.ts:44-180`,
`netlify/functions/portal-login.ts:25-55`,
`public/templates/tafkidim-veanshei-kesher-2026.xlsx`

The coordinator portal treats a coordinator's phone number as the authentication secret.
The same names and phone numbers are embedded in a seed script and a spreadsheet under
`public/`. Vite publishes all `public/` files unchanged, so a visitor can download the
spreadsheet, submit a matching name and phone number to `portal-login`, receive a Firebase
custom token, and sign in as that coordinator. Phone-derived Firebase credentials are also
predictable. The endpoint has no rate limiting or lockout and distinguishes unknown users
from incorrect phone numbers.

**Required fix**

1. Rotate all affected coordinator credentials and revoke active Firebase sessions.
2. Remove personal contact data from source and deployable assets; purge it from reachable
   Git history and invalidate deployed or cached copies.
3. Replace name-plus-phone authentication with SMS OTP, email magic links, or random
   centrally issued credentials that require rotation.
4. Disable predictable email/password credentials for custom-token accounts.
5. Add generic authentication errors, rate limiting, exponential backoff or lockout, and
   authentication audit logs.

### 2. The HQ chatbot authorizes unprovisioned Firebase identities

**Severity:** High  
**Location:** `netlify/functions/hq-chat.ts:64-73`

The function rejects a user only when a `/users/{uid}` document exists and its role is
exactly `coordinator`. A valid Firebase identity with no user document, no role, or an
unexpected role passes the check. Since the function uses Firebase Admin, Firestore rules
do not protect the HQ, branch, and report data it reads.

**Required fix**

- Deny access when the user document is missing, inactive, or lacks an explicitly allowed
  HQ role.
- Use an allowlist such as `admin` and the exact approved HQ roles; do not authorize by
  "not coordinator."
- Centralize the role policy used by functions and Firebase rules.
- Test valid tokens for missing-user, missing-role, inactive, coordinator, HQ, and admin
  accounts.

### 3. Knowledge rules allow cross-branch reads and destructive writes

**Severity:** High  
**Locations:** `firestore.rules:57-60`, `storage.rules:4-11`

Every authenticated user can read all `knowledgeItems`, while every coordinator can write
all of them. Coordinators can therefore access other branches, alter global records, change
branch ownership, or delete records they do not own by calling Firebase directly. Storage
is broader still: any authenticated identity can write to HQ and research prefixes.

**Required fix**

- Let coordinators read only global items and items for branches they coordinate.
- On create, require an allowed branch ID and `createdBy == request.auth.uid`.
- On update, make branch and ownership fields immutable.
- Restrict update/delete to the document owner, a coordinator for that branch, or an admin,
  according to a documented role matrix.
- Require admin authorization for HQ/research Storage writes and validate path, size, and
  content type.
- Add Firebase Emulator tests with at least two users and two branches, covering reads,
  creates, updates, deletes, cross-branch access, and privilege escalation attempts.

### 4. Public functions can consume paid Anthropic capacity

**Severity:** High  
**Locations:** `netlify/functions/hq-chat-health.ts:15-94`,
`netlify/functions/summarize-article.ts:5-51`

Both functions can be invoked without verified authentication. Each request to
`summarize-article` can generate a substantial model response; the health endpoint performs
Firestore reads and a live Anthropic request. Repeated calls can consume API budget and
serverless capacity. The health response also exposes project metadata and raw dependency
errors.

**Required fix**

- Verify a Firebase ID token and require an admin role in both handlers.
- Remove the active health endpoint from production, or place it behind admin
  authentication and a disabled-by-default feature flag.
- Use passive or cached dependency status instead of a paid model call per health request.
- Add edge/function rate limits and strict request-body size limits.
- Return sanitized client errors while retaining detailed diagnostics only in protected
  server logs.

### 5. Recurring-task rollover can immediately undo a completion

**Severity:** High  
**Locations:** `src/hooks/useRecurringTaskReset.ts:43-72`,
`src/pages/TasksPage.tsx:65-68`

The reset hook advances a stale cycle only if the task status is not already "not done."
An open task can therefore retain an old cycle key. If a user later completes it, the
listener sees the stale key and resets the new completion immediately. Rollover also occurs
only when an admin visits one page, relies on the browser clock, does not surface commit
failure, and can exceed Firestore's 500-write batch limit.

**Required fix**

- Move rollover to a scheduled trusted backend job.
- Always advance a stale cycle key, even when status already equals the reset status.
- Use server-controlled time and bounded batches of fewer than 500 writes.
- Retry failures and publish operational metrics/logs.
- Test every recurrence frequency, stale-open and stale-complete tasks, concurrent updates,
  year boundaries, and more than 500 due tasks.

### 6. Quarterly-report identity and draft handling can corrupt data

**Severity:** Medium  
**Locations:** `src/pages/portal/PortalReport.tsx:164-215,237-248,289-305`,
`firestore.rules:62-69`

The uniqueness check is client-side while submission uses `addDoc`. Concurrent submissions
for the same branch/year/quarter can both succeed. Draft answers are keyed only by branch,
so switching year or quarter can carry answers into the wrong report. A pending debounce
can also recreate a draft immediately after successful submission.

**Required fix**

- Derive a deterministic document ID from branch, year, and quarter.
- Create transactionally and reject an existing report.
- Enforce the document ID and immutable natural-key fields in Firestore rules.
- Key draft and in-memory values by branch/year/quarter; reload or reset when period changes.
- Cancel the autosave timer before removing a submitted draft.
- Test concurrent submission, period switching, reload recovery, and immediate
  edit-then-submit.

### 7. The HQ chatbot reads a report field that is never written

**Severity:** Medium  
**Location:** `netlify/functions/hq-chat.ts:184-197`

The portal stores responses in `QuarterlyReport.data`, but the chatbot reads `answers`.
The generated context therefore contains report labels but no answers.

**Required fix**

Read and type `data.data` as the report response map, serialize rating/structured values in
the same format used by the report UI, and add an integration test that submits a report
then verifies its answers appear in the chatbot context.

### 8. HQ knowledge mirroring loses attachments and retains deleted content

**Severity:** Medium  
**Location:** `src/hooks/useHQKnowledge.ts:8-21,127-130`

The mirror writes an attachment URL as `storageUrl`, while the coordinator model/UI expects
`fileUrl`. Deleting a shared HQ item removes only the primary record, leaving the mirrored
`knowledgeItems/hq-{id}` document and Storage object accessible.

**Required fix**

- Define one shared schema/mapper and consistently write `fileUrl`.
- Treat the primary document, mirror, and object deletion as one logical operation.
- Prefer a trusted backend trigger or callable function so a closed browser cannot leave
  partial state.
- Test create, update, share, unshare, and delete with and without an attachment.

### 9. A later edit can revert an inline task status change

**Severity:** Medium  
**Location:** `src/pages/TaskDetailPage.tsx:249-264`

The inline handler updates Firestore and `task`, but not the independent `form` state. If
the user then edits another field, saving spreads the stale form and writes the old status
back.

**Required fix**

Update both states after the inline mutation, or initialize the edit form from the current
task every time edit mode opens. Add a regression test for an inline status change followed
by editing an unrelated field.

### 10. A new task can omit its required frequency

**Severity:** Medium  
**Location:** `src/pages/TaskDetailPage.tsx:60-64,124-132,367-378`

The new-task form visually presents frequency choices, but the default form state does not
initialize `frequency`. Saving without touching the selector creates an incomplete task
that recurring logic and filters may ignore.

**Required fix**

Initialize `frequency: 'חד-פעמי'` and every other required field, validate the final payload
before writing, and enforce the allowed task schema in Firestore rules.

### 11. The configured Netlify runtime is incompatible with Firebase Admin

**Severity:** Medium  
**Locations:** `netlify.toml:30-32`, `package.json:25`,
`package-lock.json:2982-2997`

Netlify is pinned to Node 20, while the locked `firebase-admin@14.2.0` declares Node 22 or
newer. Installation emits an engine warning and functions may fail at startup or when they
reach APIs unavailable in Node 20.

**Required fix**

Pin an exact supported Node 22 release for builds and functions, add the matching
`package.json` `engines` requirement, and run a Netlify-compatible function cold-start
smoke test in CI.

### 12. CSV export permits spreadsheet formula injection

**Severity:** Medium  
**Location:** `src/pages/ReportsPage.tsx:175-203`

A coordinator response beginning with `=`, `+`, `-`, or `@` is quoted as CSV but remains a
formula when opened in Excel or similar software. It can create misleading links or
external requests.

**Required fix**

Normalize untrusted cells before CSV escaping by prefixing formula-like content with an
apostrophe or otherwise forcing text interpretation. Put this behavior in the shared
export helper and test all formula prefixes plus tabs, line breaks, quotes, and commas.

## Architecture and maintainability feedback

1. **Define one authorization matrix.** Client routes, Firestore rules, Storage rules, and
   functions currently interpret HQ/admin/coordinator differently. Document the permitted
   operations by role and resource, then make every boundary implement the same allowlist.
2. **Move system lifecycle work off the client.** Recurrence rollover and denormalized
   knowledge synchronization need scheduled jobs or trusted triggers, observability, and
   retries rather than React side effects.
3. **Give reports a natural identity.** Branch/year/quarter belongs in a deterministic key
   enforced by rules and transactional writes.
4. **Separate deployable and operational assets.** Seed inputs, personal contact data,
   migrations, and internal templates should live in access-controlled operational storage,
   not in public web assets.
5. **Reduce duplicated schemas.** Shared report and knowledge serializers should be used by
   writers, readers, exports, and chatbot context generation.
6. **Add tests at trust boundaries.** Current tests emphasize UI helpers and accessibility,
   but the highest-risk behavior is in Firebase rules, functions, report transactions,
   recurrence rollover, and mirror cleanup.
7. **Avoid committing generated archives.** `shachentovcrmsource.zip` duplicates source and
   creates review, storage, and stale-code risk. Build artifacts should be generated in CI
   or attached to releases instead.

## Positive feedback

- The feature coverage is substantial and the domain types provide a useful foundation.
- The coordinator chatbot verifies Firebase tokens and checks branch membership before
  loading branch knowledge.
- Firestore writes generally use `serverTimestamp()` instead of client timestamps.
- User text is rendered through React rather than injected as raw HTML.
- Explicit Firestore and Storage rules are present rather than relying only on route guards.
- Stable report-question keys preserve labels for historical reports.
- The HQ chatbot isolates source-loading failures so one unavailable collection does not
  necessarily fail the whole response.
- TypeScript compilation succeeds.

## Recommended remediation order

### P0: before any deployment

1. Rotate coordinator credentials, revoke sessions, remove PII from public assets and Git
   history, and replace phone-as-password authentication.
2. Correct function authorization and lock paid AI endpoints behind verified role checks
   and rate limits.
3. Rewrite Firestore and Storage knowledge authorization, then prove it with Emulator tests.
4. Upgrade the deployment runtime to Node 22 and cold-start every function.

### P1: before production use

1. Move recurring rollover to a backend job.
2. Make quarterly reports transactional and period-scoped.
3. Fix the chatbot report field and knowledge mirror lifecycle.
4. Fix task form/status state consistency and required defaults.
5. Neutralize spreadsheet formulas in exports.

### P2: before broader rollout

1. Add realistic authenticated Playwright workflows.
2. Add CI for clean install, TypeScript, unit tests, production build, Firebase Emulator
   suites, and Netlify function smoke tests.
3. Remove generated archives and classify all templates/research assets as public or
   protected before shipping.

## Suggested acceptance criteria

- No coordinator can authenticate using data available from the repository or public site.
- Every function denies missing, invalid, unprovisioned, inactive, and unauthorized users.
- A coordinator cannot read or mutate another branch's private data through the Firebase SDK.
- Unauthenticated requests cannot trigger Anthropic calls.
- A recurring task crosses each supported boundary exactly once without losing a completion.
- Exactly one report exists per branch/year/quarter under concurrent submission.
- Switching reporting periods never carries unsaved answers across periods.
- Chatbot report context contains the same answers displayed in the report UI.
- Sharing/unsharing/deleting knowledge leaves Firestore and Storage in consistent state.
- Task status survives subsequent unrelated edits, and every new task has a valid frequency.
- CSV exports treat all user-entered values as data, never executable formulas.

## Review validation notes

- The remote comparison was made against the merge base with `origin/main`; the merge base
  contains no application source, so the findings are introduced by this branch rather than
  inherited application defects.
- TypeScript compilation completed successfully.
- A clean dependency installation completed with a Node engine warning.
- In the Windows review environment, build/test startup was blocked by missing platform
  native optional bindings for Rolldown/Lightning CSS after clean lockfile installation.
  This should be reproduced in CI rather than treated as proof of a product-code failure.
- Dependency audit output included a high-severity advisory for `xlsx` and moderate
  transitive advisories. Their application exploitability was not established during this
  code review, but dependencies should be updated or replaced before release.

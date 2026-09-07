# Knowledge features — current 46-case verification

**Production baseline:** `60548f8`, unchanged. **Authoritative current manifest:** [knowledge-feature-final46.json](artifacts/knowledge-feature-final46.json).

Manifest SHA-256: `fb5e57f3da64c98fcee1773fa984d2a16b252d6626367afa379ac1ad60b50580`.

**Final combined closure corroborates all 46 verdicts: 24 passed, 22 normally failed.** All IDs, statuses, classifications, lanes and recorded source fingerprints match the complete reviewed manifest. [Closure verification record](artifacts/knowledge-closure-check.json) links the unchanged review map to the final combined outputs.

All 46 have a distinct mapped verifier: six fresh result reviews and 40 source/status-matched carried reviews when the map was built. No pending case review, skipped case, expected-failure inversion, or unresolved test-fixture verdict remains in this map. These are requirement-test outcomes, not 22 distinct root causes or approval of the application. The parent retains final cross-area review/release ownership.

## Current evidence and scope

| Input | K/H cases | Passed | Failed | Scope note |
|---|---:|---:|---:|---|
| [browser-closure.json](artifacts/browser-closure.json) | 30 | 11 | 19 | Native knowledge subset of final 58-case browser closure |
| [emulator-closure.json](artifacts/emulator-closure.json) | 13 | 10 | 3 | H03/H04/H05/H07 subset of final 184-case emulator closure |
| [behavior-verified.json](artifacts/behavior-verified.json) | 3 | 3 | 0 | H01 subset of final 197-case behavior verification |
| **Total** | **46** | **24** | **22** | Complete current K/H inventory |

The full closure inputs are **browser 58 = 29 passed / 29 failed**, **emulator 184 = 126 passed / 58 failed**, and **behavior 197 = 127 passed / 70 failed**. Browser native 30 = 11/19; other 28 = 18/10. Failures outside K/H are preserved in those inputs, not hidden by filtering or claimed as reviewed here.

For final closure, **every source fingerprint recorded by the 46-case manifest still matches current disk bytes**, and all 46 closure identities/statuses/classifications/lanes match. No new K/H source or verdict change was needed. The earlier six-fresh/40-carried construction and its historical source-comparison limits remain recorded in the manifest; this closure check adds a direct byte-fingerprint gate against that completed map.

Artifacts:

- [Current 46-case review manifest](artifacts/knowledge-feature-final46.json): every case, classification, independently reviewed group-run failure/attachments, source location, cause, actual reviewer name/agent ID/model, fresh-versus-carried mode, source fingerprints, full group-input hashes and suite diagnostics.
- [Final closure verification](artifacts/knowledge-closure-check.json): complete 46-case carry check, unchanged manifest/source fingerprints, three final input hashes and counts, and log/error accounting. The original group-input review manifest remains immutable.
- [Six fresh reviews](artifacts/knowledge-current-six-reviews.json): current six verdicts, evidence, actual identities and consolidation corrections.
- [Final browser log](artifacts/browser-closure.log), [final emulator log](artifacts/emulator-closure.log), and [verified behavior log](artifacts/behavior-verified.log): combined closure evidence.
- [Original browser group log](artifacts/browser-final.log) and [refreshed H01 group log](artifacts/knowledge-components-current.log) remain preserved as earlier review provenance.
- [Preparation record](artifacts/knowledge-consistency-preparation.json): historical pre-execution design/hashes. Its then-unexecuted status is not the current execution status.
- Original [43-case manifest](artifacts/knowledge-feature-final.json) and [historical individual reviews](artifacts/knowledge-feature-individual-reviews.json) remain unchanged as provenance; **do not use their counts as the current inventory**.

The group manifest was generated and lint-checked before closure. **Do not regenerate or overwrite frozen group artifacts during final validation.** The report-only closure record corroborates the same map without modifying the frozen generator, tests, support files or configurations.

### Suite/error accounting

- Final browser runner errors: **none**; **zero skipped/flaky cases**. All 30 native cases have one ordinary result and expected status `passed`.
- Final emulator JSON contains all **184 assertion records**, with no unmatched failed file, pending case or todo. The final emulator log has **zero unhandled runner-error headings**, agreeing with the parent's zero-unhandled closure.
- The verified behavior log likewise has no unhandled runner-error headings; H01's three cases pass in that final input.
- Application-level browser/Vite rejection diagnostics are kept distinct from runner errors and are not treated as proof that the application handled an error correctly.
- This worker performed only read-only closure comparisons and reporting updates, with **no source edits or service starts**. The parent executed the combined closure.
- Protected `HQChatPage.tsx` Authorization bytes were not read, reconstructed or inferred. Baseline identity is checked through git metadata; H01 supplies black-box component behavior only.

## Raw requirement anchors

- [Executive L29](../../docs/requirements/executive-summary.he.md#L29): “מנהלי תחום רואים כברירת מחדל את התחום שלהם”.
- [Executive L68–73](../../docs/requirements/executive-summary.he.md#L68-L73): local coordinator knowledge and organizational library; “לחיפוש ולסינון לפי תחום, קטגוריה ותגיות”.
- [Technical L92](../../docs/requirements/technical-specification.he.md#L92): “דה-נורמליזציה שמתבצעת בצד הלקוח דורשת טרנזקציות, מנגנוני תיקון ובדיקות עקביות”.
- [Technical L94–116](../../docs/requirements/technical-specification.he.md#L94-L116): realtime hooks, including chat history, with an error contract and correct subscription/error management.
- [Technical L153](../../docs/requirements/technical-specification.he.md#L153): model data limited “לפי זהות, role, domain וסניף”.
- [Executive L77](../../docs/requirements/executive-summary.he.md#L77): HQ questions over tasks/knowledge/reports/research and a separate branch-focused assistant.
- [Executive L91–92](../../docs/requirements/executive-summary.he.md#L91-L92): quarter/year reporting and AI answers including missing reports and volunteer challenges.
- [Technical L126/L159](../../docs/requirements/technical-specification.he.md#L126): “סיכום תוכן דרך Claude”; [source grounding](../../docs/requirements/technical-specification.he.md#L159): “תשובות מבוססות מקורות וציון המקור”.

The parent definitively adjudicated **K05/K07 atomicity** from raw L92, not the weaker earlier plan wording. A committed mixed state is a genuine transaction/consistency violation even if a later explicit retry repairs it.

## Six revised/new cases — actual current outcomes

Detailed examples are from the frozen group-run evidence independently reviewed by the six leaves. Final closure corroborates every source/status; synthetic record IDs quoted below identify that reviewed group run, not the later closure's newly seeded records.

| Case | Result / fresh verifier | Actual evidence and bounded conclusion |
|---|---|---|
| [TEST-K05.mirror-write-failure-recovery](browser/knowledge/K01-K07.spec.ts#L238) G | **Failed — KH-V46** | Before any test retry, settled Admin reads show new source content and old mirror content. Fault counter proves injection; source commit/error shape are diagnostics, not prerequisites. A proper rollback or matching committed pair can pass. |
| [TEST-K05.retry-recovery](browser/knowledge/K01-K07.spec.ts#L271) A | **Passed — KH-V47** | Actual hook retry converges. Fresh source and mirror collections are both cardinality one, with the requested title/content and correct source/mirror linkage. **Successful no-file recovery**, not failed recovery and not a rebuttal of atomicity G. |
| [TEST-K07.second-write-failure](browser/knowledge/K01-K07.spec.ts#L356) G | **Failed — KH-V48** | Actual admin page settles after mirror rejection; fresh state is **one source / zero mirrors**. No required pageerror or prior source commit. Zero/zero rollback is permitted; no retry/error-visibility assertion is masked inside this case. |
| [TEST-K07.error-visibility](browser/knowledge/K01-K07.spec.ts#L373) G | **Failed — KH-V49** | Actual persistent conflict occurs and retained panel becomes ready again, but no visible error alert appears. This failure is independent of the atomicity assertion. |
| [TEST-K07.retry-idempotency](browser/knowledge/K01-K07.spec.ts#L383) G | **Failed — KH-V50** | Same retained panel is saved again after fault release, then reloaded. Fresh state is **two sources / one mirror**. Original `custom-1788759019871` remains orphaned; new `custom-1788759020102` owns the only mirror. This is now executed evidence, not the earlier prediction. |
| [TEST-H07.save-failure-visible](browser/knowledge/H02-H06-H07.spec.ts#L40) G | **Failed — KH-V51** | Valid reply renders, real history fault occurs, no session persists, and no save warning is visible. Mandatory unhandled-pageerror assertions are gone; correctly caught errors with feedback can pass. |

Current production causes:

- [HQ update](../../src/hooks/useHQKnowledge.ts#L97-L124) separately commits source then mirror. K05 A demonstrates explicit retry convergence; K05 G separately demonstrates the initial atomicity violation.
- [Research save](../../src/pages/admin/KnowledgeAdminPage.tsx#L320-L369) separately writes both collections, exposes no caught/UI error state, and allocates `custom-${Date.now()}` on **each** Save. The actual retry creates a new pair without repairing/removing the first orphan.
- [Portal chat save](../../src/pages/portal/PortalChat.tsx#L61-L74) invokes `void saveSession(withReply)` without observing persistence failure.

The real conflict seam changes only a request precondition and counts actual injections. The current runtime exercises WebChannel/persistent-fault paths. Support for transaction `documents:commit` is statically prepared for a corrected transactional writer, **not claimed runtime-covered by the unchanged baseline writer**.

## All 22 failed cases — actual versus required

Every row has a mapped independent verifier below. Related rows can share a root cause; none depends on its G label as evidence.

| Failed case / actual test | Hebrew authority | Actual behavior, production cause, and why fixture/environment error is excluded |
|---|---|---|
| [K01.domain-default](browser/knowledge/K01-K07.spec.ts#L47) | [E29: ברירת מחדל](../../docs/requirements/executive-summary.he.md#L29) | Actual settled FIN user sees the VOL-only item. [Page initializes `all`](../../src/pages/HQKnowledgePage.tsx#L367-L380). All FIN/all/VOL items came from the real writer. This is default filtering, not an invented access-denial policy. |
| [K02.local-create-with-sparse-fields](browser/knowledge/K01-K07.spec.ts#L58) | [E68–73: מרחב מקומי](../../docs/requirements/executive-summary.he.md#L68-L73) | Valid real link form cannot persist because its produced payload contains undefined file fields. [Modal payload](../../src/pages/portal/PortalKnowledge.tsx#L273-L292) → [actual addDoc spread](../../src/hooks/useKnowledge.ts#L52-L56). Native error identifies the unsupported field; URL/title/auth are valid. |
| [K02.local-create-document-modal](browser/knowledge/K01-K07.spec.ts#L96) | [T222–224: ספריית ידע](../../docs/requirements/technical-specification.he.md#L222-L224) | Valid document title/content fails on undefined optional `url`, supplied by the [actual modal](../../src/pages/portal/PortalKnowledge.tsx#L273-L292), not a test payload factory. Same-provider identity is settled. |
| [K02.local-create-checklist-modal](browser/knowledge/K01-K07.spec.ts#L96) | [T222–224](../../docs/requirements/technical-specification.he.md#L222-L224) | Two valid nonempty checklist entries fail because unrelated optional fields are undefined. [Writer spread](../../src/hooks/useKnowledge.ts#L52-L56) rejects the actual modal object. The separate hook/consumer A passes but does not sanitize this modal. |
| [K03.local-storage-contract](browser/knowledge/K01-K07.spec.ts#L130) | [T16–20: Storage](../../docs/requirements/technical-specification.he.md#L16-L20), [T222–224](../../docs/requirements/technical-specification.he.md#L222-L224) | Actual small accepted file form fails saving undefined `url`/optional fields. [Real producer path](../../src/pages/portal/PortalKnowledge.tsx#L253-L292). This validates the save defect; later Storage URL/object assertions are **not** independently established. |
| [K03.partial-upload-recovery](browser/knowledge/K01-K07.spec.ts#L145) | [T92: טרנזקציות/תיקון/עקביות](../../docs/requirements/technical-specification.he.md#L92) | Actual upload/source commit precedes rejected file-metadata write; an object remains without its source link. [Noncompensating sequence](../../src/hooks/useHQKnowledge.ts#L76-L94). Prior commits and real fault are captured; test never deletes successful metadata afterward. |
| [K04.produced-mirror-tag-filter](browser/knowledge/K01-K07.spec.ts#L191) | [E73: תגיות](../../docs/requirements/executive-summary.he.md#L73) | Actual writer-generated shared mirror has no tags; real [ItemCard calls `tags.map`](../../src/pages/portal/PortalKnowledge.tsx#L66). [Mirror writer](../../src/hooks/useHQKnowledge.ts#L8-L18) omits them. Render fails before filtering; no malformed hand-seeded mirror. |
| [K04.delete-current-retrieval](browser/knowledge/K01-K07.spec.ts#L216) | [T92](../../docs/requirements/technical-specification.he.md#L92), [E68–73](../../docs/requirements/executive-summary.he.md#L68-L73) | [Delete removes only HQ source](../../src/hooks/useHQKnowledge.ts#L127-L132); actual coordinator handler's **current** context still contains the mirror's deleted content. Source absence and live context readback rule out stale URL/cache claims. |
| [K05.mirror-write-failure-recovery](browser/knowledge/K01-K07.spec.ts#L238) | [T92: explicit transactions](../../docs/requirements/technical-specification.he.md#L92) | Quiescent reads before retry show mixed committed versions after the real mirror fault. [Sequential writes](../../src/hooks/useHQKnowledge.ts#L109-L124). Source-ACK/error-shape prerequisites removed; no mixed-read race or post-hoc mutation. |
| [K06.research-item-reaches-open-library](browser/knowledge/K01-K07.spec.ts#L304) | [E70–73: מחקרים וחיפוש](../../docs/requirements/executive-summary.he.md#L70-L73) | Actual admin page persists source/mirror; actual [library reads static catalog](../../src/pages/KnowledgeLibraryPage.tsx#L101-L136), so maintained item is absent. Writes/readback succeed first; not a field fixture or authorization failure. |
| [K07.second-write-failure](browser/knowledge/K01-K07.spec.ts#L356) | [T92](../../docs/requirements/technical-specification.he.md#L92) | **1 source / 0 mirrors** after actual retained panel settles. [Separate source/mirror writes](../../src/pages/admin/KnowledgeAdminPage.tsx#L336-L369). No test writer clone, no required pageerror, no retry in this atomicity case. |
| [K07.error-visibility](browser/knowledge/K01-K07.spec.ts#L373) | [T92](../../docs/requirements/technical-specification.he.md#L92), [T94–116: שגיאות](../../docs/requirements/technical-specification.he.md#L94-L116) | Real persistent write conflict occurs, but panel exposes no visible error. [Save has `try/finally` only](../../src/pages/admin/KnowledgeAdminPage.tsx#L320-L369). The failed locator is the requested UI feedback, not an atomicity/setup prerequisite. |
| [K07.retry-idempotency](browser/knowledge/K01-K07.spec.ts#L383) | [T92: repair/consistency](../../docs/requirements/technical-specification.he.md#L92) | **2 sources / 1 mirror after retry and reload**, with exact orphan/new IDs in attachments. [ID allocated each Save](../../src/pages/admin/KnowledgeAdminPage.tsx#L325). Same retained input and real second Save establish one retried logical intent, not two independently authored fixtures. |
| [K08.document-content-grounding](browser/knowledge/K08.spec.ts#L34) | [T126: סיכום תוכן](../../docs/requirements/technical-specification.he.md#L126), [T159: מקורות](../../docs/requirements/technical-specification.he.md#L159) | Actual selected PDF fact/bytes do not reach actual summarizer provider request. [Page](../../src/pages/admin/KnowledgeAdminPage.tsx#L299-L311) and [handler](../../netlify/functions/summarize-article.ts#L11-L35) use title alone. No summary-output textarea is treated as input; canned reply is not semantic proof. |
| [H02.branch-switch-no-session-mixing](browser/knowledge/H02-H06-H07.spec.ts#L13) | [T153: זהות וסניף](../../docs/requirements/technical-specification.he.md#L153) | Same mounted PortalChat switches A→B while A request is pending; old continuation renders A reply under B. [Retained state/send path](../../src/pages/portal/PortalChat.tsx#L10-L75). Both branches authorize the user; no remount or invalid membership fixture. |
| [H03.source.reports](emulator/knowledge/H03.test.tsx#L193) | [T149](../../docs/requirements/technical-specification.he.md#L149), [E92](../../docs/requirements/executive-summary.he.md#L92) | Valid `data.note` sentinel omitted because [handler formats `answers`](../../netlify/functions/hq-chat.ts#L184-L200). Real Admin/Auth/Firestore, no query mock. Naming remains undecided, but [uniform schema is required](../../docs/requirements/technical-specification.he.md#L85). |
| [H05.task-evidence-reaches-context](emulator/knowledge/H05.test.tsx#L82) | [E77: משימות](../../docs/requirements/executive-summary.he.md#L77) | Valid task notes never reach provider; [source collection set omits tasks](../../netlify/functions/hq-chat.ts#L107-L205). Real token/provider capture succeeds. No invented new scope or invalid task enum/timestamp. |
| [H06.challenge-content](browser/knowledge/H02-H06-H07.spec.ts#L136) | [E92: אתגרי המתנדבים](../../docs/requirements/executive-summary.he.md#L92) | Actual [PortalReport writes `data`](../../src/pages/portal/PortalReport.tsx#L229-L250), but [HQ formatter reads `answers`](../../netlify/functions/hq-chat.ts#L184-L200). Real submissions/readback precede request; no test backfill. |
| [H06.year-disambiguation](browser/knowledge/H02-H06-H07.spec.ts#L136) | [E91–92: רבעון ושנה](../../docs/requirements/executive-summary.he.md#L91-L92) | Actual Q3/2025 and Q3/2026 submissions become indistinguishable Q3 lines; [formatter omits year](../../netlify/functions/hq-chat.ts#L184-L200). Real year controls/persistence checked, and normal soft assertions capture all omitted facts. |
| [H06.missing-roster-context](browser/knowledge/H02-H06-H07.spec.ts#L136) | [E92: מי לא דיווח](../../docs/requirements/executive-summary.he.md#L92) | Existing A/B/C/D roster with actual A/C submissions lacks B/D facts in context. [Reports-only query](../../netlify/functions/hq-chat.ts#L184-L200) never fetches population. Oracle accepts names or IDs; no invented eligibility policy. |
| [H07.scope-session-isolation](emulator/knowledge/H07.test.tsx#L50) | [T90](../../docs/requirements/technical-specification.he.md#L90), [T153](../../docs/requirements/technical-specification.he.md#L153) | Same hook retains A session ID when authenticated user/type changes to B; B save updates a nonexistent B-path ID. [Retained ID/save branch](../../src/hooks/useChatHistory.ts#L27-L74). First save and identity transition settle before actual `NOT_FOUND`. |
| [H07.save-failure-visible](browser/knowledge/H02-H06-H07.spec.ts#L40) | [T94–116: error contract](../../docs/requirements/technical-specification.he.md#L94-L116) | Actual reply renders, history write fails, no session persists and no save warning appears. [Discarded persistence promise](../../src/pages/portal/PortalChat.tsx#L61-L74). No mandatory pageerror, invalid auth or setup-timeout prerequisite. |

## Complete current reviewer map

All IDs below have the `TEST-` prefix. `P` = accepted pass; `D` = accepted product-failure case. `Fresh` means one of the six distinct new reviewers for this execution; `Carry` passed the source/status gate. Full UUIDs/models/evidence are in the authoritative manifest.

| Case | Reviewer | Mode | Verdict |
|---|---|---|---|
| H01.actual-controls-request | KH-V01-controls | Carry | P |
| H01.current-default-scopes | KH-V02-defaults | Carry | P |
| H01.reply-rendering | KH-V03-reply | Carry | P |
| H02.branch-switch-no-session-mixing | KH-V04-branch-transition | Carry | D |
| H03.current-branch-filter | KH-V05-branch-filter | Carry | P |
| H03.partial-source-success | KH-V06-source-fault | Carry | P |
| H03.source.branch | KH-V07-branch-source | Carry | P |
| H03.source.global | KH-V44-global-replacement | Carry | P |
| H03.source.hq | KH-V09-hq-source | Carry | P |
| H03.source.reports | KH-V10-report-source | Carry | D |
| H03.source.research | KH-V11-research-source | Carry | P |
| H04.all-mode-context | KH-V12-all-context | Carry | P |
| H04.foreign-branch-denial | KH-V13-foreign-denial | Carry | P |
| H04.own-branch-context | KH-V14-own-context | Carry | P |
| H05.task-evidence-reaches-context | KH-V15-task-evidence | Carry | D |
| H06.branch-analysis-context | KH-V16-branch-analysis | Carry | P |
| H06.challenge-content | KH-V17-report-challenge | Carry | D |
| H06.missing-roster-context | KH-V18-missing-roster | Carry | D |
| H06.reply-rendering | KH-V19-report-reply | Carry | P |
| H06.year-disambiguation | KH-V20-report-year | Carry | D |
| H07.current-limit-before-filter | KH-V21-history-limit | Carry | P |
| H07.save-failure-visible | KH-V51-h07-save-current | Fresh | D |
| H07.scope-session-isolation | KH-V23-scope-session | Carry | D |
| K01.domain-default | KH-V24-domain-default | Carry | D |
| K01.explicit-filters-and-edit | KH-V25-hq-filters | Carry | P |
| K02.local-create-checklist-modal | KH-V26-checklist-modal | Carry | D |
| K02.local-create-document-modal | KH-V27-document-modal | Carry | D |
| K02.local-create-valid-nonempty-checklist | KH-V45-checklist-replacement | Carry | P |
| K02.local-create-with-sparse-fields | KH-V29-link-modal | Carry | D |
| K03.current-size-boundaries | KH-V30-size-characterization | Carry | P |
| K03.hq-storage-success | KH-V31-hq-upload | Carry | P |
| K03.local-storage-contract | KH-V32-local-upload | Carry | D |
| K03.partial-upload-recovery | KH-V33-upload-recovery | Carry | D |
| K04.delete-current-retrieval | KH-V34-delete-retrieval | Carry | D |
| K04.old-bearer-url-current | KH-V35-old-url | Carry | P |
| K04.produced-mirror-tag-filter | KH-V36-mirror-tags | Carry | D |
| K04.unshare-current-retrieval | KH-V37-unshare | Carry | P |
| K05.mirror-write-failure-recovery | KH-V46-k05-atomicity-current | Fresh | D |
| K05.retry-recovery | KH-V47-k05-retry-current | Fresh | P |
| K06.research-item-reaches-open-library | KH-V39-library | Carry | D |
| K07.research-write-roundtrip | KH-V40-research-save | Carry | P |
| K07.second-write-failure | KH-V48-k07-atomicity-current | Fresh | D |
| K07.error-visibility | KH-V49-k07-error-current | Fresh | D |
| K07.retry-idempotency | KH-V50-k07-retry-current | Fresh | D |
| K08.current-title-only-request | KH-V42-title-request | Carry | P |
| K08.document-content-grounding | KH-V43-document-grounding | Carry | D |

### Review-quality reconciliation

- V51 explicitly skipped opening the raw requirement. The coordinator separately re-read [technical L90–116](../../docs/requirements/technical-specification.he.md#L90-L116) and [PortalChat L59–81](../../src/pages/portal/PortalChat.tsx#L59-L81). A manifest is not authority. Its behavioral finding survives that requirements check.
- V51's suggestion that an empty `pageerror` array proves the exception was caught/swallowed is **not adopted**. The source discards the promise and the run log has rejection diagnostics. The valid conclusion is missing UI feedback.
- Historical leaf errors about reviewer names, wrong-lane/hash-presence verification, BranchReportsModal context and emulator revocation capability are not reintroduced. Actual task-registry identities and coordinator-computed matching hashes govern this map. In particular, [BranchReportsModal embeds report facts in user messages](../../src/pages/BranchesPage.tsx#L115-L129).

## Scope limits retained

The parent's **13 future/policy mappings remain unchanged**, outside these 46 runtime cases. No numerical rate/latency/token/retention budget, file type/scanning policy, HQ cross-domain denial policy, old-URL revocation policy, future AI-write/notification/offline feature, or model-semantic correctness oracle was invented.

C cases remain characterizations: current scope defaults, current query limit, portal size edge and old local URL retrieval. K08 title-only C does not approve document grounding. K02 hook-checklist A does not claim modal success or persisted checkbox state. K05 retry A is successful no-file recovery; K05/K07 atomicity G remains independently failed.

The current 46-case map is complete for the parent's final global review round. Global build/rules/base-browser/API gates remain parent-owned; this report does not declare those gates green.

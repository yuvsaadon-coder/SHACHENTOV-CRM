# Manual and non-automatable verification guide

This consolidates every requirement disposition in [TEST-PLAN.md](TEST-PLAN.md)
that is **not** a runnable automated test — classifications `M` (operational/manual
evidence), `U` (unresolved owner decision), and `F` (future runtime feature with no
entrypoint yet). It exists so a human or an agent picking up this suite can see, in
one place, what automation intentionally does **not** and **cannot** cover, instead
of having to re-derive it from the full requirement-mapping table.

**This list is a closing checklist, not a blocker for every commit.** The automated
suite (see [README.md](README.md)) is the commit/PR gate. Items below are release-
or owner-decision-gated, or require access this offline environment does not have
(deployed infrastructure, human sensory judgment, an approved policy value).

Do not attempt to convert any of these into an automated assertion by inventing a
threshold, faking the missing access, or asserting that a feature's absence proves
the requirement — see `TEST-PLAN.md` §1 and §8 for why that is explicitly forbidden
in this suite.

## Manual evidence required (`M`)

| # | What must be verified | Why automation can't do it | Test-plan row |
|---|---|---|---|
| 1 | Correlation between a request and its outcome is visible in actual application/platform logs and metrics, for authorized success, denial, and provider-failure calls, without token/key/PII disclosure. | Requires inspecting real deployed logging/metrics infrastructure; an in-process handler call cannot prove Netlify platform-level log correlation exists. | F09 |
| 2 | Deployed Netlify routing: redirect priority, CDN behavior, esbuild packaging, plan-supported function timeout — checked against an authorized isolated Netlify **preview** environment (never production). | Local Vite + local handler adapter can prove SPA routing and function-response shape, but cannot observe deployed CDN/redirect/packaging/timeout behavior. | N02 (M/A mixed — the A half is already automated; only the deployed-preview half is manual) |
| 3 | Dated artifacts recording: push/PR-preview build runs, Node runtime actually deployed, configured AI provider timeout, secret store/rotation/IAM, environment separation, public-key restrictions, App Check status, and deployed (not just checked-in) Firebase rules. | Local repository files cannot prove production/preview deployment state, hosting plan support, or rotation policy. No remote calls are permitted from the offline acceptance suite. | N03 |
| 4 | Semantic accuracy of an AI-generated summary: does it actually, faithfully reflect the grounding document's content (beyond "the document text reached the prompt", which `K08.document-content-grounding` already proves automatically)? | Requires human judgment of natural-language quality/faithfulness; no fake model response can stand in for real semantic grounding. | K08 |
| 5 | Screen-reader and visual accessibility evidence beyond the automated keyboard/focus/RTL checks already in `N05.*` (orgcard-keyboard, kanban-keyboard, actual-dialog-focus, rtl-critical-controls). | Requires a human using actual assistive technology; no conformance level (WCAG A/AA/AAA) is specified to test against automatically. | N05 |
| 6 | Whether the deployed AI model actually resists prompt injection and stays within the untrusted context boundary in practice (beyond `N06.no-tool-mutation`/`N06.reply-rendering`, which already prove the harness can't be tricked into a tool-mutation or unsafely-rendered reply with a stubbed model). | Model semantic grounding and real injection-resistance is a live-model property; a stubbed response cannot serve as a security oracle for it. | N06 |
| 7 | CI required-check enforcement and branch-protection/repository-ruleset configuration actually block a merge/release when an acceptance test fails. | No CI workflow or repository protection is enabled by this suite yet (see [AUTOMATION.md](AUTOMATION.md) — proposal only). This becomes a real automated `A` test only after the owner adopts the CI proposal. | N07 |

## Owner decisions required before further tests can be written (`U`)

These are requirement ambiguities the two Hebrew source documents leave open (see
`docs/requirements`'s own `סתירות שיש להכריע לפני מימוש` list). **Do not resolve
these by picking one interpretation and testing against it as if approved** — every
row already has the maximum test coverage possible without prejudging the decision.

| # | Decision | What is already characterized without prejudging it |
|---|---|---|
| D1 | `roles` vs. `orgRoles` field naming | Current `roles` writer/reader/rules path, characterized as-is. |
| D2 | Report `data` vs. `answers` field naming | Whether portal-submitted content reaches HQ display and AI intact, independent of field name. |
| D3 | Chat history root path vs. per-user path | Current `users/{uid}/chatSessions` path and its privacy enforcement. |
| D4 | Knowledge item path/data model | Current `knowledgeItems` + HQ/research mirrors, and branch isolation, without endorsing this storage model. |
| D5 | HQ domain visibility scope | The explicit required domain **default** only; current broader access is recorded separately, not endorsed. |
| D6 | Final coordinator authentication method | Current name/phone/custom-token flow, its malformed-input handling, and public-endpoint abuse-control posture. |
| D7 | What information is allowed to reach the AI provider | Only synthetic data is used; exactly which synthetic sources leave the handler is recorded — no assumed customer-data allowlist. |
| D8 | All numeric/lifecycle policies (SLA, load, rate, retry, timeout, token/context budgets, retention, coverage/mutation thresholds, file allowlists, inactive-user lifecycle, duplicate-report amendment, hierarchy-repair, offline-conflict policy) | Existing numeric constants are characterized as current behavior inputs, never asserted as acceptance thresholds. **No numeric target may be invented by any future contributor, human or agent, without an explicit owner decision recorded here first.** |

## Future features with no entrypoint yet (`F`)

| # | Feature | Current disposition |
|---|---|---|
| 1 | J01/J03 — notifications and durable-offline support | No runtime assertion exists because there is no production entrypoint to call yet. Coverage gap is explicit and tracked, not silently dropped. |

## Process for closing an item on this list

1. Get the specific owner decision or deployed-environment access needed (see table above).
2. Update `TEST-PLAN.md`'s classification for that row from `M`/`U`/`F` to `A`, `G`, or `C` and write the concrete test.
3. Add the new test's ID to `test-manifest.json`, its outcome to the relevant `*-RESULTS.md`, and if it fails, to `FAILURES.md`.
4. Never mark an item here "done" by weakening or faking evidence — closing the gap means writing a real test against real access/decision, not adjusting the checklist.

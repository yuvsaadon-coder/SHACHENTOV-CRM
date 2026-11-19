# CLAUDE.md — Shachen Tov: Coordinator Voting & Order Planning

Hebrew-language (RTL) web app for **Shachen Tov (שכן טוב)**, a Jerusalem food-distribution nonprofit.
Branch coordinators vote on what goes into food baskets; the admin turns the weighted votes into a decision and then
into a supplier order report (half-year order or holiday order).

## Read first
1. `docs/SPEC.md` — the full product spec (Hebrew). **Source of truth for behaviour.** Requirement IDs (`CYC-3`, `VOTE-4`…) and open questions (`OQ-n`) are referenced everywhere.
2. `reference/algorithm.mjs` + `reference/algorithm.test.mjs` — reference implementation of the results algorithm. **The tests are the contract.** Port to TypeScript without changing behaviour.
3. `firestore.rules` — DRAFT security rules. **Untested.** Never deploy before the emulator tests (SPEC §9.5) pass.
4. `seed/seed.json` — 31 products, 7 branches, 14 coordinators, basket template. Product and coordinator IDs are stable; keep them.
5. `legacy/site-firebase-ready.zip` — the current production site (React via CDN + Babel). Reference for look and behaviour only. Do not edit it in place.
6. `docs/order-formats/` — the organisation's original order files: `half-year.xlsx`, and Pesach supplier files (`pesach-dry-goods`, `-eggs`, `-poultry`, `-vegetables`). SPEC §10.2 documents their structure. **Only the dry-goods supplier file shows prices; all others quantities only.** No Rosh Hashana file exists yet: build it from the Pesach structure plus a challah file (SPEC §10.6). Order branches (14) differ from voting branches (7). Two outputs: weighted (one order) and per-branch (each branch gets its own choice; non-voters flagged in admin only, filled with the weighted basket). Half-year = dry file only; holidays = all suppliers; admin sees cost for all, Excel prices dry only. Voting in holidays adds Beit Shemesh, Tel Aviv, Kadima (coordinators missing, OQ-27). See SPEC §10.3-10.4, `planOrder()`, `compareViews()`, `distributionPlan()`.

## The person you are working with
The owner is **not a programmer**. They talk Hebrew. So:
- Explain outcomes in plain Hebrew, short, no jargon. Show what changed and how to see it.
- For anything done in the Firebase Console or Netlify UI, give click-by-click steps.
- Never ask them to run a shell command without saying what it does. Prefer running it yourself.
- Ask before anything irreversible (deleting data, deploying rules, changing the algorithm's meaning). Otherwise proceed.
- When you finish a phase, say what was tested and **what was not**.

## Stack (decided in SPEC §11 — confirm with the owner before Phase 0 if they object)
- Vite + React 18 + TypeScript (strict). Firebase modular SDK v10+. Firestore, Auth (Google for admins, Anonymous for coordinators). **Spark plan only** — no Cloud Functions, no Cloud Storage, no scheduled jobs. If a feature needs Blaze, flag it and stop.
- Tests: Vitest (unit), `@firebase/rules-unit-testing` + Firebase Emulator (rules), Playwright (E2E against emulator).
- Deploy: GitHub → Netlify (auto). Rules via `firebase deploy --only firestore`. Hosting is **not** Firebase Hosting.
- Reports: client-side only. ExcelJS for `.xlsx` templates (keeps formatting), docxtemplater for `.docx`, pdf-lib for PDF forms. Template files live in `public/templates/`.

## Commands (create these npm scripts in Phase 0)
```
npm run dev            # vite dev server (+ emulators via `npm run emulators`)
npm run build          # production build -> dist/
npm run lint && npm run typecheck
npm test               # vitest (includes ported algorithm tests)
npm run test:rules     # rules tests against the Firestore emulator
npm run test:e2e       # playwright against emulators
npm run emulators      # firebase emulators:start --only auth,firestore
node --test reference/algorithm.test.mjs   # the reference tests, no install needed (Node >= 20)
```

## Hard rules
**Security**
- Firestore is closed by default. Never ship `allow read, write: if true`. The current production site has exactly that (SPEC D1) — closing it is Phase 1.
- Never trust client data: weights and prices come **only** from the cycle snapshot; every vote is re-validated server-side-of-the-app in the results pipeline (SPEC §7.1) because rules cannot check budgets.
- The Firebase web config (apiKey etc.) is public by design. A **service-account key is a secret**: never commit it, never put it in Netlify, `.gitignore` it. Personal coordinator codes appear in URLs: strip them after claim (`history.replaceState`) and send `Referrer-Policy: no-referrer`.
- Admin allowlist is `admins/{email}`. Do not hard-code emails in source.

**Data**
- One document per entity. **Never `set()` a whole config document** (this is SPEC D5, last-write-wins data loss). Use per-document writes, `update`, batches, and `runTransaction` for state transitions.
- Cycles snapshot products/baskets/coordinators at open (SPEC CYC-4). Never read live catalog prices when computing a cycle.
- Never delete votes. Move to `archivedVotes` with a reason (CYC-10). Every admin decision (override, tie-break, finalise, catalog change, reset) writes an `auditLog` entry.
- Timestamps via `serverTimestamp()`. Display in `Asia/Jerusalem`.

**Algorithm**
- Do not change algorithm semantics without asking. Open decisions are `OQ-1…OQ-12` in SPEC §15; use the stated defaults.
- Keep it a pure module (`src/lib/algorithm/`): no Firebase, no DOM, no `Date.now()`, deterministic for the same input regardless of vote order. Port all 15 reference tests first; add tests for anything you add.
- Floating point: money comparisons use a tolerance (`EPS = 1e-9`) and display rounds to 2 decimals.

**UI / Hebrew**
- `<html lang="he" dir="rtl">`. Use CSS logical properties (`margin-inline-start`, not `margin-left`).
- All user-facing strings live in `src/i18n/he.ts`. No hard-coded Hebrew in components.
- Currency via `Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' })`.
- Keep the existing look: tokens in SPEC §12.2 (Heebo, `#FAF6EC` / `#1B5E3F` / `#1a1a1a`, 2px ink borders, hard offset shadows). Do **not** ship the Tweaks panel or design-canvas files.
- Touch targets ≥ 44px, WCAG AA contrast, never colour alone.

## Domain glossary (Hebrew → code)
| Hebrew | Code | Meaning |
|---|---|---|
| רכז | coordinator | A voter. Has `weight` 1.0 or 0.5 and a `branchId` |
| סניף | branch | 7 branches; some products are hidden per branch (`excludedBranches`) |
| סל א' / ב' | basket `a` / `b` | Two **interchangeable but different** baskets (80 ₪ each); a product can be in both |
| הרחבה | basket `a_ext` / `b_ext` | Add-on baskets (20 ₪ each) |
| קבוצה | group `main` / `ext` | A pair of interchangeable baskets |
| הזמנה / מחזור | cycle | One voting round aimed at one order |
| הזמנה חצי שנתית ראשונה/שנייה | `half_year_1` / `half_year_2` | |
| פסח / ראש השנה | `pesach` / `rosh_hashana` | Holiday orders |
| יישור | alignment | Fix coordinators who filled A and B in swapped order |
| תיקו | tie | Equal support at the budget cut |
| קיבוע | finalise | Freeze the cycle result |
| מכפיל | multiplier | How many physical baskets of each type to produce |

## Workflow
1. Work in phases (SPEC §14). Start with Phase 0. Each phase must be deployable and end with: tests green, a short demo script, and a list of what was verified vs not.
2. Small commits, clear messages. One phase = one PR. CI must pass: lint, typecheck, unit, rules, build.
3. Keep the **legacy site running** until Phases 0–3 are verified. Cut over **between** cycles, never mid-cycle.
4. If the spec is ambiguous or contradicts the code, stop and ask; do not guess silently. Record decisions by editing the relevant `OQ` row in SPEC §15.
5. Definition of done for any feature: acceptance criteria in SPEC met, tests added, Hebrew strings in `he.ts`, RTL checked at 375px and 1280px, no console errors, audit entries written for admin actions.

## Do not
- Edit `legacy/` or `reference/` in place (copy/port instead).
- Add dependencies that need a paid Firebase plan, or any server you would have to run.
- Store phone numbers, names or any personal data beyond what SPEC §9.6 allows. Nothing about recipients of the baskets.
- Invent report formats. Use the owner's original files (the Rosh Hashana challah file is the one sanctioned derivation).

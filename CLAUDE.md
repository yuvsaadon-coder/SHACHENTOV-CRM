# CLAUDE.md — Shachen Tov CRM

Hebrew (RTL) CRM for **Shachen Tov (שכן טוב)**, a Jerusalem food-distribution nonprofit: HQ tasks, roles, contacts,
branches, knowledge base, a coordinator portal, and the **basket survey module ("סל המזון")** in `src/voting/`.

## The person you are working with
The owner is **not a programmer** and writes in Hebrew. Answer in plain Hebrew, short, no jargon, right-aligned.
- For anything done in the Firebase Console, Netlify or GitHub UI, give click-by-click steps with links.
- Never ask them to run a shell command; run it yourself.
- Ask before anything irreversible (deleting data, deploying rules, changing how results or weights are computed).
- At the end of a piece of work, say what was tested and **what was not**.

## Stack and commands
Vite + React 19 + TypeScript, Tailwind 4, react-router 7, Firebase 12 (project **`shachentov-crm`**), Netlify
(site + functions in `netlify/functions`, auto-deploy from `main`). Firestore rules are **not** auto-deployed: the
owner publishes `firestore.rules` in the Firebase Console.
```
npm run dev          # dev server
npm run build        # tsc -b && vite build
npm run lint         # oxlint
npm test             # vitest: src/test/** and src/voting/test/**
npm run test:rules   # Firestore rules tests in the emulator (needs Java; downloads firebase-tools)
```
Netlify env (already set): `VITE_FIREBASE_*`, `FIREBASE_SERVICE_ACCOUNT` (secret), `ANTHROPIC_API_KEY` (secret).

## Access model (see firestore.rules)
`users/{uid}.role`: `admin`/`CEO` = system managers, `coordinator` = branch coordinator (portal only), `none` = no
access, anything else = HQ staff. `users.branchIds` = the coordinator's portal branches. HQ positions live in
`roles/{id}` with a `domain` (`JLM` = סניפי ירושלים). Any rules change must keep `npm run test:rules` green
(it also checks existing CRM rules) and must be published by the owner.

## Basket survey module — `src/voting/` (read before touching it)
Coordinators vote on the content of the food baskets; HQ turns weighted votes into a decision and supplier orders.
Merged into the CRM on 20.11.2026 from the standalone app in `voting/` (kept only as reference until cut-over).

Docs: `docs/VOTING-IN-CRM.md` (how it is wired), `voting/docs/SPEC.md` (full product spec; decisions are the
`OQ-n` rows in §15), `voting/docs/PRICES.md` (price tracking, suppliers, discounts), `voting/docs/QUOTES.md`
(quote upload/analysis). Algorithm contract: `voting/reference/algorithm.mjs` + its tests; the TS port in
`src/voting/lib/algorithm/` must stay identical (`src/voting/test/parity.test.ts` compares 300 random cycles).

Where things are:
- Routes: HQ `/voting` (`VotingAdmin.tsx`, only `access==='admin'` or domain `JLM`/`CEO`; sidebar item "סל המזון"),
  portal `/portal/basket` (`VotingPortal.tsx`). Both lazy-loaded.
- Data: Firestore collections `voting_config/main` (products, baskets, round — write ONE field at a time, never the
  whole doc), `voting_branches/{crmBranchId}`, `voting_votes/{uid}_{branchId}`, `voting_archivedVotes`,
  `voting_priceQuotes`, `voting_priceDecisions`, `voting_rounds`. Code: `src/voting/data/`.
- Coordinators are **CRM users** (role `coordinator`, `branchIds`), never a separate list. Branches are CRM branches.
- Strings: `src/voting/i18n/he.ts` only. Styles: `src/voting/styles.css`, every rule scoped under `.voting`.
- Dev demo without login: `VITE_VOTING_DEMO=true npx vite` → `/voting-demo.html#admin` (not in the build).

Owner decisions that the code must keep (do not change without asking):
1. **Weights:** branch weight = sqrt(families), normalised so participating branches average 1; half-year rounds use
   routine family counts, holiday rounds holiday counts. Voter weight = branch weight ÷ number of that branch's
   coordinators **who voted**. Branches set to "never" (e.g. נחלאות רב שמעון, סבתא רבקא) do not vote and receive
   the weighted basket. Per-branch view: the branch weight is split equally among its coordinators. (`data/weights.ts`)
2. **Who votes:** branches vote "always", "holidays only" (בית שמש, תל אביב, קדימה) or "never".
3. **One supplier per order** and per supply category. Saving a quote never changes the catalog; choosing a supplier
   does: its prices go to the catalog (= the survey), its new products are added, products it did not quote are
   hidden from the survey (default). Suppliers are compared on the **same basket** (products all of them quoted).
4. **Discounts** (after quantities are known) are a separate "net" layer: never written into catalog prices. The price
   tracker compares list to list and net to net only.
5. **Half-year = 24 weeks** (weekly = 24 distributions, every two weeks = 12). Holidays = one distribution.
6. **Price history:** from the owner's sheet (`src/voting/seed/price-history.json`) + applied quotes; period change is
   computed only over products supplied in both periods (same formula as the sheet); year/since-start changes are
   chained, not summed.
7. **New round** goes through the wizard: order type + year, budgets with a recommendation (previous budget × price
   change of the basket coordinators voted for). Opening a round archives the current votes, never deletes them.

Status / next steps (update this list when done):
- [ ] Owner merges and publishes `firestore.rules`; first setup in "סל המזון" (branches & families, save catalog).
- [ ] One-time import from the old Firebase project `shachentov-1316f` (quotes, supplier decisions, discounts,
      rounds, open votes matched to CRM users by name).
- [ ] Verify against the real CRM (real users/branches), then move coordinators to the portal **between rounds**.
- [ ] Retire the old site and the separate Netlify voting site; then the `voting/` folder.
- [ ] Order reports (SPEC §10, phase 4): supplier Excel files from the owner's formats in `voting/docs/order-formats/`.

## Working rules
- Small commits, clear messages; never commit secrets (service-account keys, `.env` with secrets).
- Hebrew UI, RTL, logical CSS properties, touch targets ≥ 44px, never colour alone.
- Check screens at 375px and 1280px before calling UI work done.

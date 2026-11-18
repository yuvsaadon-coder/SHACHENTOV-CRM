// Reference implementation of the Shachen Tov results algorithm (SPEC.md §7).
// Pure functions: no I/O, no DOM, no Firebase. Port to TypeScript as src/lib/algorithm/*.ts
// and keep behaviour identical. algorithm.test.mjs is the contract.
//
// Terminology:
//   basket  = one voting basket (a, a_ext, b, b_ext) with a budget, a `group` ('main'|'ext') and a `slot` ('A'|'B')
//   group   = the pair of baskets that are interchangeable (A-slot + B-slot of the same group)
//   voter   = coordinator who submitted a vote in this cycle

export const EPS = 1e-9;
export const DEFAULT_ALIGN_MARGIN = 0.10;

const byId = (arr) => new Map(arr.map((x) => [x.id, x]));
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function eligible(product, coordinator) {
  return !(product.excludedBranches || []).includes(coordinator.branchId);
}

export function basketCost(items, priceOf) {
  let s = 0;
  for (const [pid, q] of Object.entries(items || {})) s += (priceOf.get(pid) || 0) * q;
  return s;
}

// Cost-weighted overlap in [0,1]. 1 = identical baskets, 0 = nothing in common. Both empty => 1.
export function overlap(x, y, priceOf) {
  const m = Math.max(basketCost(x, priceOf), basketCost(y, priceOf));
  if (m < EPS) return 1;
  let common = 0;
  for (const pid of new Set([...Object.keys(x || {}), ...Object.keys(y || {})])) {
    common += Math.min((x || {})[pid] || 0, (y || {})[pid] || 0) * (priceOf.get(pid) || 0);
  }
  return common / m;
}

function centroid(voters, orient, slotKey, excludeId) {
  const sum = {};
  let w = 0;
  for (const u of voters) {
    if (u.id === excludeId) continue;
    const swapped = orient.get(u.id);
    const items = swapped ? (slotKey === 'A' ? u.b : u.a) : (slotKey === 'A' ? u.a : u.b);
    w += u.weight;
    for (const [pid, q] of Object.entries(items || {})) sum[pid] = (sum[pid] || 0) + u.weight * q;
  }
  if (w < EPS) return {};
  for (const pid of Object.keys(sum)) sum[pid] /= w;
  return sum;
}

// Decide, for each voter, whether their (A,B) baskets were filled in swapped order relative to the crowd.
// voters: [{id, weight, submittedAt, a, b}]  (a = items of slot A basket, b = items of slot B basket)
// overrides: { [voterId]: 'keep' | 'swap' }  (admin decision; never changed by the algorithm)
export function alignGroup({ voters, priceOf, overrides = {}, margin = DEFAULT_ALIGN_MARGIN, maxIter = 10 }) {
  const info = new Map();
  if (voters.length === 0) return info;
  const sorted = [...voters].sort(
    (p, q) => q.weight - p.weight || p.submittedAt - q.submittedAt || cmpStr(p.id, q.id),
  );
  const anchorId = sorted[0].id; // the anchor's orientation defines the labels; never auto-flipped
  const orient = new Map(voters.map((v) => [v.id, overrides[v.id] === 'swap']));
  const fixed = new Set(voters.filter((v) => overrides[v.id] === 'keep' || overrides[v.id] === 'swap').map((v) => v.id));
  fixed.add(anchorId);

  const scoreOf = (v) => {
    const refA = centroid(voters, orient, 'A', v.id);
    const refB = centroid(voters, orient, 'B', v.id);
    return {
      same: overlap(v.a, refA, priceOf) + overlap(v.b, refB, priceOf),
      swp: overlap(v.a, refB, priceOf) + overlap(v.b, refA, priceOf),
    };
  };

  if (voters.length > 1) {
    for (let it = 0; it < maxIter; it++) {
      let changed = false;
      for (const v of sorted) {
        if (fixed.has(v.id)) continue;
        const { same, swp } = scoreOf(v);
        const cur = orient.get(v.id);
        // hysteresis: switch only when the other orientation wins by more than `margin`
        const next = cur ? !(same - swp > margin) : swp - same > margin;
        if (next !== cur) { orient.set(v.id, next); changed = true; }
      }
      if (!changed) break;
    }
  }
  for (const v of voters) {
    const { same, swp } = voters.length > 1 ? scoreOf(v) : { same: 2, swp: 0 };
    info.set(v.id, {
      swapped: orient.get(v.id),
      auto: orient.get(v.id) && !(overrides[v.id] === 'swap'),
      overridden: overrides[v.id] === 'keep' || overrides[v.id] === 'swap',
      isAnchor: v.id === anchorId,
      sameScore: same,
      swapScore: swp,
      // uncertain = the two orientations are within `margin` of each other (admin may want to look)
      uncertain: Math.abs(same - swp) <= margin && !fixed.has(v.id),
    });
  }
  return info;
}

// Aggregate one (aligned) basket across voters and fill the budget greedily.
// voters: [{id, weight, branchId, items}]  -- only voters who actually filled this basket (cost > 0)
export function aggregateBasket({
  budget, products, voters, allowPartialFit = false, tieBreaks = [], priceOf,
}) {
  const stats = [];
  for (const p of products) {
    let eligW = 0, wq = 0, pickW = 0, pickN = 0;
    for (const v of voters) {
      if (!eligible(p, v)) continue;
      eligW += v.weight;
      const q = Math.min(Math.max(0, (v.items || {})[p.id] || 0), p.max);
      if (q > 0) { wq += v.weight * q; pickW += v.weight; pickN += 1; }
    }
    if (eligW < EPS || pickW < EPS) continue;
    stats.push({
      pid: p.id, name: p.name, emoji: p.emoji, cat: p.cat, price: p.price, max: p.max,
      support: wq / eligW,            // weighted average quantity per eligible voter-weight
      pickRate: pickW / eligW,        // share of eligible weight that chose the product
      qty: Math.min(p.max, Math.max(1, Math.round(wq / pickW))),
      pickedByCount: pickN, pickedByWeight: pickW, eligibleWeight: eligW,
    });
  }
  const tbIndex = new Map(tieBreaks.map((pid, i) => [pid, i]));
  stats.sort((x, y) => {
    if (Math.abs(x.support - y.support) > EPS) return y.support - x.support;
    const ix = tbIndex.has(x.pid) ? tbIndex.get(x.pid) : Infinity;
    const iy = tbIndex.has(y.pid) ? tbIndex.get(y.pid) : Infinity;
    if (ix !== iy) return ix - iy;
    if (Math.abs(x.pickRate - y.pickRate) > EPS) return y.pickRate - x.pickRate;
    if (Math.abs(x.price - y.price) > EPS) return x.price - y.price;
    return cmpStr(x.pid, y.pid);
  });

  const winners = [];
  let used = 0;
  for (const s of stats) {
    let q = s.qty;
    if (used + q * s.price > budget + EPS && allowPartialFit) {
      while (q > 1 && used + q * s.price > budget + EPS) q -= 1;
    }
    const cost = q * s.price;
    if (used + cost <= budget + EPS) {
      winners.push({ ...s, qty: q, cost, reduced: q !== s.qty });
      used += cost;
    }
  }
  const won = new Set(winners.map((w) => w.pid));

  // Decisive ties: equal support, and the group straddles the cut (some selected, some not).
  const ties = [];
  let i = 0;
  while (i < stats.length) {
    let j = i + 1;
    while (j < stats.length && Math.abs(stats[j].support - stats[i].support) <= EPS) j++;
    const grp = stats.slice(i, j);
    const sel = grp.filter((g) => won.has(g.pid)).map((g) => g.pid);
    const rej = grp.filter((g) => !won.has(g.pid)).map((g) => g.pid);
    if (grp.length > 1 && sel.length > 0 && rej.length > 0) {
      ties.push({
        support: grp[0].support, pids: grp.map((g) => g.pid), selected: sel, rejected: rej,
        resolvedByAdmin: grp.every((g) => tbIndex.has(g.pid)),
      });
    }
    i = j;
  }
  return {
    budget, used, leftover: budget - used,
    winners, notSelected: stats.filter((s) => !won.has(s.pid)), ties,
    voterCount: voters.length, voterWeight: voters.reduce((a, v) => a + v.weight, 0),
  };
}

// cycle.baskets: [{id, budget, group, slot}]   cycle.products / coordinators: snapshots frozen at cycle open
// votes: { [coordinatorId]: { baskets: { [basketId]: { [productId]: qty } }, submittedAt } }
// overrides: { [group]: { [coordinatorId]: 'keep'|'swap' } }     tieBreaks: { [basketId|group]: [productId,...] }
export function computeCycleResults({ cycle, votes, overrides = {}, tieBreaks = {}, options = {} }) {
  const { products, coordinators, baskets } = cycle;
  const priceOf = new Map(products.map((p) => [p.id, p.price]));
  const prodById = byId(products);
  const coordById = byId(coordinators);
  const issues = [];

  // 1. sanitize votes against the cycle snapshot (never trust client-side validation)
  const clean = {}; // coordId -> { basketId -> items }
  for (const [cid, vote] of Object.entries(votes)) {
    const c = coordById.get(cid);
    if (!c) { issues.push({ type: 'unknown_coordinator', coordinatorId: cid }); continue; }
    clean[cid] = {};
    for (const b of baskets) {
      const raw = (vote.baskets || {})[b.id] || {};
      const items = {};
      for (const [pid, q] of Object.entries(raw)) {
        const p = prodById.get(pid);
        if (!p) { issues.push({ type: 'unknown_product', coordinatorId: cid, basketId: b.id, pid }); continue; }
        if (!eligible(p, c)) { issues.push({ type: 'ineligible_product', coordinatorId: cid, basketId: b.id, pid }); continue; }
        if (!(q > 0)) continue;
        if (q > p.max) issues.push({ type: 'over_max', coordinatorId: cid, basketId: b.id, pid, qty: q, max: p.max });
        items[pid] = Math.min(q, p.max);
      }
      const cost = basketCost(items, priceOf);
      if (cost > b.budget + EPS) {
        issues.push({ type: 'over_budget', coordinatorId: cid, basketId: b.id, cost, budget: b.budget });
        continue; // this basket of this voter is excluded; the voter's other baskets still count
      }
      if (cost > EPS) clean[cid][b.id] = items;
    }
  }

  // 2. alignment per group
  const groups = [...new Set(baskets.map((b) => b.group))];
  const alignment = {};
  const aligned = {}; // coordId -> basketId -> items (after alignment)
  for (const cid of Object.keys(clean)) aligned[cid] = { ...clean[cid] };
  for (const g of groups) {
    const bA = baskets.find((b) => b.group === g && b.slot === 'A');
    const bB = baskets.find((b) => b.group === g && b.slot === 'B');
    if (!bA || !bB) continue;
    const voters = Object.keys(clean)
      .filter((cid) => clean[cid][bA.id] && clean[cid][bB.id])
      .map((cid) => ({
        id: cid, weight: coordById.get(cid).weight, submittedAt: votes[cid].submittedAt || 0,
        a: clean[cid][bA.id], b: clean[cid][bB.id],
      }));
    const info = alignGroup({
      voters, priceOf, overrides: overrides[g] || {}, margin: options.alignMargin ?? DEFAULT_ALIGN_MARGIN,
    });
    alignment[g] = Object.fromEntries(info);
    if (options.align !== false) {
      for (const [cid, inf] of info) {
        if (inf.swapped) { aligned[cid][bA.id] = clean[cid][bB.id]; aligned[cid][bB.id] = clean[cid][bA.id]; }
      }
    }
  }

  // 3. per-basket aggregation (two-baskets view)
  const result = {};
  for (const b of baskets) {
    const voters = Object.keys(aligned)
      .filter((cid) => aligned[cid][b.id])
      .map((cid) => ({ id: cid, weight: coordById.get(cid).weight, branchId: coordById.get(cid).branchId, items: aligned[cid][b.id] }));
    result[b.id] = {
      basketId: b.id, name: b.name, group: b.group, slot: b.slot,
      ...aggregateBasket({
        budget: b.budget, products, voters, priceOf,
        allowPartialFit: !!options.allowPartialFit, tieBreaks: tieBreaks[b.id] || [],
      }),
    };
  }

  // 4. pooled view (single consensus basket per group). Invariant to A/B order by construction.
  const pooled = {};
  for (const g of groups) {
    const gb = baskets.filter((b) => b.group === g);
    const voters = [];
    for (const cid of Object.keys(clean)) {
      const parts = gb.map((b) => clean[cid][b.id]).filter(Boolean);
      if (!parts.length) continue;
      const items = {};
      for (const part of parts) for (const [pid, q] of Object.entries(part)) items[pid] = (items[pid] || 0) + q / parts.length;
      const c = coordById.get(cid);
      voters.push({ id: cid, weight: c.weight, branchId: c.branchId, items });
    }
    const budget = gb.reduce((a, b) => a + b.budget, 0) / gb.length;
    pooled[g] = {
      group: g,
      ...aggregateBasket({
        budget, products, voters, priceOf, allowPartialFit: !!options.allowPartialFit, tieBreaks: tieBreaks[g] || [],
      }),
    };
  }

  const submitted = Object.keys(clean);
  return {
    baskets: result, pooled, alignment, issues, aligned,
    coverage: {
      voters: submitted.length, totalVoters: coordinators.length,
      weight: submitted.reduce((a, cid) => a + coordById.get(cid).weight, 0),
      totalWeight: coordinators.reduce((a, c) => a + c.weight, 0),
    },
  };
}

// Turns results into purchase lines. multipliers = number of physical baskets of each type to produce in the cycle.
//   view 'two_baskets': multipliers keyed by basketId  (e.g. {a: 120, b: 120, a_ext: 120, b_ext: 120})
//   view 'pooled'     : multipliers keyed by group     (e.g. {main: 240, ext: 240})
// NOTE: how multipliers are derived (households x distributions) depends on the report format. See SPEC.md §10.
export function buildOrderLines({ results, multipliers, products, view = 'two_baskets' }) {
  const prodById = byId(products);
  const lines = new Map();
  const source = view === 'pooled' ? results.pooled : results.baskets;
  for (const [key, r] of Object.entries(source)) {
    const mult = multipliers[key] ?? 0;
    for (const w of r.winners) {
      const p = prodById.get(w.pid);
      const l = lines.get(w.pid) || { pid: w.pid, name: p.name, cat: p.cat, unitPrice: p.price, qtyPerBasket: {}, qty: 0, cost: 0 };
      l.qtyPerBasket[key] = w.qty;
      l.qty += w.qty * mult;
      l.cost += w.qty * mult * p.price;
      lines.set(w.pid, l);
    }
  }
  return [...lines.values()].sort((a, b) => (a.cat === b.cat ? b.cost - a.cost : a.cat === 'dry' ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Order planning (SPEC §10).  ORDER branches (14, e.g. "Savta Rivka") are not VOTING branches (7 + 3 in holidays).
//
// 1. distributionPlan(): how many physical baskets a branch gets in the period (admin-only inputs):
//      distributions = floor(weeksInPeriod / frequencyWeeks)   <- odd remainders are rounded DOWN
//      total = distributions * avgBasketsPerDistribution;  A = ceil(total/2), B = floor(total/2); ext baskets follow their pair.
//    Holidays: one distribution (weeksInPeriod = frequencyWeeks).
// 2. computeBranchBaskets(): what EACH voting branch chose (its coordinators' aligned votes, aggregated per basket).
// 3. planOrder(): quantities and cost per order branch.
//      view 'weighted'  -> every branch gets the weighted/synchronised baskets  (output 1: one consolidated order)
//      view 'by_branch' -> each branch gets exactly its own choice; branches that did not choose (no voting right,
//                          or did not vote) get the weighted basket, and are only FLAGGED in branchStatus (never in the file).
//    scope: list of supplier ids that are ordered ([ 'dry' ] for half-year, null = all suppliers for holidays).
//    Money: computed for every supplier in scope (shown in the system). Excel price columns: only suppliers with showPrices.
// ---------------------------------------------------------------------------
export function distributionPlan({ weeksInPeriod, frequencyWeeks, avgBaskets }) {
  if (!(frequencyWeeks > 0) || !(weeksInPeriod > 0) || !(avgBaskets > 0)) return { distributions: 0, total: 0, counts: { a: 0, b: 0, a_ext: 0, b_ext: 0 } };
  const distributions = Math.floor(weeksInPeriod / frequencyWeeks);
  const total = distributions * Math.floor(avgBaskets);
  const a = Math.ceil(total / 2), b = Math.floor(total / 2);
  return { distributions, total, counts: { a, b, a_ext: a, b_ext: b } };
}

export function computeBranchBaskets({ cycle, results, options = {} }) {
  const { products, coordinators, baskets } = cycle;
  const coordById = byId(coordinators);
  const priceOf = new Map(products.map((p) => [p.id, p.price]));
  const out = {};
  const branches = [...new Set(Object.keys(results.aligned).map((cid) => coordById.get(cid).branchId))].sort();
  for (const br of branches) {
    const res = { baskets: {} };
    for (const b of baskets) {
      const voters = Object.keys(results.aligned)
        .filter((cid) => coordById.get(cid).branchId === br && results.aligned[cid][b.id])
        .map((cid) => ({ id: cid, weight: coordById.get(cid).weight, branchId: br, items: results.aligned[cid][b.id] }));
      if (!voters.length) continue;
      res.baskets[b.id] = aggregateBasket({ budget: b.budget, products, voters, priceOf, allowPartialFit: !!options.allowPartialFit });
    }
    if (Object.keys(res.baskets).length) out[br] = res;
  }
  return out;
}

const VAT_DEFAULT = 1.18;
export function unitPrice(product, orderBranch, cycleType) {
  let price = product.price;
  if (product.holidayPrice != null && (cycleType === 'pesach' || cycleType === 'rosh_hashana')) price = product.holidayPrice;
  const v = product.priceVariants;                     // e.g. eggs: { attr: 'eggPack', prices: { 12: 11.8, 18: 17.7 } }
  if (v && orderBranch?.attrs && v.prices[orderBranch.attrs[v.attr]] != null) price = v.prices[orderBranch.attrs[v.attr]];
  return price;
}

export function planOrder({
  results, branchResults = {}, products, orderBranches, view = 'weighted', scope = null, cycleType = 'half_year_1',
  suppliers = {}, votingBranchIds = [],
}) {
  const supplierOf = (p) => p.supplier || 'dry';
  const rows = new Map();
  const totals = { cost: 0, byBranch: {}, bySupplier: {} };
  const branchStatus = [];
  for (const b of orderBranches) {
    totals.byBranch[b.id] = 0;
    const own = view === 'by_branch' ? branchResults[b.votingBranchId] : null;
    branchStatus.push({
      id: b.id,
      source: own ? 'own' : 'weighted',
      reason: own ? 'voted' : (!b.votingBranchId || !votingBranchIds.includes(b.votingBranchId) ? 'no_voting_right' : 'did_not_vote'),
    });
    for (const p of products) {
      const sup = supplierOf(p);
      if (scope && !scope.includes(sup)) continue;
      if (b.suppliers && !b.suppliers.includes(sup)) continue;     // supplier does not deliver to this branch
      let q = 0;
      for (const [key, n] of Object.entries(b.counts || {})) {
        const src = (own?.baskets[key]) || results.baskets[key];    // missing own basket -> weighted basket
        q += n * (src?.winners.find((w) => w.pid === p.id)?.qty ?? 0);
      }
      if (!q) continue;
      const price = unitPrice(p, b, cycleType);
      const row = rows.get(p.id) || { pid: p.id, name: p.name, supplier: sup, showPriceInExcel: !!(suppliers[sup]?.showPrices ?? sup === 'dry'), perBranch: {}, qty: 0, cost: 0 };
      row.perBranch[b.id] = { qty: q, unitPrice: price, cost: q * price };
      row.qty += q; row.cost += q * price;
      rows.set(p.id, row);
      totals.cost += q * price;
      totals.byBranch[b.id] += q * price;
      totals.bySupplier[sup] = (totals.bySupplier[sup] || 0) + q * price;
    }
  }
  return { rows: [...rows.values()], totals, branchStatus };
}

// Both totals side by side for the admin dashboard (SPEC §10.4)
export function compareViews(args) {
  const weighted = planOrder({ ...args, view: 'weighted' });
  const byBranch = planOrder({ ...args, view: 'by_branch' });
  return { weighted, byBranch, diff: byBranch.totals.cost - weighted.totals.cost };
}

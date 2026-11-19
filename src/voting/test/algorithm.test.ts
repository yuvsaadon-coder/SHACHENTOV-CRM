// Port of reference/algorithm.test.mjs. These tests are the contract: keep them identical in meaning.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import seedJson from '../seed/seed.json'
import {
  computeCycleResults, aggregateBasket, overlap, buildOrderLines, eligible, planOrder, distributionPlan,
  computeBranchBaskets, compareViews, unitPrice,
} from '../lib/algorithm'
import type { Product, Coordinator, Basket, Items, Vote, OrderBranch } from '../lib/algorithm'

const seed = seedJson as unknown as { products: Product[]; coordinators: Coordinator[]; basketTemplate: Basket[] }
const cycle = { products: seed.products, coordinators: seed.coordinators, baskets: seed.basketTemplate }
const priceOf = new Map(seed.products.map((p) => [p.id, p.price]))
const vote = (baskets: Record<string, Items>, submittedAt = 1): Vote => ({ baskets, submittedAt })

// Distinct baskets, each <= 80 / <= 20 NIS
const X = { pasta: 4, rice: 3, oil: 2, tuna: 4 };            // 10.4+19.83+14.64+13.2 = 58.07
const Y = { chickpeas: 5, tahini: 3, eggs: 2, sugar: 2 };    // 26.55+27.96+23.4+8.26 = 86.17 -> too much, trimmed below
const Y2 = { chickpeas: 4, tahini: 2, eggs: 2, sugar: 2 };   // 21.24+18.64+23.4+8.26 = 71.54
const EXT1 = { coffee: 1, choco: 1 };                         // 15.10
const EXT2 = { challah: 2, olives: 1 };                       // 17.39

test('fixture sanity: costs within budgets', () => {
  const c = (items: Items) => Object.entries(items).reduce((s, [p, q]) => s + priceOf.get(p)! * q, 0);
  assert.ok(c(X) <= 80 && c(Y2) <= 80 && c(EXT1) <= 20 && c(EXT2) <= 20);
  assert.ok(c(Y) > 80); // Y is intentionally over budget (used in the over-budget test)
});

test('single voter: winners equal the voter basket', () => {
  const r = computeCycleResults({ cycle, votes: { yoh: vote({ a: X, b: Y2, a_ext: EXT1, b_ext: EXT2 }) } });
  assert.deepEqual(Object.fromEntries(r.baskets.a!.winners.map((w) => [w.pid, w.qty])), X);
  assert.ok(r.baskets.a!.used <= 80 + 1e-9);
  assert.equal(r.coverage.voters, 1);
  assert.equal(r.alignment.main!.yoh.swapped, false);
});

test('flipped voter is detected and corrected (two-baskets view)', () => {
  const votes = {
    yoh: vote({ a: X, b: Y2, a_ext: EXT1, b_ext: EXT2 }, 1),
    lea: vote({ a: X, b: Y2, a_ext: EXT1, b_ext: EXT2 }, 2),
    nao: vote({ a: X, b: Y2, a_ext: EXT1, b_ext: EXT2 }, 3),
    yai: vote({ a: Y2, b: X, a_ext: EXT2, b_ext: EXT1 }, 4), // filled everything in reverse order
  };
  const r = computeCycleResults({ cycle, votes });
  assert.equal(r.alignment.main!.yai.swapped, true);
  assert.equal(r.alignment.main!.yai.auto, true);
  assert.equal(r.alignment.ext!.yai.swapped, true);
  // without alignment basket A would be polluted by Y2 items; with alignment it is exactly X
  assert.deepEqual(Object.fromEntries(r.baskets.a!.winners.map((w) => [w.pid, w.qty])), X);
  const raw = computeCycleResults({ cycle, votes, options: { align: false } });
  assert.ok(raw.baskets.a!.winners.some((w) => w.pid === 'chickpeas'));
});

test('pooled view is invariant to A/B order', () => {
  const base = { yoh: vote({ a: X, b: Y2, a_ext: EXT1, b_ext: EXT2 }), lea: vote({ a: X, b: Y2, a_ext: EXT1, b_ext: EXT2 }) };
  const flipped = { ...base, lea: vote({ a: Y2, b: X, a_ext: EXT2, b_ext: EXT1 }) };
  const p1 = computeCycleResults({ cycle, votes: base, options: { align: false } }).pooled;
  const p2 = computeCycleResults({ cycle, votes: flipped, options: { align: false } }).pooled;
  assert.deepEqual(p1.main!.winners.map((w) => [w.pid, w.qty]), p2.main!.winners.map((w) => [w.pid, w.qty]));
});

test('identical A and B baskets are never flipped (no noise)', () => {
  const votes = Object.fromEntries(['yoh', 'lea', 'nao', 'yai'].map((id, i) => [id, vote({ a: X, b: X, a_ext: EXT1, b_ext: EXT1 }, i)]));
  const r = computeCycleResults({ cycle, votes });
  for (const g of ['main', 'ext']) for (const inf of Object.values(r.alignment[g]!)) assert.equal(inf.swapped, false);
});

test('admin override "keep" beats the automatic flip', () => {
  const votes = {
    yoh: vote({ a: X, b: Y2 }, 1), lea: vote({ a: X, b: Y2 }, 2), nao: vote({ a: X, b: Y2 }, 3),
    yai: vote({ a: Y2, b: X }, 4),
  };
  const r = computeCycleResults({ cycle, votes, overrides: { main: { yai: 'keep' } } });
  assert.equal(r.alignment.main!.yai.swapped, false);
  assert.equal(r.alignment.main!.yai.overridden, true);
});

test('eligibility normalisation: veg support is not diluted by branches that cannot see it', () => {
  // baka (yoh, w1) and katamon (tzi w.5) cannot vote for veg. gilo (lea w1) & ramot (yai w1) pick veg x2.
  const items = { veg: 2, pasta: 1 };
  const votes = {
    yoh: vote({ a: { pasta: 1 } }), tzi: vote({ a: { pasta: 1 } }),
    lea: vote({ a: items }), yai: vote({ a: items }),
  };
  const r = computeCycleResults({ cycle, votes });
  const veg = r.baskets.a!.winners.find((w) => w.pid === 'veg');
  assert.ok(veg);
  assert.equal(veg!.eligibleWeight, 2);           // only lea + yai count
  assert.equal(veg!.support, 2);                  // 2*(1+1)/2, NOT 4/3.5
  const pasta = r.baskets.a!.winners.find((w) => w.pid === 'pasta');
  assert.equal(pasta!.eligibleWeight, 3.5);
});

test('ineligible product in a vote is ignored and reported', () => {
  const r = computeCycleResults({ cycle, votes: { yoh: vote({ a: { veg: 1, pasta: 2 } }) } });
  assert.ok(r.issues.some((i) => i.type === 'ineligible_product' && i.pid === 'veg'));
  assert.ok(!r.baskets.a!.winners.some((w) => w.pid === 'veg'));
});

test('over-budget basket is excluded and reported; other baskets of the voter still count', () => {
  const r = computeCycleResults({ cycle, votes: { yoh: vote({ a: Y, b: Y2 }) } });
  assert.ok(r.issues.some((i) => i.type === 'over_budget' && i.basketId === 'a'));
  assert.equal(r.baskets.a!.winners.length, 0);
  assert.ok(r.baskets.b!.winners.length > 0);
});

test('result never exceeds budget and is deterministic regardless of vote order', () => {
  const ids = ['yoh', 'lea', 'nao', 'yai', 'oz', 'tzi', 'yeh'];
  const mk = (i: number) => vote({ a: { pasta: 2 + (i % 3), rice: 1 + (i % 2), tuna: 3, tahini: 2, coffee: 1 }, b: { oil: 2, chickpeas: 3, eggs: 1 + (i % 2) } }, i);
  const votes = Object.fromEntries(ids.map((id, i) => [id, mk(i)]));
  const shuffled = Object.fromEntries([...ids].reverse().map((id) => [id, votes[id]]));
  const r1 = computeCycleResults({ cycle, votes });
  const r2 = computeCycleResults({ cycle, votes: shuffled });
  assert.deepEqual(r1.baskets, r2.baskets);
  for (const b of Object.values(r1.baskets)) assert.ok(b.used <= b.budget + 1e-9);
});

test('tie at the cut is flagged; admin tie-break resolves it', () => {
  // budget fits exactly one of the two equally-supported products (both 7.79 vs 7.79? use olives 7.79 & oil 7.32 w/ budget 8)
  const products = seed.products.filter((p) => ['olives', 'oil'].includes(p.id));
  const voters = [{ id: 'yoh', weight: 1, branchId: 'baka', items: { olives: 1, oil: 1 } }];
  const r = aggregateBasket({ budget: 8, products, voters, priceOf });
  assert.equal(r.ties.length, 1);
  assert.equal(r.ties[0]!.resolvedByAdmin, false);
  const winnerDefault = r.winners[0]!.pid;
  const other = winnerDefault === 'olives' ? 'oil' : 'olives';
  const r2 = aggregateBasket({ budget: 8, products, voters, priceOf, tieBreaks: [other, winnerDefault] });
  assert.equal(r2.winners[0]!.pid, other);
  assert.equal(r2.ties[0]!.resolvedByAdmin, true);
});

test('partial fit option reduces quantity instead of skipping', () => {
  const products = seed.products.filter((p) => p.id === 'tahini');
  const voters = [{ id: 'yoh', weight: 1, branchId: 'baka', items: { tahini: 5 } }];
  const strict = aggregateBasket({ budget: 20, products, voters, priceOf });
  assert.equal(strict.winners.length, 0);
  const partial = aggregateBasket({ budget: 20, products, voters, priceOf, allowPartialFit: true });
  assert.equal(partial.winners[0]!.qty, 2);
  assert.equal(partial.winners[0]!.reduced, true);
});

test('overlap is symmetric, in [0,1], and 1 for identical baskets', () => {
  assert.equal(overlap(X, X, priceOf), 1);
  assert.equal(overlap(X, Y2, priceOf), 0);
  assert.equal(overlap(X, Y2, priceOf), overlap(Y2, X, priceOf));
  assert.equal(overlap({}, {}, priceOf), 1);
});

test('order lines multiply basket quantities by basket counts', () => {
  const r = computeCycleResults({ cycle, votes: { yoh: vote({ a: X, b: X }) } });
  const lines = buildOrderLines({ results: r, multipliers: { a: 100, b: 50 }, products: seed.products });
  const pasta = lines.find((l) => l.pid === 'pasta');
  assert.equal(pasta!.qty, 4 * 100 + 4 * 50);
  assert.equal(Math.round(pasta!.cost * 100) / 100, Math.round(600 * 2.6 * 100) / 100);
});

test('eligible() uses branchId', () => {
  const veg = seed.products.find((p) => p.id === 'veg')!;
  assert.equal(eligible(veg, { branchId: 'baka' }), false);
  assert.equal(eligible(veg, { branchId: 'gilo' }), true);
});

test('distributionPlan rounds distributions down; A gets the odd basket', () => {
  const p = distributionPlan({ weeksInPeriod: 26, frequencyWeeks: 4, avgBaskets: 50 });   // 6.5 -> 6
  assert.equal(p.distributions, 6);
  assert.equal(p.total, 300);
  assert.deepEqual(p.counts, { a: 150, b: 150, a_ext: 150, b_ext: 150 });
  const odd = distributionPlan({ weeksInPeriod: 26, frequencyWeeks: 4, avgBaskets: 51 });
  assert.equal(odd.counts.a, 153); assert.equal(odd.counts.b, 153);
  const one = distributionPlan({ weeksInPeriod: 1, frequencyWeeks: 1, avgBaskets: 85 });
  assert.equal(one.counts.a, 43); assert.equal(one.counts.b, 42);
  assert.equal(distributionPlan({ weeksInPeriod: 26, frequencyWeeks: 0, avgBaskets: 5 }).total, 0);
});

test('by_branch: each branch gets its own choice; non-voters get the weighted basket and are flagged', () => {
  const votes = { yoh: vote({ a: X, b: Y2 }), lea: vote({ a: { pasta: 1, rice: 1 }, b: Y2 }) }; // yoh=baka, lea=gilo
  const r = computeCycleResults({ cycle, votes });
  const bb = computeBranchBaskets({ cycle, results: r });
  assert.deepEqual(Object.keys(bb).sort(), ['baka', 'gilo']);
  const orderBranches: OrderBranch[] = [
    { id: 'baka', votingBranchId: 'baka', counts: { a: 10, b: 0 } },
    { id: 'gilo', votingBranchId: 'gilo', counts: { a: 10, b: 0 } },
    { id: 'savta', counts: { a: 10, b: 0 } },                        // no voting right
    { id: 'ramot', votingBranchId: 'ramot', counts: { a: 10, b: 0 } }, // can vote, did not
  ];
  const args = { results: r, branchResults: bb, products: seed.products, orderBranches, votingBranchIds: ['baka', 'gilo', 'ramot'] };
  const byB = planOrder({ ...args, view: 'by_branch' });
  const pasta = byB.rows.find((x) => x.pid === 'pasta');
  assert.equal(pasta!.perBranch.baka.qty, 40);          // baka chose pasta 4
  assert.equal(pasta!.perBranch.gilo.qty, 10);          // gilo chose pasta 1
  assert.equal(pasta!.perBranch.savta.qty, 10 * r.baskets.a!.winners.find((w) => w.pid === 'pasta')!.qty);
  const st = Object.fromEntries(byB.branchStatus.map((s) => [s.id, s]));
  assert.equal(st.baka!.reason, 'voted'); assert.equal(st.savta!.reason, 'no_voting_right'); assert.equal(st.ramot!.reason, 'did_not_vote');
  assert.equal(st.savta!.source, 'weighted');
  const both = compareViews(args);
  assert.ok(Math.abs(both.diff - (both.byBranch.totals.cost - both.weighted.totals.cost)) < 1e-9);
  assert.notEqual(both.diff, 0);
  // weighted view: all four branches identical
  const w = both.weighted.rows.find((x) => x.pid === 'pasta');
  assert.equal(w!.perBranch.baka.qty, w!.perBranch.gilo.qty);
});

test('scope, supplier delivery lists, holiday and size-based prices', () => {
  const r = computeCycleResults({ cycle, votes: { lea: vote({ a: { pasta: 2, eggs: 2, veg: 1 }, b: Y2 }) } });
  const prods = seed.products.map((p): Product => {
    if (p.id === 'eggs') return { ...p, supplier: 'eggs', priceVariants: { attr: 'eggPack', prices: { 12: 11.8, 18: 17.7 } } };
    if (p.id === 'veg') return { ...p, supplier: 'vegetables', price: 17, holidayPrice: 30 };
    return p;
  });
  const ob: OrderBranch[] = [
    { id: 'x', attrs: { eggPack: 12 }, counts: { a: 10 }, suppliers: ['dry', 'eggs', 'vegetables'] },
    { id: 'y', attrs: { eggPack: 18 }, counts: { a: 10 }, suppliers: ['dry', 'eggs'] },         // no vegetables
  ];
  const base = { results: r, products: prods, orderBranches: ob };
  const half = planOrder({ ...base, cycleType: 'half_year_1', scope: ['dry'] });
  assert.ok(half.rows.every((x) => x.supplier === 'dry'));
  assert.ok(half.rows.every((x) => x.showPriceInExcel));
  const pes = planOrder({ ...base, cycleType: 'pesach' });
  const eggs = pes.rows.find((x) => x.pid === 'eggs');
  assert.equal(eggs!.perBranch.x.unitPrice, 11.8); assert.equal(eggs!.perBranch.y.unitPrice, 17.7);
  assert.equal(eggs!.showPriceInExcel, false);
  const veg = pes.rows.find((x) => x.pid === 'veg');
  assert.equal(veg!.perBranch.x.unitPrice, 30); assert.equal(veg!.perBranch.y, undefined);
  assert.equal(unitPrice(prods.find((p) => p.id === 'veg')!, null, 'half_year_1'), 17);
  assert.ok(pes.totals.bySupplier.eggs! > 0 && pes.totals.bySupplier.dry! > 0);
});

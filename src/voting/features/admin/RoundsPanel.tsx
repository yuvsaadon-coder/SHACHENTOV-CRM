import { useEffect, useMemo, useState } from 'react'
import priceSeed from '../../seed/price-history.json'
import { he } from '../../i18n/he'
import { fmt1, money } from '../../lib/format'
import type { RoundState, VoteDoc, VotingBasket as LegacyBasket, VotingConfig as LegacyConfig } from '../../data/model'
import { expectedVoters } from '../../data/cycle'
import { branchWeights, participates, voterWeights } from '../../data/weights'

const roundOf = (cfg: LegacyConfig): RoundState => cfg.round ?? { num: 1, open: true }
import { buildHistory, periodChanges, upcomingPeriod, type PeriodDecision, type SeedHistory } from '../../lib/prices/history'
import { jerusalemYearMonth } from '../../lib/prices/label'
import { isHolidayOrder, ORDER_TYPES, orderPeriod, recommendBudgets, type OrderType, type RoundMeta } from '../../lib/rounds/recommend'
import type { QuoteRecord } from '../../data/store'
import { Card, Field, SectionHeader } from '../../ui/components'
import { useAdmin } from './context'
import { LegacyImportCard } from './LegacyImportCard'

const PRICE_SEED = priceSeed as unknown as SeedHistory

export function roundLabel(r: { orderType?: string; year?: number }): string {
  return r.orderType && r.year ? he.roundLabel(he.orderType[r.orderType] ?? r.orderType, r.year) : ''
}

export function RoundsPanel() {
  const { config, voteById, expected, store, now } = useAdmin()
  const round = roundOf(config)
  const [baskets, setBaskets] = useState<LegacyBasket[]>(() => config.baskets.map((b) => ({ ...b })))
  const [busy, setBusy] = useState(false)
  const [wizard, setWizard] = useState(false)
  const [opened, setOpened] = useState<string | null>(null)
  const voters = expected
  const submittedCount = voters.filter((e) => voteById[e.id]).length
  const daysOpen = round.openedAt ? Math.floor((now - round.openedAt) / 86_400_000) : null

  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true)
    try { await fn(); if (done) alert(done) } catch (e) { alert(he.errorPrefix + (e instanceof Error ? e.message : String(e))) } finally { setBusy(false) }
  }
  const setRound = (r: RoundState) => store.updateConfigField('round', r)

  const onToggle = () => {
    if (round.open && !confirm(he.confirmClose)) return
    void run(() => setRound({ ...round, open: !round.open }))
  }
  const onReset = () => {
    if (!confirm(he.confirmReset)) return
    void run(() => store.archiveAllVotes(he.archiveReasonReset, round.num))
  }

  return (
    <div>
      <SectionHeader title={he.roundsTitle} subtitle={he.roundsSubtitle} />
      {opened && <div className="notice notice-block" role="status">{opened}</div>}
      {wizard ? (
        <NewRoundWizard onDone={(msg) => { setWizard(false); setOpened(msg) }} onCancel={() => setWizard(false)} />
      ) : (
        <div className="grid-2">
          <Card title={he.currentRound}>
            <div className="small muted">{he.roundNum(round.num)}{roundLabel(round) ? ` · ${roundLabel(round)}` : ''}</div>
            <div style={{ fontSize: 16, fontWeight: 700, margin: '4px 0' }}>
              {round.open ? he.roundOpen : he.roundClosed} · {round.open ? he.votingOpen : he.votingClosed}
              {round.open && daysOpen != null ? ` · ${daysOpen}d` : ''}
            </div>
            <div className="small muted" style={{ marginBlockEnd: 12 }}>{he.votedCount(submittedCount, voters.length)}</div>
            <div className="toolbar" style={{ marginBlockEnd: 0 }}>
              <button type="button" className="btn btn-small" disabled={busy} onClick={onToggle}>{round.open ? he.closeVoting : he.reopenVoting}</button>
              <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={onReset}>{he.resetRound}</button>
            </div>
          </Card>
          <Card title={he.newRoundTitle}>
            <div className="small muted" style={{ marginBlockEnd: 12 }}>{he.wizard.intro}</div>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => { setOpened(null); setWizard(true) }}>{he.wizard.start}</button>
          </Card>
          <Card title={he.budgetsTitle} accent>
            <div className="small muted" style={{ marginBlockEnd: 12 }}>{he.budgetsBody}</div>
            {baskets.map((b, i) => (
              <div key={b.id} className="budget-row">
                <label className="grow" htmlFor={`budget-${b.id}`}>{b.name}</label>
                <span className="muted" aria-hidden>₪</span>
                <input id={`budget-${b.id}`} type="number" min="0" className="input input-num" value={b.budget}
                  onChange={(e) => setBaskets((bs) => bs.map((x, j) => (j === i ? { ...x, budget: parseFloat(e.target.value) || 0 } : x)))} />
              </div>
            ))}
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(() => store.updateConfigField('baskets', baskets), he.budgetsSaved)}>
              {busy ? he.saving : he.saveBudgets}
            </button>
          </Card>
          <LegacyImportCard />
        </div>
      )}
    </div>
  )
}

/** Catalog prices offered in the survey right now (stored with each round for the next recommendation). */
const priceMap = (cfg: LegacyConfig) => Object.fromEntries(cfg.products.filter((p) => p.active !== false).map((p) => [p.id, Number(p.price) || 0]))

function NewRoundWizard({ onDone, onCancel }: { onDone: (msg: string) => void; onCancel: () => void }) {
  const { config, votes, store, now, coordinators, settings, branches } = useAdmin()
  const round = roundOf(config)
  const upcoming = useMemo(() => { const { year, month } = jerusalemYearMonth(now); return upcomingPeriod(year, month) }, [now])
  const [orderType, setOrderType] = useState<OrderType>(upcoming.endsWith('H1') ? 'half_year_1' : 'half_year_2')
  const [year, setYear] = useState(Number(upcoming.slice(0, 4)))
  const [metas, setMetas] = useState<Record<number, RoundMeta>>({})
  const [records, setRecords] = useState<QuoteRecord[]>([])
  const [decisions, setDecisions] = useState<Record<string, PeriodDecision>>({})
  const [refVotes, setRefVotes] = useState<VoteDoc[] | null>(null)
  const [budgets, setBudgets] = useState<Record<string, number> | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => store.subscribeRoundMetas(setMetas), [store])
  useEffect(() => store.subscribeQuoteRecords(setRecords), [store])
  useEffect(() => store.subscribeDecisions(setDecisions), [store])

  // The previous survey to learn from: for a holiday, the last round of the same holiday if there is one;
  // otherwise the current round (its live votes, or what was archived when it was reset), else the round before.
  const ref = useMemo(() => {
    if (isHolidayOrder(orderType)) {
      const same = Object.values(metas).filter((m) => m.orderType === orderType && m.num < round.num).sort((a, b) => b.num - a.num)[0]
      if (same) return { num: same.num, meta: same }
    }
    return { num: round.num, meta: metas[round.num] }
  }, [orderType, metas, round.num])

  useEffect(() => {
    let alive = true
    setRefVotes(null)
    const live = votes
    const load = async () => {
      if (ref.num === round.num && live.length) return live
      const archived = await store.loadArchivedVotes(ref.num)
      return archived.length || ref.num !== round.num ? archived : store.loadArchivedVotes(round.num - 1)
    }
    void load().then((v) => { if (alive) setRefVotes(v) }).catch(() => { if (alive) setRefVotes([]) })
    return () => { alive = false }
  }, [ref.num, round.num, votes, store])

  const trackerChange = useMemo(() => {
    const h = buildHistory(PRICE_SEED, records, config.products.map((p) => ({ id: p.id, name: p.name, supplier: p.supplier as string | undefined })), decisions)
    const ch = periodChanges(h)
    const target = ch.find((c) => c.period === orderPeriod(orderType, year))
    return (target ?? ch.at(-1))?.change ?? null
  }, [records, decisions, config.products, orderType, year])

  // weights of the previous survey's votes, with the formula of that survey's order kind
  const refKind = isHolidayOrder(ref.meta?.orderType ?? round.orderType) ? 'holiday' : 'routine'
  const weightOf = useMemo(() => {
    const vw = voterWeights((refVotes ?? []).map((v) => ({ id: `${v.uid}_${v.branchId}`, branchId: v.branchId })), branchWeights(settings, refKind))
    return new Map(Object.entries(vw))
  }, [refVotes, settings, refKind])
  const recs = useMemo(() => {
    if (!refVotes) return null
    const prevBudgets = ref.meta?.budgets
    return recommendBudgets({
      baskets: config.baskets.map((b) => ({ id: b.id, budget: prevBudgets?.[b.id] ?? b.budget })),
      votes: refVotes.filter((v) => weightOf.has(`${v.uid}_${v.branchId}`)).map((v) => ({
        weight: weightOf.get(`${v.uid}_${v.branchId}`)!,
        baskets: { a: v.baskets.a ?? {}, a_ext: v.baskets.a_ext ?? {}, b: v.baskets.b ?? {}, b_ext: v.baskets.b_ext ?? {} },
      })),
      surveyPrices: ref.meta?.priceSnapshot ?? null,
      currentPrices: priceMap(config),
      trackerChange,
    })
  }, [refVotes, ref.meta, config, weightOf, trackerChange])

  // prefill with the recommendations whenever they are (re)computed
  useEffect(() => { if (recs) setBudgets(Object.fromEntries(recs.map((r) => [r.basketId, r.recommended]))) }, [recs])

  const kind = isHolidayOrder(orderType) ? 'holiday' : 'routine'
  const who = expectedVoters(coordinators, settings, kind)
  const nextWeights = branchWeights(settings, kind)
  const holidayEmpty = isHolidayOrder(orderType)
    ? branches.filter((b) => settings[b.id]?.votesIn === 'holidays' && participates(settings[b.id], 'holiday') && !coordinators.some((c) => c.branchIds.includes(b.id))).map((b) => b.name)
    : []
  const label = he.roundLabel(he.orderType[orderType]!, year)
  const refLabel = he.wizard.previousRound(ref.num, ref.meta ? roundLabel(ref.meta) : roundLabel(round))

  const open = async () => {
    if (!budgets || !confirm(he.wizard.confirm(round.num + 1, label))) return
    setBusy(true)
    try {
      const stamp = Date.now()
      const periodId = orderPeriod(orderType, year)
      // close the current round in the history (budgets as they were, if it was opened before the wizard existed)
      await store.saveRoundMeta({
        num: round.num, closedAt: stamp,
        ...(metas[round.num]?.budgets ? {} : { budgets: Object.fromEntries(config.baskets.map((b) => [b.id, b.budget])) }),
        ...(round.orderType ? { orderType: round.orderType, year: round.year, periodId: round.periodId } : {}),
      })
      await store.archiveAllVotes(he.archiveReasonNewRound, round.num)
      await store.updateConfigField('baskets', config.baskets.map((b) => ({ ...b, budget: budgets[b.id] ?? b.budget })))
      await store.updateConfigField('round', { num: round.num + 1, open: true, openedAt: stamp, orderType, year, periodId })
      await store.saveRoundMeta({ num: round.num + 1, orderType, year, periodId, budgets, priceSnapshot: priceMap(config), openedAt: stamp })
      onDone(he.wizard.opened(round.num + 1))
    } catch (e) {
      alert(he.errorPrefix + (e instanceof Error ? e.message : String(e)))
    } finally { setBusy(false) }
  }

  return (
    <Card title={he.wizard.title(round.num + 1)} accent>
      <p className="small" style={{ marginBlockStart: 0 }}>{he.wizard.intro}</p>
      <div className="quote-form">
        <fieldset className="vat-choice">
          <legend>{he.wizard.orderType}</legend>
          {ORDER_TYPES.map((t) => (
            <label key={t}><input type="radio" name="orderType" value={t} checked={orderType === t} onChange={() => setOrderType(t)} /> {he.orderType[t]}</label>
          ))}
        </fieldset>
        <Field label={he.wizard.year}>
          <input className="input input-num" type="number" min="2024" max="2100" value={year} onChange={(e) => setYear(parseInt(e.target.value, 10) || year)} />
        </Field>
      </div>
      <p className="small">
        {he.wizard.participants(who.length, fmt1(Object.values(nextWeights).reduce((s, w) => s + w, 0)))}
        {isHolidayOrder(orderType) && <> {he.wizard.holidayNote}</>}
      </p>
      {holidayEmpty.length > 0 && <div className="banner-warn small" role="status">{he.wizard.holidayMissing(holidayEmpty.join(', '))}</div>}

      <h3 className="wizard-sub">{he.wizard.budgetsTitle}</h3>
      {!recs || !budgets ? <p className="small muted">{he.wizard.loading}</p> : (
        <>
          <p className="small">{refVotes && refVotes.length ? he.wizard.basedOn(refLabel) : he.wizard.basedOnNone}</p>
          <div className="table-wrap">
            <table className="data quote-table">
              <thead>
                <tr>
                  <th>{he.wizard.colBasket}</th><th>{he.wizard.colPrev}</th><th>{he.wizard.colFill}</th>
                  <th>{he.wizard.colPrice}</th><th>{he.wizard.colRec}</th><th>{he.wizard.colNew}</th>
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => {
                  const b = config.baskets.find((x) => x.id === r.basketId)!
                  return (
                    <tr key={r.basketId}>
                      <td data-label={he.wizard.colBasket} className="cell-strong">{b.name}</td>
                      <td data-label={he.wizard.colPrev}>{money(r.previousBudget, { trim: true })}</td>
                      <td data-label={he.wizard.colFill}>
                        {r.fillRate == null ? he.dash : `${Math.round(r.fillRate * 100)}%`}
                        {r.fillRate != null && r.fillRate >= 0.95 && <span className="chip chip-warn" style={{ marginInlineStart: 6 }}>{he.wizard.tight}</span>}
                      </td>
                      <td data-label={he.wizard.colPrice}>
                        {r.priceChange == null ? he.dash : he.prices.pct(r.priceChange)}
                        <div className="small muted">{r.priceSource === 'snapshot' ? he.wizard.sourceSnapshot : r.priceSource === 'tracker' ? he.wizard.sourceTracker : he.wizard.sourceNone}</div>
                      </td>
                      <td data-label={he.wizard.colRec}><b>{money(r.recommended, { trim: true })}</b></td>
                      <td data-label={he.wizard.colNew}>
                        <input aria-label={`${he.wizard.colNew}: ${b.name}`} type="number" min="1" className="input input-num" value={budgets[r.basketId] ?? ''}
                          onChange={(e) => { const v = parseFloat(e.target.value); setBudgets((x) => ({ ...x, [r.basketId]: Number.isFinite(v) && v > 0 ? v : 0 })) }} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted">{he.wizard.explain}</p>
        </>
      )}
      <div className="toolbar" style={{ marginBlockEnd: 0 }}>
        <button type="button" className="btn btn-primary" disabled={busy || !budgets || Object.values(budgets).some((v) => !(v > 0))} onClick={() => void open()}>{he.wizard.open}</button>
        {recs && <button type="button" className="btn btn-small" onClick={() => setBudgets(Object.fromEntries(recs.map((r) => [r.basketId, r.recommended])))}>{he.wizard.useAll}</button>}
        <button type="button" className="btn btn-small" onClick={onCancel}>{he.cancel}</button>
      </div>
    </Card>
  )
}

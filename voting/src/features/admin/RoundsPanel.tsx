import { useState } from 'react'
import { he } from '../../i18n/he'
import { roundOf, type LegacyBasket, type RoundState } from '../../data/legacy'
import { Card, SectionHeader } from '../../ui/components'
import { useAdmin } from './context'

export function RoundsPanel() {
  const { config, votes, store, now } = useAdmin()
  const round = roundOf(config)
  const [baskets, setBaskets] = useState<LegacyBasket[]>(() => config.baskets.map((b) => ({ ...b })))
  const [busy, setBusy] = useState(false)
  const submittedCount = config.coordinators.filter((c) => votes[c.id]).length
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
  const onNewRound = () => {
    if (!confirm(he.confirmNewRound(round.num))) return
    void run(async () => {
      await store.archiveAllVotes(he.archiveReasonNewRound, round.num)
      await setRound({ num: round.num + 1, open: true, openedAt: Date.now() })
    })
  }

  return (
    <div>
      <SectionHeader title={he.roundsTitle} subtitle={he.roundsSubtitle} />
      <div className="grid-2">
        <Card title={he.currentRound}>
          <div className="small muted">{he.roundNum(round.num)}</div>
          <div style={{ fontSize: 16, fontWeight: 700, margin: '4px 0' }}>
            {round.open ? he.roundOpen : he.roundClosed} · {round.open ? he.votingOpen : he.votingClosed}
            {round.open && daysOpen != null ? ` · ${daysOpen}d` : ''}
          </div>
          <div className="small muted" style={{ marginBlockEnd: 12 }}>{he.votedCount(submittedCount, config.coordinators.length)}</div>
          <div className="toolbar" style={{ marginBlockEnd: 0 }}>
            <button type="button" className="btn btn-small" disabled={busy} onClick={onToggle}>{round.open ? he.closeVoting : he.reopenVoting}</button>
            <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={onReset}>{he.resetRound}</button>
          </div>
        </Card>
        <Card title={he.newRoundTitle}>
          <div className="small muted" style={{ marginBlockEnd: 12 }}>{he.newRoundBody}</div>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onNewRound}>{he.newRound(round.num + 1)}</button>
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
      </div>
    </div>
  )
}

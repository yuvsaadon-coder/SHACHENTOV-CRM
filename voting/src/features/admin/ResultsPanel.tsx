import { useState } from 'react'
import { he } from '../../i18n/he'
import { fmt2, money } from '../../lib/format'
import { downloadCsv } from '../../lib/csv'
import type { BasketAggregate, ProductStat, Winner } from '../../lib/algorithm'
import { BudgetBar, Card, SectionHeader } from '../../ui/components'
import { useAdmin } from './context'
import { participants } from '../../data/legacy'

export function WinnersTable({ winners, showPickers = true }: { winners: Winner[]; showPickers?: boolean }) {
  const total = winners.reduce((s, w) => s + w.cost, 0)
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>{he.colIndex}</th><th>{he.colProduct}</th><th>{he.colQty}</th><th>{he.colPrice}</th>
            <th>{he.colTotal}</th><th>{he.colSupport}</th>{showPickers && <th>{he.colPickers}</th>}
          </tr>
        </thead>
        <tbody>
          {winners.map((w, i) => (
            <tr key={w.pid}>
              <td>{i + 1}</td>
              <td className="cell-strong"><span className="emoji" aria-hidden>{w.emoji}</span>{w.name}</td>
              <td>{w.qty}</td>
              <td>{money(w.price)}</td>
              <td>{money(w.cost)}</td>
              <td><b>{fmt2(w.support)}</b></td>
              {showPickers && <td>{w.pickedByCount}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={4}>{he.total}</td><td>{money(total)}</td><td colSpan={showPickers ? 2 : 1} /></tr>
        </tfoot>
      </table>
    </div>
  )
}

function TiesCard({ agg }: { agg: BasketAggregate }) {
  const all = [...agg.winners, ...agg.notSelected]
  const nameOf = (pid: string) => all.find((s) => s.pid === pid)
  if (!agg.ties.length) return null
  return (
    <Card title={he.tieNeedsDecision} accent>
      {agg.ties.map((t, i) => (
        <div key={i} style={{ marginBlockEnd: 12 }}>
          <div className="muted small" style={{ marginBlockEnd: 4 }}>{he.tieSupport(fmt2(t.support), t.pids.length)}</div>
          {t.pids.map((pid) => {
            const s = nameOf(pid)
            return (
              <div key={pid} className="tie-item">
                <span aria-hidden>{s?.emoji}</span>
                <span className="grow">{s?.name ?? pid}</span>
                <span className="small">{t.selected.includes(pid) ? `✓ ${he.tieIn}` : `✗ ${he.tieOut}`}</span>
              </div>
            )
          })}
        </div>
      ))}
    </Card>
  )
}

function NotSelectedCard({ list }: { list: ProductStat[] }) {
  return (
    <Card title={he.notSelected}>
      <div className="scroll-y">
        {list.slice(0, 10).map((s) => (
          <div key={s.pid} className="list-row">
            <span aria-hidden>{s.emoji}</span><span className="grow">{s.name}</span><span className="muted">{fmt2(s.support)}</span>
          </div>
        ))}
        {!list.length && <div className="muted small">{he.dash}</div>}
      </div>
    </Card>
  )
}

export function ResultsPanel() {
  const { config, results, snapshot } = useAdmin()
  const [open, setOpen] = useState(config.baskets[0]?.id ?? 'a')
  const totalTies = Object.values(results.baskets).reduce((s, r) => s + r.ties.length, 0)
  const r = results.baskets[open]
  const coordName = (id: string) => config.coordinators.find((c) => c.id === id)?.name ?? id
  const align = r ? results.alignment[r.group] ?? {} : {}
  const swapped = Object.entries(align).filter(([, a]) => a.swapped).map(([id]) => coordName(id))
  const uncertain = Object.entries(align).filter(([, a]) => a.uncertain).map(([id]) => coordName(id))

  const exportCsv = () => {
    const rows: (string | number)[][] = [[he.colBasket, he.colProduct, he.colQty, he.colUnitPrice, he.colTotal, he.colSupport, he.colPickers]]
    for (const b of snapshot.baskets) {
      for (const w of results.baskets[b.id]?.winners ?? []) {
        rows.push([b.name ?? b.id, w.name, w.qty, w.price.toFixed(2), w.cost.toFixed(2), w.support.toFixed(2), w.pickedByCount])
      }
    }
    downloadCsv(rows, he.csvResults)
  }

  return (
    <div>
      <SectionHeader title={he.tabs.results} subtitle={he.resultsSubtitle} />
      <div className="toolbar">
        {config.baskets.map((b) => {
          const rb = results.baskets[b.id]
          return (
            <button type="button" key={b.id} className="seg" aria-pressed={open === b.id} onClick={() => setOpen(b.id)}>
              {b.name} · {money(rb?.used ?? 0, { trim: true })}/{money(b.budget, { trim: true })}
              {rb && rb.ties.length > 0 && <span aria-label={he.tieNeedsDecision}> ⚠️</span>}
            </button>
          )
        })}
        <button type="button" className="btn btn-small push-end" onClick={exportCsv}>{he.exportCsv}</button>
      </div>

      {totalTies > 0 && (
        <div className="banner-warn" role="status">
          <div aria-hidden style={{ fontSize: 24 }}>⚠️</div>
          <div><strong>{he.tiesBanner(totalTies)}</strong><span className="small">{he.tiesBody}</span></div>
        </div>
      )}

      {r && (
        <div className="grid-results">
          <Card title={he.winnerBasket(r.name ?? r.basketId)}>
            <BudgetBar used={r.used} budget={r.budget} ofLabel={he.of} />
            <WinnersTable winners={r.winners} />
          </Card>
          <div className="stack">
            <TiesCard agg={r} />
            <Card title={he.alignmentTitle}>
              <div className="small">
                {swapped.length ? he.alignmentSwapped(swapped.join(', ')) : he.alignmentNone}
                {uncertain.length > 0 && <div className="txt-warn" style={{ marginInlineStart: 0, marginBlockStart: 6 }}>{he.alignmentUncertain(uncertain.join(', '))}</div>}
              </div>
            </Card>
            {results.issues.length > 0 && (
              <Card title={he.issuesTitle}>
                <div className="scroll-y">
                  {results.issues.map((iss, i) => (
                    <div key={i} className="list-row">
                      <span className="grow">{coordName(iss.coordinatorId)}</span>
                      <span className="muted">{he.issue[iss.type]}{'basketId' in iss ? ` · ${config.baskets.find((b) => b.id === iss.basketId)?.name ?? iss.basketId}` : ''}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <NotSelectedCard list={r.notSelected} />
          </div>
        </div>
      )}
    </div>
  )
}

export function OptimalPanel() {
  const { config, votes, results } = useAdmin()
  const totalVotes = participants(config).filter((c) => votes[c.id]).length
  const main = results.pooled.main
  const ext = results.pooled.ext

  const exportCsv = () => {
    const rows: (string | number)[][] = [[he.colCategory, he.colProduct, he.colQty, he.colUnitPrice, he.colTotal, he.colSupport]]
    for (const w of main?.winners ?? []) rows.push([he.catMain, w.name, w.qty, w.price.toFixed(2), w.cost.toFixed(2), w.support.toFixed(2)])
    for (const w of ext?.winners ?? []) rows.push([he.catExt, w.name, w.qty, w.price.toFixed(2), w.cost.toFixed(2), w.support.toFixed(2)])
    downloadCsv(rows, he.csvOptimal)
  }

  if (!totalVotes) return <SectionHeader title={he.optimalTitle} subtitle={he.optimalEmpty} />
  return (
    <div>
      <SectionHeader title={he.optimalTitle} subtitle={he.optimalSubtitle} />
      <div className="toolbar"><button type="button" className="btn btn-primary" onClick={exportCsv}>{he.exportCsv}</button></div>
      <div className="grid-2">
        {[{ t: he.optimalMain, a: main }, { t: he.optimalExt, a: ext }].map(({ t, a }) => a && (
          <Card key={t} title={t}>
            <BudgetBar used={a.used} budget={a.budget} ofLabel={he.of} />
            <WinnersTable winners={a.winners} showPickers={false} />
            {a.notSelected.length > 0 && (
              <div className="small muted" style={{ marginBlockStart: 12 }}>
                <b>{he.notIn}</b> {a.notSelected.slice(0, 5).map((s) => s.name).join(' · ')}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}

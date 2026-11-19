import { useState } from 'react'
import { he } from '../../i18n/he'
import { downloadCsv } from '../../lib/csv'
import { Card, SectionHeader } from '../../ui/components'
import { useAdmin } from './context'

export function ComparePanel() {
  const { config, votes, snapshot, branchName } = useAdmin()
  const [basket, setBasket] = useState(config.baskets[0]?.id ?? 'a')
  const counted = new Set(snapshot.coordinators.map((c) => c.id))
  const submitted = votes.filter((v) => counted.has(`${v.uid}_${v.branchId}`)).map((v) => ({ id: `${v.uid}_${v.branchId}`, name: v.name, branch: branchName(v.branchId), vote: v }))
  const weightOf = new Map(snapshot.coordinators.map((c) => [c.id, c.weight]))
  const qtyOf = (cid: string, pid: string) => (submitted.find((s) => s.id === cid)?.vote.baskets[basket as 'a'] ?? {})[pid] ?? 0
  const rowsProducts = config.products.filter((p) => submitted.some((c) => qtyOf(c.id, p.id)))
  const basketName = config.baskets.find((b) => b.id === basket)?.name ?? basket

  const exportCsv = () => {
    const rows: (string | number)[][] = [[he.colProduct, ...submitted.map((c) => c.name)]]
    for (const p of rowsProducts) rows.push([p.name, ...submitted.map((c) => qtyOf(c.id, p.id) || '')])
    downloadCsv(rows, he.csvCompare(basketName))
  }

  return (
    <div>
      <SectionHeader title={he.compareTitle} subtitle={he.compareSubtitle} />
      <div className="toolbar">
        {config.baskets.map((b) => (
          <button type="button" key={b.id} className="seg" aria-pressed={basket === b.id} onClick={() => setBasket(b.id)}>{b.name}</button>
        ))}
        <button type="button" className="btn btn-small push-end" onClick={exportCsv}>{he.exportCsv}</button>
      </div>
      <Card>
        <div className="compare-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="sticky-col">{he.colProduct}</th>
                {submitted.map((c) => (
                  <th key={c.id} style={{ textAlign: 'center', minWidth: 80 }}>
                    <div>{c.name.split(' ')[0]}</div>
                    <div className="muted" style={{ fontWeight: 400, fontSize: 11 }}>{c.branch} · {(weightOf.get(c.id) ?? 0).toFixed(2)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsProducts.map((p) => (
                <tr key={p.id}>
                  <td className="cell-strong sticky-col"><span className="emoji" aria-hidden>{p.emoji}</span>{p.name}</td>
                  {submitted.map((c) => {
                    const q = qtyOf(c.id, p.id)
                    return <td key={c.id} style={{ textAlign: 'center' }}>{q ? <span className="qty-badge">{q}</span> : <span className="muted" aria-label="0">·</span>}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

import { he } from '../../i18n/he'
import { money } from '../../lib/format'
import { downloadCsv } from '../../lib/csv'
import { buildOrderLines } from '../../lib/algorithm'
import { Card, SectionHeader } from '../../ui/components'
import { useAdmin } from './context'

export function ExportPanel() {
  const { results, snapshot } = useAdmin()
  // One basket of each type (legacy shopping list). Real multipliers come with the order reports (Phase 4).
  const multipliers = Object.fromEntries(snapshot.baskets.map((b) => [b.id, 1]))
  const lines = buildOrderLines({ results, multipliers, products: snapshot.products })
  const emoji = new Map(snapshot.products.map((p) => [p.id, p.emoji]))
  const basketName = new Map(snapshot.baskets.map((b) => [b.id, b.name ?? b.id]))
  const inBaskets = (l: (typeof lines)[number]) => Object.keys(l.qtyPerBasket).map((k) => basketName.get(k)).join(' + ')
  const grand = lines.reduce((s, l) => s + l.cost, 0)

  const exportCsv = () => {
    const rows: (string | number)[][] = [[he.colProduct, he.colQty, he.colUnitPrice, he.colTotal, he.colBaskets]]
    for (const l of lines) rows.push([l.name, l.qty, l.unitPrice.toFixed(2), l.cost.toFixed(2), inBaskets(l)])
    rows.push(['', '', '', grand.toFixed(2), ''])
    downloadCsv(rows, he.csvShopping)
  }

  return (
    <div>
      <SectionHeader title={he.exportTitle} subtitle={he.exportSubtitle} />
      <div className="toolbar">
        <button type="button" className="btn btn-primary" onClick={exportCsv}>{he.downloadCsv}</button>
        <button type="button" className="btn btn-small" onClick={() => window.print()}>{he.print}</button>
      </div>
      <Card title={he.shoppingList(lines.length, money(grand))}>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>{he.colProduct}</th><th>{he.colQty}</th><th>{he.colUnitPrice}</th><th>{he.colTotal}</th><th>{he.colBaskets}</th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.pid}>
                  <td className="cell-strong"><span className="emoji" aria-hidden>{emoji.get(l.pid)}</span>{l.name}</td>
                  <td>{l.qty}</td><td>{money(l.unitPrice)}</td><td><b>{money(l.cost)}</b></td>
                  <td className="small muted">{inBaskets(l)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={3}>{he.total}</td><td>{money(grand)}</td><td /></tr></tfoot>
          </table>
        </div>
      </Card>
    </div>
  )
}

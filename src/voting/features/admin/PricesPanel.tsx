import { useEffect, useMemo, useRef, useState } from 'react'
import priceSeed from '../../seed/price-history.json'
import { he } from '../../i18n/he'
import { money } from '../../lib/format'
import { buildHistory, periodChanges, priceAt, type Layer, type PeriodChange, type PeriodDecision, type PriceHistory, type SeedHistory } from '../../lib/prices/history'
import { basketWeights } from '../../lib/prices/suppliers'
import { periodLabel } from '../../lib/prices/label'
import type { QuoteRecord } from '../../data/store'
import { Card, SectionHeader, Stat } from '../../ui/components'
import { useAdmin } from './context'

const PRICE_SEED = priceSeed as unknown as SeedHistory
const pctText = (v: number | null) => (v == null ? he.dash : he.prices.pct(v))

export function PricesPanel() {
  const { config, store, results } = useAdmin()
  const [records, setRecords] = useState<QuoteRecord[]>([])
  const [decisions, setDecisions] = useState<Record<string, PeriodDecision>>({})
  const [layer, setLayer] = useState<Layer>('list')
  useEffect(() => store.subscribeQuoteRecords(setRecords, (e) => console.warn('quote history failed', e)), [store])
  useEffect(() => store.subscribeDecisions(setDecisions, (e) => console.warn('decisions failed', e)), [store])
  const catalog = useMemo(() => config.products.map((p) => ({ id: p.id, name: p.name, supplier: p.supplier as string | undefined })), [config.products])
  const weights = useMemo(() => basketWeights(results), [results])
  const h = useMemo(() => buildHistory(PRICE_SEED, records, catalog, decisions, weights), [records, catalog, decisions, weights])
  const changes = useMemo(() => periodChanges(h, layer), [h, layer])
  const emoji = useMemo(() => new Map(config.products.map((p) => [p.id, p.emoji])), [config.products])

  if (!h.periods.length) return <SectionHeader title={he.prices.title} subtitle={he.prices.empty} />
  const last = changes.at(-1)!
  const first = changes[0]!

  return (
    <div>
      <SectionHeader title={he.prices.title} subtitle={he.prices.subtitle} />
      <div className="toolbar" role="group" aria-label={he.prices.layerLabel}>
        <button type="button" className="seg" aria-pressed={layer === 'list'} onClick={() => setLayer('list')}>{he.prices.layerList}</button>
        <button type="button" className="seg" aria-pressed={layer === 'net'} onClick={() => setLayer('net')}>{he.prices.layerNet}</button>
        {layer === 'net' && <span className="small muted">{he.prices.layerNetHint}</span>}
      </div>
      <div className="grid-stats">
        <Stat accent label={he.prices.statLast(periodLabel(last.period))} value={<>{pctText(last.change)}<div className="stat-sub">{he.prices.comparedOn(last.compared)}</div></>} />
        <Stat label={he.prices.statYear} value={pctText(last.yearChange)} />
        <Stat label={he.prices.statSince(periodLabel(first.period))} value={pctText(last.index / 100 - 1)} />
        <Stat label={he.prices.statItems} value={h.items.length} />
      </div>

      <div style={{ marginBlockEnd: 24 }}>
        <Card title={he.prices.chartTitle}><IndexChart changes={changes} /></Card>
      </div>

      <Card title={<div className="toolbar" style={{ margin: 0 }}><span>{he.prices.tableTitle}</span><button type="button" className="btn btn-small push-end" onClick={() => void exportXlsx(h, changes, layer)}>{he.prices.exportXlsx}</button></div>}>
        <PriceTable h={h} changes={changes} emoji={emoji} layer={layer} />
      </Card>

      <div style={{ marginBlockStart: 24 }}>
        <Card title={he.prices.howTitle}>
          <ul className="small how-list"><li>{he.prices.how1}</li><li>{he.prices.how2}</li><li>{he.prices.how3}</li><li>{he.prices.how4}</li></ul>
        </Card>
      </div>
    </div>
  )
}

/** Supplier names of a period (dry goods first, then other categories). */
function periodSupplier(h: PriceHistory, period: string): string {
  const ch = h.chosen[period] ?? {}
  return Object.entries(ch).sort(([a], [b]) => (a === 'dry' ? -1 : b === 'dry' ? 1 : a < b ? -1 : 1)).map(([, c]) => c.supplier).filter(Boolean).join(' · ')
}

/** No supplier chosen yet for this period: prices shown are the cheapest quote's, provisionally. */
export function isCollecting(h: PriceHistory, period: string): boolean {
  return Object.values(h.chosen[period] ?? {}).some((c) => c.provisional)
}

function PriceTable({ h, changes, emoji, layer }: { h: PriceHistory; changes: PeriodChange[]; emoji: Map<string, string>; layer: Layer }) {
  const nameOf = (k: string) => h.items.find((i) => i.key === k)?.name ?? k
  const names = (keys: string[]) => keys.slice(0, 6).map(nameOf).join(', ') + (keys.length > 6 ? he.prices.andMore(keys.length - 6) : '')
  return (
    <div className="table-wrap price-table-wrap">
      <table className="data price-table">
        <thead>
          <tr>
            <th className="sticky-col">{he.prices.colProduct}</th>
            {h.periods.map((p) => (
              <th key={p}>
                <div>{periodLabel(p)}</div>
                <div className="muted" style={{ fontWeight: 400 }}>{periodSupplier(h, p) || he.dash}</div>
                {isCollecting(h, p) && <div className="chip chip-warn" style={{ display: 'inline-block', marginBlockStart: 2 }}>{he.prices.provisionalTag}</div>}
                {layer === 'net' && (h.rate[p]?.dry ?? 0) > 0 && <div className="chip chip-ok" style={{ display: 'inline-block', marginBlockStart: 2 }}>{he.prices.discountTag(((h.rate[p]!.dry!) * 100).toFixed(1))}</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {h.items.map((it) => (
            <tr key={it.key}>
              <td className="cell-strong sticky-col">
                {it.productId && emoji.get(it.productId) && <span className="emoji" aria-hidden>{emoji.get(it.productId)}</span>}
                {it.name}
                {!it.productId && <div className="small muted">{he.prices.historyOnly}</div>}
              </td>
              {h.periods.map((p) => {
                const o = h.best[p]?.[it.key]
                if (!o) {
                  const label = isCollecting(h, p) ? he.prices.inProgress : he.prices.notSupplied
                  return <td key={p} className="muted" title={label}><span aria-label={label}>{he.dash}</span></td>
                }
                // like the owner's sheet: compare with the immediately previous half-year only, on the same layer
                const i = h.periods.indexOf(p)
                const price = priceAt(h, p, it.key, layer)!
                const prev = i > 0 ? priceAt(h, h.periods[i - 1]!, it.key, layer) : null
                const ch = prev ? price / prev - 1 : null
                const n = h.offers[p]?.[it.key]?.length ?? 1
                return (
                  <td key={p} title={[o.supplier && he.prices.cheapestFrom(o.supplier), n > 1 && he.prices.offersCount(n)].filter(Boolean).join(' · ')}>
                    <div>{money(price)}</div>
                    {ch != null && Math.abs(ch) >= 0.0005 && <div className={`small ${ch > 0 ? 'txt-up' : 'txt-down'}`}>{he.prices.pct(ch)}</div>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="sticky-col">{he.prices.rowChange}</td>
            {changes.map((c) => <td key={c.period}>{pctText(c.change)}</td>)}
          </tr>
          <tr>
            <td className="sticky-col">{he.prices.rowYear}</td>
            {changes.map((c) => <td key={c.period}>{pctText(c.yearChange)}</td>)}
          </tr>
          <tr>
            <td className="sticky-col">{he.prices.rowCompared}</td>
            {changes.map((c) => (
              <td key={c.period} className="small" style={{ fontWeight: 400 }}>
                {c.previous ? c.compared : he.dash}
                {c.newKeys.length > 0 && <div className="muted">{he.prices.newItems(names(c.newKeys))}</div>}
                {c.droppedKeys.length > 0 && <div className="muted">{(isCollecting(h, c.period) ? he.prices.noOfferYet : he.prices.dropped)(names(c.droppedKeys))}</div>}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** Single-series line: chained price index per half-year. Time runs left to right. */
function IndexChart({ changes }: { changes: PeriodChange[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(300, Math.round(e!.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const W = width, H = width < 500 ? 220 : 260, PAD = { l: 40, r: 16, t: 16, b: 32 }
  const narrow = width < 500
  const vals = changes.map((c) => c.index)
  const lo = Math.floor((Math.min(...vals) - 1) / 5) * 5
  const hi = Math.ceil((Math.max(...vals) + 1) / 5) * 5
  const x = (i: number) => PAD.l + (changes.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (changes.length - 1))
  const y = (v: number) => PAD.t + ((hi - v) * (H - PAD.t - PAD.b)) / (hi - lo || 1)
  const step = hi - lo > 40 ? 10 : 5
  const ticks = Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step)
  const path = changes.map((c, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(c.index).toFixed(1)}`).join(' ')
  const h = hover != null ? changes[hover] : null
  const desc = he.prices.chartDesc(periodLabel(changes[0]!.period), periodLabel(changes.at(-1)!.period), changes.at(-1)!.index.toFixed(1))
  return (
    <div className="chart" dir="ltr" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={desc} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD.l - 8} y={y(t)} className="axis" textAnchor="end" dominantBaseline="middle">{t.toFixed(0)}</text>
          </g>
        ))}
        {changes.map((c, i) => (narrow && changes.length > 5 && i % 2 === 1 && i !== changes.length - 1 ? null
          : <text key={c.period} x={x(i)} y={H - 10} className="axis" textAnchor="middle">{periodLabel(c.period, true)}</text>))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="crosshair" />}
        <path d={path} className="line" />
        {changes.map((c, i) => (
          <g key={c.period}>
            <circle cx={x(i)} cy={y(c.index)} r={hover === i ? 6 : 4} className="dot" />
            <circle
              cx={x(i)} cy={y(c.index)} r={18} className="hit" tabIndex={0}
              aria-label={`${periodLabel(c.period)}: ${he.prices.tipIndex(c.index.toFixed(1))}`}
              onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
            />
          </g>
        ))}
      </svg>
      {h && hover != null && (
        <div className="tooltip" dir="rtl" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(h.index) / H) * 100}%` }}>
          <strong>{periodLabel(h.period)}</strong>
          <div>{he.prices.tipIndex(h.index.toFixed(1))}</div>
          {h.change != null && <div className="muted">{he.prices.tipChange(he.prices.pct(h.change), h.compared)}</div>}
        </div>
      )}
    </div>
  )
}

/** Rows in the layout of the owner's spreadsheet: per period a price column, then a % column (none for the first). */
export function trackingRows(h: PriceHistory, changes: PeriodChange[], supplierOf: (p: string) => string, layer: Layer = 'list') {
  type Cell = string | number | Date | null
  const perPeriod = <T,>(price: (p: string, i: number) => T, pct: (p: string, i: number) => T, first: T[]) =>
    h.periods.reduce<T[]>((row, p, i) => (i === 0 ? [...row, price(p, i)] : [...row, price(p, i), pct(p, i)]), first)
  const dates = perPeriod<Cell>((p) => new Date(Date.UTC(Number(p.slice(0, 4)), p.endsWith('H1') ? 0 : 6, 1)), () => null, [null])
  const suppliers = perPeriod<Cell>((p) => supplierOf(p) || null, () => null, [he.prices.xlsxSupplier])
  const heads = perPeriod<Cell>(() => he.prices.xlsxPriceHead, () => he.prices.xlsxPctHead, [he.prices.xlsxProducts])
  const items = h.items.map((it) => perPeriod<Cell>(
    (p) => { const v = priceAt(h, p, it.key, layer); return v != null ? Math.round(v * 1000) / 1000 : null },
    (p, i) => { const v = priceAt(h, p, it.key, layer), prev = priceAt(h, h.periods[i - 1]!, it.key, layer); return v != null && prev ? v / prev - 1 : null },
    [it.name],
  ))
  const byPeriod = new Map(changes.map((c) => [c.period, c]))
  const change = perPeriod<Cell>(() => null, (p) => byPeriod.get(p)?.change ?? null, [he.prices.rowChange])
  const year = perPeriod<Cell>(() => null, (p) => byPeriod.get(p)?.yearChange ?? null, [he.prices.rowYear])
  return { dates, suppliers, heads, items, change, year }
}

async function exportXlsx(h: PriceHistory, changes: PeriodChange[], layer: Layer) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('מעקב', { views: [{ rightToLeft: true }] })
  const t = trackingRows(h, changes, (p) => periodSupplier(h, p), layer)
  ws.addRow([`${he.prices.xlsxTitle} · ${layer === 'net' ? he.prices.layerNet : he.prices.layerList}`]).font = { bold: true, size: 14 }
  const dates = ws.addRow(t.dates); dates.numFmt = 'mm/yyyy'; dates.font = { bold: true }
  ws.addRow(t.suppliers).font = { bold: true }
  ws.addRow(t.heads).font = { bold: true }
  t.items.forEach((r) => ws.addRow(r))
  ws.addRow([])
  ws.addRow(t.change).font = { bold: true }
  ws.addRow(t.year).font = { bold: true }
  // % columns: D, F, H, … (column 2 is the first period's price)
  for (let i = 1; i < h.periods.length; i++) ws.getColumn(2 + i * 2).numFmt = '0.0%'
  ws.getColumn(1).width = 24
  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url; a.download = he.prices.xlsxFile; a.click()
  URL.revokeObjectURL(url)
}

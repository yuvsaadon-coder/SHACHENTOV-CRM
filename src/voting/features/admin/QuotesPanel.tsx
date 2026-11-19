import { useEffect, useMemo, useRef, useState } from 'react'
import seedJson from '../../seed/seed.json'
import priceSeed from '../../seed/price-history.json'
import { he } from '../../i18n/he'
import { money } from '../../lib/format'
import { ACCEPT, readQuoteFile, UnsupportedFileError, type ReadFile } from '../../lib/quotes/extract'
import { AiFailedError, AiUnavailableError, analyzeLocally, analyzeWithAi } from '../../lib/quotes/analyzeClient'
import { buildProposals, finalPrice, offerKey, pctChange } from '../../lib/quotes/plan'
import {
  buildHistory, decisionKey, discountRate, shiftPeriod, upcomingPeriod, type Discount, type PeriodDecision, type SeedHistory,
} from '../../lib/prices/history'
import { basketWeights, compareSuppliers, groupBySupplier, supplierKey } from '../../lib/prices/suppliers'
import { applySupplierChoice } from '../../lib/prices/decide'
import { jerusalemYearMonth, periodLabel } from '../../lib/prices/label'
import type { CatalogEntry, Proposal, ProposalAction, QuoteLine, VatMode } from '../../lib/quotes/types'
import type { QuoteRecord } from '../../data/store'
import { Card, Field, SectionHeader } from '../../ui/components'
import { useAdmin } from './context'

/** Supplier categories (what is ordered). The supplier itself is a free name: one supplier per category per order. */
const CATEGORIES = (seedJson as unknown as { suppliers: { id: string; name: string }[] }).suppliers
const PRICE_SEED = priceSeed as unknown as SeedHistory
const LOW_CONFIDENCE = 0.6
const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.name ?? id

type Phase = { step: 'upload' } | { step: 'busy'; label: string } | { step: 'review' } | { step: 'saved'; message: string }

export function QuotesPanel() {
  const { config, votes, store, now, results } = useAdmin()
  const [category, setCategory] = useState(CATEGORIES[0]?.id ?? 'dry')
  const [supplierName, setSupplierName] = useState('')
  const [vatMode, setVatMode] = useState<VatMode>('auto')
  const [files, setFiles] = useState<File[]>([])
  const [phase, setPhase] = useState<Phase>({ step: 'upload' })
  const [errors, setErrors] = useState<string[]>([])
  const [notices, setNotices] = useState<string[]>([])
  const [aiError, setAiError] = useState<string | null>(null)
  const [readFiles, setReadFiles] = useState<ReadFile[]>([])
  const [method, setMethod] = useState<'ai' | 'local'>('ai')
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [priceEdited, setPriceEdited] = useState<Set<string>>(new Set())
  const [records, setRecords] = useState<QuoteRecord[]>([])
  const [decisions, setDecisions] = useState<Record<string, PeriodDecision>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const upcoming = useMemo(() => { const { year, month } = jerusalemYearMonth(now); return upcomingPeriod(year, month) }, [now])
  const [periodId, setPeriodId] = useState(upcoming)

  useEffect(() => store.subscribeQuoteRecords(setRecords, (e) => console.warn('quote history failed', e)), [store])
  useEffect(() => store.subscribeDecisions(setDecisions, (e) => console.warn('decisions failed', e)), [store])

  const catalog: CatalogEntry[] = useMemo(() => config.products.map((p) => ({ id: p.id, name: p.name, price: Number(p.price) || 0 })), [config.products])
  const productById = useMemo(() => new Map(config.products.map((p) => [p.id, p])), [config.products])
  const weights = useMemo(() => basketWeights(results), [results])
  const history = useMemo(
    () => buildHistory(PRICE_SEED, records, config.products.map((p) => ({ id: p.id, name: p.name, supplier: p.supplier as string | undefined })), decisions, weights),
    [records, config.products, decisions, weights],
  )
  const periodOptions = useMemo(() => [...new Set([...history.periods, upcoming, shiftPeriod(upcoming, 1)])].sort().reverse(), [history.periods, upcoming])
  const knownSuppliers = useMemo(() => [...new Set([
    ...records.filter((r) => (r.supplierId || 'dry') === category).map((r) => supplierKey(r.supplierName)),
    ...(category === 'dry' ? PRICE_SEED.periods.map((p) => supplierKey(p.supplier)) : []),
  ].filter(Boolean))], [records, category])
  const hasOpenVotes = config.round?.open !== false && votes.length > 0
  const name = supplierKey(supplierName)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    // copy now: the input is cleared right after, which empties the live FileList
    const picked = Array.from(list)
    setFiles((f) => [...f, ...picked.filter((n) => !f.some((x) => x.name === n.name && x.size === n.size))])
  }

  const showLines = (lines: QuoteLine[], how: 'ai' | 'local') => {
    setMethod(how)
    setProposals(buildProposals(lines, catalog, vatMode))
    setPriceEdited(new Set())
    setPhase({ step: 'review' })
  }

  const runLocal = async (rf: ReadFile[], extraNotice?: string) => {
    setPhase({ step: 'busy', label: he.quotes.reading })
    const { lines, unreadable } = await analyzeLocally(rf, catalog)
    setNotices([...(extraNotice ? [extraNotice] : []), ...(unreadable.length ? [he.quotes.unreadable(unreadable.join(', '))] : [])])
    showLines(lines, 'local')
  }

  const analyze = async () => {
    setErrors([]); setNotices([]); setAiError(null)
    setPhase({ step: 'busy', label: he.quotes.reading })
    const ok: ReadFile[] = []
    const errs: string[] = []
    for (const f of files) {
      try { ok.push(await readQuoteFile(f)) } catch (e) {
        const code = e instanceof UnsupportedFileError ? e.message : 'type'
        errs.push(code === 'too_big' ? he.quotes.errTooBig(f.name) : code === 'xls' ? he.quotes.errXls(f.name) : he.quotes.errType(f.name))
      }
    }
    setErrors(errs)
    setReadFiles(ok)
    if (!ok.length) { setPhase({ step: 'upload' }); return }
    try {
      const lines = await analyzeWithAi(ok, catalog, name, (d, t) => setPhase({ step: 'busy', label: he.quotes.analyzing(d, t) }))
      setNotices([])
      showLines(lines, 'ai')
    } catch (e) {
      if (e instanceof AiUnavailableError) { await runLocal(ok, he.quotes.noAi); return }
      setAiError(e instanceof AiFailedError ? e.code : String(e))
      setPhase({ step: 'upload' })
    }
  }

  // VAT choice can be changed during review; prices the admin typed by hand are kept.
  useEffect(() => {
    setProposals((ps) => ps.map((p) => (priceEdited.has(p.key) ? p : { ...p, newPrice: finalPrice(p.line, vatMode) })))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute only when the VAT choice changes
  }, [vatMode])

  const patch = (key: string, upd: Partial<Proposal>) => setProposals((ps) => ps.map((p) => (p.key === key ? { ...p, ...upd } : p)))
  const setAction = (p: Proposal, action: ProposalAction) => {
    const productId = action === 'update' ? p.productId ?? p.line.matchId : p.productId
    patch(p.key, { action, productId, oldPrice: productId ? productById.get(productId)?.price ?? null : null })
  }

  const active = proposals.filter((p) => p.newPrice != null && offerKey(p))
  const nMatched = active.filter((p) => p.action === 'update').length
  const nNew = active.filter((p) => p.action === 'add').length

  /** Saving a quote records the supplier's prices for the period. It does not touch the catalog. */
  const saveQuote = async () => {
    if (!active.length || !name) return
    setPhase({ step: 'busy', label: he.quotes.saving })
    const stamp = Date.now()
    const offers = active.map((p) => {
      const key = offerKey(p)!
      return p.action === 'add'
        ? { key, name: p.newName.trim(), productId: null, price: p.newPrice!, emoji: p.emoji || '🛒', cat: p.cat }
        : { key, name: productById.get(key)?.name ?? p.line.name, productId: key, price: p.newPrice! }
    })
    try {
      await store.saveQuoteRecord({
        id: `q${stamp}`, createdAt: stamp, supplierId: category, supplierName: name, fileNames: readFiles.map((f) => f.name),
        method, vatMode, updated: 0, added: 0, changes: [], periodId, offers,
      })
      setPhase({ step: 'saved', message: he.quotes.quoteSaved(name) })
      setFiles([]); setProposals([])
    } catch (e) {
      alert(he.errorPrefix + (e instanceof Error ? e.message : String(e)))
      setPhase({ step: 'review' })
    }
  }

  const busy = phase.step === 'busy'
  return (
    <div>
      <SectionHeader title={he.quotes.title} subtitle={he.quotes.subtitle} />

      {/* shared selection: the quote, the comparison and the discount all refer to this category + order */}
      <div className="quote-form">
        <Field label={he.quotes.category}>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label={he.quotes.period}>
          <select className="input" value={periodId} onChange={(e) => setPeriodId(e.target.value)} disabled={busy}>
            {periodOptions.map((p) => <option key={p} value={p}>{he.quotes.periodOption(periodLabel(p))}</option>)}
          </select>
        </Field>
      </div>

      {phase.step === 'saved' && (
        <div className="notice notice-block" role="status">
          {phase.message}{' '}
          <button type="button" className="btn btn-small" onClick={() => setPhase({ step: 'upload' })}>{he.quotes.startOver}</button>
        </div>
      )}

      {(phase.step === 'upload' || busy) && (
        <Card title={he.quotes.step1}>
          <div className="quote-form">
            <Field label={he.quotes.supplierName}>
              <input className="input" list="known-suppliers" value={supplierName} placeholder={he.quotes.supplierPlaceholder} onChange={(e) => setSupplierName(e.target.value)} disabled={busy} />
              <datalist id="known-suppliers">{knownSuppliers.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <VatChoice value={vatMode} onChange={setVatMode} disabled={busy} />
          </div>

          <div
            className="dropzone" role="button" tabIndex={0} aria-label={he.quotes.dropHint}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
          >
            <div style={{ fontSize: 28 }} aria-hidden>📄</div>
            <strong>{he.quotes.dropHint}</strong>
            <span className="small muted">{he.quotes.dropFormats}</span>
            <input ref={inputRef} type="file" multiple accept={ACCEPT} hidden data-testid="quote-file" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
          </div>

          {files.length > 0 && (
            <ul className="file-list" aria-label={he.quotes.files}>
              {files.map((f) => (
                <li key={f.name + f.size}>
                  <span>{f.name}</span>
                  <button type="button" className="btn btn-small" disabled={busy} aria-label={he.quotes.removeFile(f.name)} onClick={() => setFiles((x) => x.filter((y) => y !== f))}>✕</button>
                </li>
              ))}
            </ul>
          )}

          {errors.map((e) => <div key={e} className="banner-warn small" role="alert">{e}</div>)}
          {aiError && (
            <div className="banner-warn" role="alert">
              <span>{he.quotes.aiFailed(aiError)}</span>
              <button type="button" className="btn btn-small push-end" onClick={() => void runLocal(readFiles)}>{he.quotes.tryLocal}</button>
            </div>
          )}

          <div className="toolbar" style={{ marginBlockStart: 12, marginBlockEnd: 0 }}>
            <button type="button" className="btn btn-primary" disabled={!files.length || busy || !name} onClick={() => void analyze()}>
              {busy ? phase.label : he.quotes.analyze}
            </button>
          </div>
        </Card>
      )}

      {phase.step === 'review' && (
        <Card title={he.quotes.step2} accent>
          {notices.map((n) => <div key={n} className="banner-warn small" role="status">{n}</div>)}
          {proposals.length === 0 ? <p>{he.quotes.nothingFound}</p> : (
            <>
              <div className="toolbar">
                <span className="cell-strong">{he.quotes.summary(nMatched, nNew, proposals.length - active.length)}</span>
                <span className="push-end" />
                <VatChoice value={vatMode} onChange={setVatMode} compact />
              </div>
              <ReviewTable proposals={proposals} products={config.products} productById={productById} patch={patch} setAction={setAction}
                onPriceEdit={(k) => setPriceEdited((s) => new Set(s).add(k))} />
            </>
          )}
          <div className="toolbar" style={{ marginBlockStart: 16, marginBlockEnd: 0 }}>
            <button type="button" className="btn btn-primary" disabled={!active.length} onClick={() => void saveQuote()}>{he.quotes.saveQuote(name, active.length)}</button>
            <button type="button" className="btn btn-small" onClick={() => setPhase({ step: 'upload' })}>{he.cancel}</button>
          </div>
        </Card>
      )}

      <div style={{ marginBlockStart: 24 }}>
        <SupplierChoice periodId={periodId} category={category} records={records} decisions={decisions} weights={weights}
          provisional={history.chosen[periodId]?.[category]?.provisional ?? true} hasOpenVotes={hasOpenVotes} />
      </div>

      <div style={{ marginBlockStart: 24 }}>
        <DiscountCard periodId={periodId} category={category} decision={decisions[decisionKey(periodId, category)]} />
      </div>

      <div style={{ marginBlockStart: 24 }}>
        <Card title={he.quotes.historyTitle}>
          {records.length === 0 ? <div className="muted small">{he.quotes.historyEmpty}</div> : records.map((h) => (
            <div key={h.id} className="list-row">
              <span className="grow">
                <b>{h.supplierName || he.dash}</b> · {categoryLabel(h.supplierId || 'dry')}{h.periodId ? ` · ${periodLabel(h.periodId)}` : ''}
                <span className="muted"> · {new Date(h.createdAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' })} · {h.fileNames.join(', ')}</span>
              </span>
              <span>{he.quotes.historyLine(h.offers?.length ?? 0)} · <span className="muted">{h.method === 'ai' ? he.quotes.methodAi : he.quotes.methodLocal}</span></span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}

function ReviewTable({ proposals, products, productById, patch, setAction, onPriceEdit }: {
  proposals: Proposal[]
  products: { id: string; name: string; emoji: string }[]
  productById: Map<string, { price: number }>
  patch: (key: string, upd: Partial<Proposal>) => void
  setAction: (p: Proposal, a: ProposalAction) => void
  onPriceEdit: (key: string) => void
}) {
  return (
    <div className="table-wrap">
      <table className="data quote-table">
        <thead>
          <tr>
            <th>{he.quotes.colInQuote}</th><th>{he.quotes.colAction}</th><th>{he.quotes.colCatalog}</th>
            <th>{he.quotes.colOld}</th><th>{he.quotes.colNew}</th><th>{he.quotes.colChange}</th>
          </tr>
        </thead>
        <tbody>
          {proposals.map((p) => {
            const pct = p.action === 'update' ? pctChange(p.oldPrice, p.newPrice) : null
            return (
              <tr key={p.key} className={p.action === 'ignore' ? 'is-ignored' : ''}>
                <td data-label={he.quotes.colInQuote}>
                  <div className="cell-strong">{p.line.name}</div>
                  {p.line.note && <div className="small muted">{p.line.note}</div>}
                  {p.line.confidence < LOW_CONFIDENCE && p.action !== 'ignore' && <div className="small txt-warn" style={{ marginInlineStart: 0 }}>{he.quotes.lowConfidence}</div>}
                </td>
                <td data-label={he.quotes.colAction}>
                  <select aria-label={`${he.quotes.colAction}: ${p.line.name}`} className="input" value={p.action} onChange={(e) => setAction(p, e.target.value as ProposalAction)}>
                    <option value="update">{he.quotes.actUpdate}</option>
                    <option value="add">{he.quotes.actAdd}</option>
                    <option value="ignore">{he.quotes.actIgnore}</option>
                  </select>
                </td>
                <td data-label={he.quotes.colCatalog}>
                  {p.action === 'update' && (
                    <select aria-label={`${he.quotes.colCatalog}: ${p.line.name}`} className="input" value={p.productId ?? ''}
                      onChange={(e) => { const id = e.target.value || null; patch(p.key, { productId: id, oldPrice: id ? productById.get(id)?.price ?? null : null }) }}>
                      <option value="">{he.quotes.pickProduct}</option>
                      {products.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                    </select>
                  )}
                  {p.action === 'add' && (
                    <div className="new-product">
                      <input aria-label={`${he.quotes.icon}: ${p.line.name}`} className="input input-emoji" value={p.emoji} onChange={(e) => patch(p.key, { emoji: e.target.value })} />
                      <input aria-label={`${he.quotes.newName}: ${p.line.name}`} className="input" value={p.newName} onChange={(e) => patch(p.key, { newName: e.target.value })} />
                      <select aria-label={`${he.quotes.productCategory}: ${p.line.name}`} className="input" value={p.cat} onChange={(e) => patch(p.key, { cat: e.target.value as 'dry' | 'fresh' })}>
                        <option value="dry">{he.catDry}</option><option value="fresh">{he.catFresh}</option>
                      </select>
                    </div>
                  )}
                </td>
                <td data-label={he.quotes.colOld}>{p.action === 'update' && p.oldPrice != null ? money(p.oldPrice) : he.dash}</td>
                <td data-label={he.quotes.colNew}>
                  <input aria-label={`${he.quotes.colNew}: ${p.line.name}`} type="number" step="0.01" min="0" className="input input-num"
                    value={p.newPrice ?? ''} disabled={p.action === 'ignore'}
                    onChange={(e) => { const v = parseFloat(e.target.value); patch(p.key, { newPrice: Number.isFinite(v) && v > 0 ? v : null }); onPriceEdit(p.key) }} />
                </td>
                <td data-label={he.quotes.colChange}>
                  {pct == null ? he.dash
                    : Math.abs(pct) < 0.05 ? <span className="muted">{he.quotes.same}</span>
                    : pct > 0 ? <span className="txt-up">{he.quotes.up(pct.toFixed(1))}</span>
                    : <span className="txt-down">{he.quotes.down(Math.abs(pct).toFixed(1))}</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SupplierChoice({ periodId, category, records, decisions, weights, provisional, hasOpenVotes }: {
  periodId: string
  category: string
  records: QuoteRecord[]
  decisions: Record<string, PeriodDecision>
  weights: Record<string, number> | null
  provisional: boolean
  hasOpenVotes: boolean
}) {
  const { config, store } = useAdmin()
  const [result, setResult] = useState<{ ok: string; warn: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [hideMissing, setHideMissing] = useState(true)
  const relevant = useMemo(() => config.products.filter((p) => (p.supplier ?? 'dry') === category && p.active !== false).map((p) => p.id), [config.products, category])
  const quotes = useMemo(() => groupBySupplier(records, periodId, category), [records, periodId, category])
  const cmp = useMemo(() => compareSuppliers(quotes, { relevant, weights }), [quotes, relevant, weights])
  const decided = decisions[decisionKey(periodId, category)]?.supplierName
  const nameOf = (id: string) => config.products.find((p) => p.id === id)?.name ?? id
  const title = he.quotes.step3(categoryLabel(category), periodLabel(periodId))

  useEffect(() => setResult(null), [periodId, category])

  const choose = async (supplier: string) => {
    if (!confirm(he.quotes.confirmChoose(supplier, periodLabel(periodId)))) return
    const quote = quotes.find((q) => q.supplier === supplier)
    if (!quote) return
    setBusy(true)
    try {
      const stamp = Date.now()
      const res = applySupplierChoice(config.products, quote, { idPrefix: `s${stamp}`, supplierId: category, hideNotOffered: hideMissing })
      await store.updateConfigField('products', res.products)
      await store.saveSupplierChoice(periodId, category, supplier, stamp)
      const missing = res.notOffered.map(nameOf)
      setResult({
        ok: he.quotes.chooseDone(supplier, res.updated, res.added),
        warn: missing.length ? (hideMissing ? he.quotes.notOfferedHidden : he.quotes.notOffered)(missing.slice(0, 10).join(', ') + (missing.length > 10 ? he.prices.andMore(missing.length - 10) : '')) : null,
      })
    } catch (e) {
      alert(he.errorPrefix + (e instanceof Error ? e.message : String(e)))
    } finally { setBusy(false) }
  }

  if (!quotes.length) return <Card title={title}><div className="muted small">{he.quotes.noQuotes}</div></Card>
  return (
    <Card title={title} accent>
      {result && <div className="notice notice-block" role="status">{result.ok}</div>}
      {result?.warn && <div className="banner-warn small" role="status">{result.warn}</div>}
      {hasOpenVotes && <div className="banner-warn small" role="status">{he.quotes.openRoundWarn}</div>}
      <p className="small" style={{ marginBlockStart: 0 }}>{he.quotes.comparedOn(cmp.common.length, relevant.length)}</p>
      {quotes.length > 1 && cmp.common.length < relevant.length / 2 && <div className="banner-warn small" role="status">{he.quotes.weakCompare}</div>}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>{he.quotes.colSupplier}</th><th>{he.quotes.colCovered}</th><th>{he.quotes.colMissing}</th><th>{he.quotes.colEqual}</th>
              {cmp.basis === 'weighted' && <th>{he.quotes.colWeighted}</th>}<th>{he.quotes.colDiff}</th><th />
            </tr>
          </thead>
          <tbody>
            {cmp.rows.map((r) => (
              <tr key={r.supplier}>
                <td className="cell-strong">
                  {r.supplier}
                  {r.supplier === cmp.cheapest && <div><span className="chip chip-ok">{he.quotes.cheapestTag}</span></div>}
                </td>
                <td>{r.covered} / {relevant.length}</td>
                <td className="small muted" style={{ maxWidth: 260, whiteSpace: 'normal' }}>{r.missing.length ? r.missing.slice(0, 8).map(nameOf).join(', ') + (r.missing.length > 8 ? he.prices.andMore(r.missing.length - 8) : '') : he.dash}</td>
                <td>{money(r.equalTotal)}</td>
                {cmp.basis === 'weighted' && <td>{money(r.weightedTotal ?? 0)}</td>}
                <td>{r.diff > 0.00005 ? <span className="txt-up">{he.quotes.up((r.diff * 100).toFixed(1))}</span> : he.dash}</td>
                <td>
                  {decided === r.supplier
                    ? <span className="txt-ok">{he.quotes.chosen}</span>
                    : <button type="button" className="btn btn-small" disabled={busy} onClick={() => void choose(r.supplier)}>{he.quotes.choose}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">{cmp.basis === 'weighted' ? he.quotes.basisWeighted : he.quotes.basisEqual}</p>
      <label className="offered-toggle small"><input type="checkbox" checked={hideMissing} onChange={(e) => setHideMissing(e.target.checked)} /> {he.hideNotOffered}</label>
      {!decided && provisional && <p className="small txt-warn" style={{ marginInlineStart: 0 }}>{he.quotes.provisional}</p>}
    </Card>
  )
}

function DiscountCard({ periodId, category, decision }: { periodId: string; category: string; decision?: PeriodDecision }) {
  const { store } = useAdmin()
  const saved = decision?.discount ?? null
  const [type, setType] = useState<Discount['type']>(saved?.type ?? 'percent')
  const [value, setValue] = useState(saved ? String(saved.value) : '')
  const [base, setBase] = useState(saved?.baseTotal != null ? String(saved.baseTotal) : '')
  const [note, setNote] = useState(saved?.note ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    setType(saved?.type ?? 'percent'); setValue(saved ? String(saved.value) : ''); setBase(saved?.baseTotal != null ? String(saved.baseTotal) : ''); setNote(saved?.note ?? ''); setMsg(null)
  }, [periodId, category, saved?.savedAt]) // eslint-disable-line react-hooks/exhaustive-deps
  const title = he.quotes.step4(categoryLabel(category), periodLabel(periodId))
  if (!decision?.supplierName) return <Card title={title}><div className="muted small">{he.quotes.needChoice}</div></Card>

  const draft: Discount = { type, value: parseFloat(value), baseTotal: type === 'amount' ? parseFloat(base) || null : null, note: note.trim(), savedAt: Date.now() }
  const rate = discountRate(draft)
  const save = async (d: Discount | null) => {
    try {
      await store.saveDiscount(periodId, category, d)
      setMsg(d ? he.quotes.discountSaved : null)
      if (!d) { setValue(''); setBase(''); setNote('') }
    } catch (e) { alert(he.errorPrefix + (e instanceof Error ? e.message : String(e))) }
  }
  return (
    <Card title={title}>
      <p className="small" style={{ marginBlockStart: 0 }}>{he.quotes.discountIntro}</p>
      {msg && <div className="notice notice-block" role="status">{msg}</div>}
      <div className="quote-form">
        <Field label={he.quotes.discountType}>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as Discount['type'])}>
            <option value="percent">{he.quotes.discountPercent}</option>
            <option value="amount">{he.quotes.discountAmount}</option>
          </select>
        </Field>
        <Field label={he.quotes.discountValue}><input className="input input-num" type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        {type === 'amount' && <Field label={he.quotes.discountBase}><input className="input input-num" style={{ width: 130 }} type="number" min="0" step="0.01" value={base} onChange={(e) => setBase(e.target.value)} /></Field>}
        <Field label={he.quotes.discountNote} grow><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <p className="small" role="status">{rate != null ? he.quotes.discountRate((rate * 100).toFixed(2)) : value ? <span className="txt-warn" style={{ marginInlineStart: 0 }}>{he.quotes.discountInvalid}</span> : null}</p>
      <div className="toolbar" style={{ marginBlockEnd: 0 }}>
        <button type="button" className="btn btn-primary" disabled={rate == null} onClick={() => void save(draft)}>{he.quotes.saveDiscount}</button>
        {saved && <button type="button" className="btn btn-small btn-danger" onClick={() => void save(null)}>{he.quotes.removeDiscount}</button>}
      </div>
    </Card>
  )
}

function VatChoice({ value, onChange, disabled, compact }: { value: VatMode; onChange: (v: VatMode) => void; disabled?: boolean; compact?: boolean }) {
  const opts: [VatMode, string][] = [['auto', he.quotes.vatAuto], ['included', he.quotes.vatIncluded], ['excluded', he.quotes.vatExcluded]]
  if (compact) {
    return (
      <select aria-label={he.quotes.vatTitle} className="input" value={value} onChange={(e) => onChange(e.target.value as VatMode)}>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    )
  }
  return (
    <fieldset className="vat-choice" disabled={disabled}>
      <legend>{he.quotes.vatTitle}</legend>
      {opts.map(([v, l]) => (
        <label key={v}><input type="radio" name="vat" value={v} checked={value === v} onChange={() => onChange(v)} /> {l}</label>
      ))}
      <span className="small muted">{he.quotes.vatHint}</span>
    </fieldset>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import seedJson from '../../../seed/seed.json'
import { he } from '../../i18n/he'
import { money } from '../../lib/format'
import { ACCEPT, readQuoteFile, UnsupportedFileError, type ReadFile } from '../../lib/quotes/extract'
import { AiFailedError, AiUnavailableError, analyzeLocally, analyzeWithAi } from '../../lib/quotes/analyzeClient'
import { applyProposals, buildProposals, finalPrice, pctChange } from '../../lib/quotes/plan'
import type { CatalogEntry, Proposal, ProposalAction, QuoteLine, VatMode } from '../../lib/quotes/types'
import type { QuoteRecord } from '../../data/store'
import { Card, Field, SectionHeader } from '../../ui/components'
import { useAdmin } from './context'

const SUPPLIERS = (seedJson as unknown as { suppliers: { id: string; name: string }[] }).suppliers
const OTHER = '__other'
const LOW_CONFIDENCE = 0.6

type Phase = { step: 'upload' } | { step: 'busy'; label: string } | { step: 'review' } | { step: 'done'; message: string }

export function QuotesPanel() {
  const { config, votes, store } = useAdmin()
  const [supplierId, setSupplierId] = useState(SUPPLIERS[0]?.id ?? OTHER)
  const [otherName, setOtherName] = useState('')
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
  const [history, setHistory] = useState<QuoteRecord[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => store.subscribeQuoteRecords(setHistory, (e) => console.warn('quote history failed', e)), [store])

  const catalog: CatalogEntry[] = useMemo(() => config.products.map((p) => ({ id: p.id, name: p.name, price: Number(p.price) || 0 })), [config.products])
  const productById = useMemo(() => new Map(config.products.map((p) => [p.id, p])), [config.products])
  const supplierName = supplierId === OTHER ? otherName.trim() : SUPPLIERS.find((s) => s.id === supplierId)?.name ?? ''
  const hasOpenVotes = config.round?.open !== false && config.coordinators.some((c) => votes[c.id])

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
      const lines = await analyzeWithAi(ok, catalog, supplierName, (d, t) => setPhase({ step: 'busy', label: he.quotes.analyzing(d, t) }))
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
  }, [vatMode])

  const patch = (key: string, upd: Partial<Proposal>) => setProposals((ps) => ps.map((p) => (p.key === key ? { ...p, ...upd } : p)))
  const setAction = (p: Proposal, action: ProposalAction) => {
    const productId = action === 'update' ? p.productId ?? p.line.matchId : p.productId
    patch(p.key, { action, productId, oldPrice: productId ? productById.get(productId)?.price ?? null : null })
  }

  const active = proposals.filter((p) => p.action !== 'ignore' && p.newPrice != null && (p.action === 'add' ? p.newName.trim() : p.productId))
  const nUpdate = active.filter((p) => p.action === 'update').length
  const nAdd = active.filter((p) => p.action === 'add').length

  const apply = async () => {
    if (!active.length || !confirm(he.quotes.confirmApply(nUpdate, nAdd))) return
    setPhase({ step: 'busy', label: he.quotes.applying })
    const stamp = Date.now()
    const sid = supplierId === OTHER ? undefined : supplierId
    try {
      const res = applyProposals(config.products, active, { supplierId: sid, idPrefix: `q${stamp}` })
      await store.updateConfigField('products', res.products)
      const before = new Set(config.products.map((p) => p.id))
      await store.saveQuoteRecord({
        id: `q${stamp}`, createdAt: stamp, supplierId: supplierId === OTHER ? '' : supplierId, supplierName,
        fileNames: readFiles.map((f) => f.name), method, vatMode, updated: res.updated, added: res.added,
        changes: [
          ...active.filter((p) => p.action === 'update' && p.productId).map((p) => ({
            productId: p.productId!, name: productById.get(p.productId!)?.name ?? '', action: 'update' as const, oldPrice: p.oldPrice, newPrice: p.newPrice!,
          })),
          ...res.products.filter((p) => !before.has(p.id)).map((p) => ({ productId: p.id, name: p.name, action: 'add' as const, oldPrice: null, newPrice: p.price })),
        ],
      })
      setPhase({ step: 'done', message: he.quotes.applied(res.updated, res.added) })
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

      {phase.step === 'done' && (
        <div className="notice notice-block" role="status">
          {phase.message}{' '}
          <button type="button" className="btn btn-small" onClick={() => setPhase({ step: 'upload' })}>{he.quotes.startOver}</button>
        </div>
      )}

      {(phase.step === 'upload' || busy) && (
        <Card title={he.quotes.uploadTitle}>
          <div className="quote-form">
            <Field label={he.quotes.supplier}>
              <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={busy}>
                {SUPPLIERS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value={OTHER}>{he.quotes.otherSupplier}</option>
              </select>
            </Field>
            {supplierId === OTHER && (
              <Field label={he.quotes.otherSupplierName}><input className="input" value={otherName} onChange={(e) => setOtherName(e.target.value)} disabled={busy} /></Field>
            )}
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
            <button type="button" className="btn btn-primary" disabled={!files.length || busy || (supplierId === OTHER && !otherName.trim())} onClick={() => void analyze()}>
              {busy ? phase.label : he.quotes.analyze}
            </button>
          </div>
        </Card>
      )}

      {phase.step === 'review' && (
        <Card title={he.quotes.reviewTitle} accent>
          {notices.map((n) => <div key={n} className="banner-warn small" role="status">{n}</div>)}
          {hasOpenVotes && <div className="banner-warn small" role="status">{he.quotes.openRoundWarn}</div>}
          {proposals.length === 0 ? (
            <p>{he.quotes.nothingFound}</p>
          ) : (
            <>
              <div className="toolbar">
                <span className="cell-strong">{he.quotes.summary(nUpdate, nAdd, proposals.length - active.length)}</span>
                <span className="push-end" />
                <VatChoice value={vatMode} onChange={setVatMode} compact />
              </div>
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
                                {config.products.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                              </select>
                            )}
                            {p.action === 'add' && (
                              <div className="new-product">
                                <input aria-label={`${he.quotes.icon}: ${p.line.name}`} className="input input-emoji" value={p.emoji} onChange={(e) => patch(p.key, { emoji: e.target.value })} />
                                <input aria-label={`${he.quotes.newName}: ${p.line.name}`} className="input" value={p.newName} onChange={(e) => patch(p.key, { newName: e.target.value })} />
                                <select aria-label={`${he.quotes.category}: ${p.line.name}`} className="input" value={p.cat} onChange={(e) => patch(p.key, { cat: e.target.value as 'dry' | 'fresh' })}>
                                  <option value="dry">{he.catDry}</option><option value="fresh">{he.catFresh}</option>
                                </select>
                              </div>
                            )}
                          </td>
                          <td data-label={he.quotes.colOld}>{p.action === 'update' && p.oldPrice != null ? money(p.oldPrice) : he.dash}</td>
                          <td data-label={he.quotes.colNew}>
                            <input aria-label={`${he.quotes.colNew}: ${p.line.name}`} type="number" step="0.01" min="0" className="input input-num"
                              value={p.newPrice ?? ''} disabled={p.action === 'ignore'}
                              onChange={(e) => { const v = parseFloat(e.target.value); patch(p.key, { newPrice: Number.isFinite(v) && v > 0 ? v : null }); setPriceEdited((s) => new Set(s).add(p.key)) }} />
                          </td>
                          <td data-label={he.quotes.colChange}>
                            {pct == null ? he.dash
                              : Math.abs(pct) < 0.05 ? <span className="muted">{he.quotes.same}</span>
                              : pct > 0 ? <span className="txt-over" style={{ marginInlineStart: 0 }}>{he.quotes.up(pct.toFixed(1))}</span>
                              : <span className="txt-ok">{he.quotes.down(Math.abs(pct).toFixed(1))}</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="toolbar" style={{ marginBlockStart: 16, marginBlockEnd: 0 }}>
            <button type="button" className="btn btn-primary" disabled={!active.length} onClick={() => void apply()}>{he.quotes.apply(active.length)}</button>
            <button type="button" className="btn btn-small" onClick={() => setPhase({ step: 'upload' })}>{he.cancel}</button>
          </div>
        </Card>
      )}

      <div style={{ marginBlockStart: 24 }}>
        <Card title={he.quotes.historyTitle}>
          {history.length === 0 ? <div className="muted small">{he.quotes.historyEmpty}</div> : history.map((h) => (
            <div key={h.id} className="list-row">
              <span className="grow">
                <b>{h.supplierName || he.dash}</b> · {new Date(h.createdAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' })}
                <span className="muted"> · {h.fileNames.join(', ')}</span>
              </span>
              <span>{he.quotes.historyLine(h.updated, h.added)} · <span className="muted">{h.method === 'ai' ? he.quotes.methodAi : he.quotes.methodLocal}</span></span>
            </div>
          ))}
        </Card>
      </div>
    </div>
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

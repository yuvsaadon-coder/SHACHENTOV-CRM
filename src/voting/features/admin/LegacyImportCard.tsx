import { useState } from 'react'
import { he } from '../../i18n/he'
import { mapProducts, mapVotes, type MappedVotes } from '../../data/legacyImport'
import { readLegacy, type LegacyData } from '../../data/legacyReader'
import { Card } from '../../ui/components'
import { useAdmin } from './context'

/** One-time import from the standalone voting app. Reads the old project, shows what it found, writes on confirm. */
export function LegacyImportCard() {
  const { store, branches, coordinators, config } = useAdmin()
  const [data, setData] = useState<LegacyData | null>(null)
  const [mapped, setMapped] = useState<{ live: MappedVotes; old: MappedVotes } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [catalog, setCatalog] = useState(true)
  const oldRound = data?.config?.round?.num ?? 0

  const check = async () => {
    setBusy(he.legacy.checking); setError(null); setDone(false)
    try {
      const d = await readLegacy()
      setData(d)
      const r = d.config?.round?.num ?? 0
      setMapped({ live: mapVotes(d.votes, r, coordinators, branches), old: mapVotes(d.archived, r, coordinators, branches) })
    } catch (e) { setError(he.legacy.failed(e instanceof Error ? e.message : String(e))) } finally { setBusy(null) }
  }

  const run = async () => {
    if (!data || !mapped || !confirm(he.legacy.confirm)) return
    setBusy(he.legacy.running); setError(null)
    try {
      if (catalog && data.config?.products?.length) await store.updateConfigField('products', mapProducts(data.config, branches))
      if (catalog && data.config?.baskets?.length) await store.updateConfigField('baskets', data.config.baskets)
      // continue the round numbering; the CRM round starts closed (the next one is opened with the wizard)
      if (data.config?.round && data.config.round.num >= (config.round?.num ?? 0)) await store.updateConfigField('round', { ...data.config.round, open: false })
      for (const q of data.quotes) await store.saveQuoteRecord(q)
      for (const d of data.decisions) {
        if (!d.periodId || !d.category) continue
        if (d.supplierName) await store.saveSupplierChoice(d.periodId, d.category, d.supplierName, d.decidedAt ?? 0)
        if (d.discount !== undefined) await store.saveDiscount(d.periodId, d.category, d.discount ?? null)
      }
      for (const m of data.rounds) if (m.num) await store.saveRoundMeta(m)
      await store.importArchivedVotes([...mapped.live.votes, ...mapped.old.votes], he.legacy.reason)
      setDone(true)
    } catch (e) { setError(he.errorPrefix + (e instanceof Error ? e.message : String(e))) } finally { setBusy(null) }
  }

  const unmatched = mapped ? [...new Set([...mapped.live.unmatched, ...mapped.old.unmatched])] : []
  const noBranch = mapped ? [...new Set([...mapped.live.noBranch, ...mapped.old.noBranch])] : []
  return (
    <Card title={he.legacy.title}>
      <p className="small" style={{ marginBlockStart: 0 }}>{he.legacy.intro}</p>
      {error && <div className="banner-warn small" role="alert">{error}</div>}
      {done && <div className="notice notice-block" role="status">{he.legacy.done}</div>}
      {data && mapped && (
        <div className="small">
          <b>{he.legacy.summary}</b>
          <ul>
            <li>{he.legacy.products(data.config?.products?.length ?? 0)}</li>
            <li>{he.legacy.quotes(data.quotes.length)}</li>
            <li>{he.legacy.decisions(data.decisions.length)}</li>
            <li>{he.legacy.rounds(data.rounds.length)}</li>
            <li>{he.legacy.votes(mapped.live.votes.length, oldRound)}</li>
            <li>{he.legacy.archived(mapped.old.votes.length)}</li>
          </ul>
          {unmatched.length > 0 && <div className="banner-warn small" role="status">{he.legacy.unmatched(unmatched.join(', '))}</div>}
          {noBranch.length > 0 && <div className="banner-warn small" role="status">{he.legacy.noBranch(noBranch.join(', '))}</div>}
          <label className="offered-toggle"><input type="checkbox" checked={catalog} onChange={(e) => setCatalog(e.target.checked)} /> {he.legacy.catalogToo}</label>
        </div>
      )}
      <div className="toolbar" style={{ marginBlockEnd: 0 }}>
        <button type="button" className="btn btn-small" disabled={!!busy} onClick={() => void check()}>{busy === he.legacy.checking ? busy : he.legacy.check}</button>
        {data && <button type="button" className="btn btn-primary" disabled={!!busy || done} onClick={() => void run()}>{busy === he.legacy.running ? busy : he.legacy.run}</button>}
      </div>
    </Card>
  )
}

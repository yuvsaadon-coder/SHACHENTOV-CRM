import { useEffect, useMemo, useState } from 'react'
import { he } from '../../i18n/he'
import { computeCycleResults } from '../../lib/algorithm'
import { useConfig, useStore, useVotes } from '../../data/hooks'
import { toAlgoVotes, toCycleSnapshot } from '../../data/legacy'
import { AdminContext, type AdminData } from './context'
import { StatusPanel } from './StatusPanel'
import { OptimalPanel, ResultsPanel } from './ResultsPanel'
import { ComparePanel } from './ComparePanel'
import { ExportPanel } from './ExportPanel'
import { CatalogPanel } from './CatalogPanel'
import { CoordsPanel } from './CoordsPanel'
import { RoundsPanel } from './RoundsPanel'

const TABS = ['status', 'results', 'optimal', 'compare', 'export', 'catalog', 'coords', 'rounds'] as const
type Tab = (typeof TABS)[number]
const PANELS: Record<Tab, () => JSX.Element> = {
  status: StatusPanel, results: ResultsPanel, optimal: OptimalPanel, compare: ComparePanel,
  export: ExportPanel, catalog: CatalogPanel, coords: CoordsPanel, rounds: RoundsPanel,
}

function useNow(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return now
}

export function AdminApp() {
  const store = useStore()
  const config = useConfig(store)
  const votes = useVotes(store)
  const now = useNow()
  const [tab, setTab] = useState<Tab>('status')

  const data = useMemo<AdminData | null>(() => {
    if (!store || !config) return null
    const snapshot = toCycleSnapshot(config)
    const results = computeCycleResults({ cycle: snapshot, votes: toAlgoVotes(votes) })
    return { store, config, votes, snapshot, results, now }
  }, [store, config, votes, now])

  if (!data) return <div className="center-msg">{he.loadingConfig}</div>
  const submitted = data.config.coordinators.filter((c) => votes[c.id]).length
  const Panel = PANELS[tab]
  return (
    <AdminContext.Provider value={data}>
      <header className="admin-header">
        <div style={{ flex: 1 }}>
          <div className="kicker">{he.orgShort}</div>
          <h1>{he.adminTitle}</h1>
        </div>
        <div className="count">{he.votedCount(submitted, data.config.coordinators.length)}</div>
        <a href="/" className="btn btn-small btn-ghost-light">{he.toSurvey}</a>
      </header>
      <nav className="tabs" role="tablist" aria-label={he.adminTitle}>
        {TABS.map((t) => (
          <button type="button" key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{he.tabs[t]}</button>
        ))}
      </nav>
      <main className="admin-main" role="tabpanel">
        {/* key: management panels keep local edits; re-mount when switching tabs (legacy behaviour) */}
        <Panel key={tab} />
      </main>
    </AdminContext.Provider>
  )
}

import { useEffect, useMemo, useState, type JSX } from 'react'
import { useAuth } from '../context/AuthContext'
import { he } from './i18n/he'
import { computeCycleResults } from './lib/algorithm'
import { setAuthTokenProvider } from './lib/quotes/analyzeClient'
import { auth } from '../lib/firebase'
import { useAllVotes, useBranchSettings, useCrmBranches, useCrmCoordinators, useVotingConfig, useVotingStore } from './data/hooks'
import { buildCycle, expectedVoters, orderKindOf } from './data/cycle'
import { votingDemo } from './data/store'
import { AdminContext, type AdminData } from './features/admin/context'
import { StatusPanel } from './features/admin/StatusPanel'
import { OptimalPanel, ResultsPanel } from './features/admin/ResultsPanel'
import { ComparePanel } from './features/admin/ComparePanel'
import { ExportPanel } from './features/admin/ExportPanel'
import { CatalogPanel } from './features/admin/CatalogPanel'
import { QuotesPanel } from './features/admin/QuotesPanel'
import { PricesPanel } from './features/admin/PricesPanel'
import { BranchesPanel } from './features/admin/BranchesPanel'
import { PreviewPanel } from './features/admin/PreviewPanel'
import { RoundsPanel, roundLabel } from './features/admin/RoundsPanel'
import { canManageVoting } from '../lib/votingAccess'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'
import './styles.css'

const TABS = ['status', 'results', 'optimal', 'compare', 'export', 'catalog', 'quotes', 'prices', 'branches', 'preview', 'rounds'] as const
type Tab = (typeof TABS)[number]
const PANELS: Record<Tab, () => JSX.Element> = {
  status: StatusPanel, results: ResultsPanel, optimal: OptimalPanel, compare: ComparePanel, export: ExportPanel,
  catalog: CatalogPanel, quotes: QuotesPanel, prices: PricesPanel, branches: BranchesPanel, preview: PreviewPanel, rounds: RoundsPanel,
}


function useNow(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return now
}

export function VotingAdminGate() {
  const { access, domain, rolesReady } = useAuth()
  if (!votingDemo() && !rolesReady && access !== 'admin') return <div className="voting"><div className="center-msg">{he.loading}</div></div>
  if (!votingDemo() && !canManageVoting(access, domain)) return <div className="voting"><div className="center-msg">{he.crm.noAccess}</div></div>
  return (
    <ErrorBoundary label="אזור סל המזון נתקל בשגיאה">
      <VotingAdmin />
    </ErrorBoundary>
  )
}

export function VotingAdmin() {
  const store = useVotingStore()
  const branches = useCrmBranches()
  const config = useVotingConfig(store, branches)
  const settings = useBranchSettings(store, branches)
  const coordinators = useCrmCoordinators()
  const votes = useAllVotes(store)
  const now = useNow()
  const [tab, setTab] = useState<Tab>('status')

  useEffect(() => { setAuthTokenProvider(async () => (await auth.currentUser?.getIdToken()) ?? null) }, [])

  const data = useMemo<AdminData | null>(() => {
    if (!store || !config || !settings || !branches || !coordinators) return null
    const kind = orderKindOf(config)
    const cycle = buildCycle(config, votes, settings)
    const results = computeCycleResults({ cycle: cycle.snapshot, votes: cycle.votes })
    const names = new Map(branches.map((b) => [b.id, b.name]))
    return {
      store, config, votes, voteById: Object.fromEntries(votes.map((v) => [`${v.uid}_${v.branchId}`, v])),
      branches, settings, coordinators, expected: expectedVoters(coordinators, settings, kind),
      snapshot: cycle.snapshot, results, branchWeights: cycle.branchWeights, kind,
      branchName: (id) => names.get(id) ?? id, now,
    }
  }, [store, config, settings, branches, coordinators, votes, now])

  if (!data) return <div className="voting"><div className="center-msg">{he.loadingConfig}</div></div>
  const done = data.expected.filter((e) => data.voteById[e.id]).length
  const label = roundLabel(data.config.round ?? {})
  const Panel = PANELS[tab]
  return (
    <AdminContext.Provider value={data}>
      <div className="voting voting-admin">
        {votingDemo() && <div className="demo-banner" role="note">{he.demoBanner}</div>}
        <header className="admin-header">
          <div style={{ flex: 1 }}>
            <div className="kicker">{he.orgShort}</div>
            <h1>{he.crm.adminTitle}</h1>
          </div>
          <div className="count">{label && <>{label} · </>}{he.votedCount(done, data.expected.length)}</div>
        </header>
        <nav className="tabs" role="tablist" aria-label={he.crm.adminTitle}>
          {TABS.map((t) => (
            <button type="button" key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{he.tabs[t]}</button>
          ))}
        </nav>
        <main className="admin-main" role="tabpanel">
          <Panel key={tab} />
        </main>
      </div>
    </AdminContext.Provider>
  )
}

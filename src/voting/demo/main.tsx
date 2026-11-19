// DEV-ONLY demo harness (not part of the production build): renders the voting module with the browser-only
// demo store and sample CRM branches/coordinators. Run: VITE_VOTING_DEMO=true npx vite, open /voting-demo.html
//   #admin               -> the HQ admin screens
//   #coord/<uid>/<branch> -> the coordinator portal screen
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../index.css'
import { VotingAdmin } from '../VotingAdmin'
import { VoteStepper } from '../features/vote/VoteStepper'
import { useBranchSettings, useCrmBranches, useMyVote, useVotingConfig, useVotingStore } from '../data/hooks'
import { DEMO_COORDINATORS } from '../data/demoFixtures'
import '../styles.css'

function Coordinator({ uid, branchId }: { uid: string; branchId: string }) {
  const store = useVotingStore()
  const branches = useCrmBranches()
  const config = useVotingConfig(store, branches)
  useBranchSettings(store, branches)
  const mine = useMyVote(store, uid, branchId)
  const c = DEMO_COORDINATORS.find((x) => x.uid === uid)
  const b = branches?.find((x) => x.id === branchId)
  if (!config || !c || !b || mine === undefined) return <div>…</div>
  return <div className="voting"><div className="shell-narrow"><VoteStepper key={`${uid}-${branchId}`} store={store} config={config} uid={uid} name={c.name} branchId={branchId} branchName={b.name} existingVote={mine} /></div></div>
}

function App() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => { const f = () => setHash(location.hash); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  const m = /^#coord\/([^/]+)\/([^/]+)$/.exec(hash)
  if (m) return <Coordinator uid={m[1]!} branchId={m[2]!} />
  return <div style={{ maxWidth: 1240, margin: '0 auto', padding: 24 }}><VotingAdmin /></div>
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

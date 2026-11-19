import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { PortalOutletContext } from '../pages/portal/CoordinatorPortal'
import { he } from './i18n/he'
import { useBranchSettings, useCrmBranches, useMyVote, useVotingConfig, useVotingStore } from './data/hooks'
import { orderKindOf } from './data/cycle'
import { participates } from './data/weights'
import { VoteStepper } from './features/vote/VoteStepper'
import './styles.css'

/** Coordinator portal tab: vote on the baskets for the portal branch, as the signed-in CRM user. */
export function VotingPortal() {
  const { branch } = useOutletContext<PortalOutletContext>()
  const { appUser } = useAuth()
  const store = useVotingStore()
  const branches = useCrmBranches()
  const config = useVotingConfig(store, branches)
  const settings = useBranchSettings(store, branches)
  const myVote = useMyVote(store, appUser?.uid ?? null, branch.id)

  if (!config || !settings || myVote === undefined || !appUser) return <div className="voting"><div className="center-msg">{he.crm.portalLoading}</div></div>
  if (!participates(settings[branch.id], orderKindOf(config))) {
    return <div className="voting"><div className="center-msg"><p>{he.crm.portalNotVoting}</p></div></div>
  }
  return (
    <div className="voting">
      <div className="shell-narrow">
        <VoteStepper key={branch.id} store={store} config={config} uid={appUser.uid} name={appUser.name} branchId={branch.id} branchName={branch.name} existingVote={myVote} inPortal />
      </div>
    </div>
  )
}

import { useState } from 'react'
import { he } from '../../i18n/he'
import { useConfig, useStore, useVotes } from '../../data/hooks'
import type { LegacyCoordinator } from '../../data/legacy'
import { CoordinatorPicker } from './CoordinatorPicker'
import { VoteStepper } from './VoteStepper'

export function VoteApp() {
  const store = useStore()
  const config = useConfig(store)
  const votes = useVotes(store)
  const [coord, setCoord] = useState<LegacyCoordinator | null>(null)
  if (!store || !config) return <div className="center-msg">{he.loading}</div>
  return (
    <div className="shell-narrow">
      {!coord
        ? <CoordinatorPicker coordinators={config.coordinators} onPick={setCoord} />
        : <VoteStepper key={coord.id} store={store} config={config} coordinator={coord} existingVote={votes[coord.id]} onLogout={() => setCoord(null)} />}
    </div>
  )
}

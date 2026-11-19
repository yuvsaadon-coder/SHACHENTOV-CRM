import { createContext, useContext } from 'react'
import type { CycleResults, CycleSnapshot } from '../../lib/algorithm'
import type { BranchSettings, VoteDoc, VotingConfig } from '../../data/model'
import type { VotingStore } from '../../data/store'
import type { Coordinator } from '../../data/cycle'
import type { CrmBranch } from '../../data/hooks'
import type { OrderKind } from '../../data/weights'

export interface ExpectedVoter { id: string; uid: string; name: string; branchId: string }

export interface AdminData {
  store: VotingStore
  config: VotingConfig
  /** all votes of the current round */
  votes: VoteDoc[]
  voteById: Record<string, VoteDoc>
  branches: CrmBranch[]
  settings: Record<string, BranchSettings>
  coordinators: Coordinator[]
  /** (coordinator, participating branch) pairs expected to vote this round */
  expected: ExpectedVoter[]
  snapshot: CycleSnapshot
  results: CycleResults
  branchWeights: Record<string, number>
  kind: OrderKind
  branchName: (id: string) => string
  now: number
}

export const AdminContext = createContext<AdminData | null>(null)
export function useAdmin(): AdminData {
  const v = useContext(AdminContext)
  if (!v) throw new Error('AdminContext missing')
  return v
}

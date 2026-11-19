import { createContext, useContext } from 'react'
import type { CycleResults, CycleSnapshot } from '../../lib/algorithm'
import type { LegacyConfig, LegacyVote } from '../../data/legacy'
import type { Store } from '../../data/store'

export interface AdminData {
  store: Store
  config: LegacyConfig
  votes: Record<string, LegacyVote>
  snapshot: CycleSnapshot
  results: CycleResults
  now: number
}

export const AdminContext = createContext<AdminData | null>(null)
export function useAdmin(): AdminData {
  const v = useContext(AdminContext)
  if (!v) throw new Error('AdminContext missing')
  return v
}

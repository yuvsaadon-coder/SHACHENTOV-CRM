import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import type { AppUser, Branch } from '../../types'
import { defaultBranchSettings, defaultConfig } from './defaults'
import type { BranchSettings, VoteDoc, VotingConfig } from './model'
import { getVotingStore, votingDemo, type VotingStore } from './store'
import type { Coordinator } from './cycle'
import { DEMO_BRANCHES, DEMO_COORDINATORS } from './demoFixtures'

export function useVotingStore(): VotingStore | null {
  const [s, setS] = useState<VotingStore | null>(null)
  useEffect(() => { let alive = true; void getVotingStore().then((x) => { if (alive) setS(x) }); return () => { alive = false } }, [])
  return s
}

export type CrmBranch = Pick<Branch, 'id' | 'name' | 'type'> & Partial<Branch>

/** Food branches of the CRM (cafe/youth branches do not get baskets). */
export function useCrmBranches(): CrmBranch[] | null {
  const [list, setList] = useState<CrmBranch[] | null>(null)
  useEffect(() => {
    if (votingDemo()) { setList(DEMO_BRANCHES); return }
    return onSnapshot(collection(db, 'branches'), (snap) => {
      setList(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CrmBranch)).filter((b) => b.type !== 'cafe_youth').sort((a, b) => a.name.localeCompare(b.name, 'he')))
    }, () => setList([]))
  }, [])
  return list
}

/** Active CRM users with the coordinator role: the people who vote. */
export function useCrmCoordinators(enabled = true): Coordinator[] | null {
  const [list, setList] = useState<Coordinator[] | null>(null)
  useEffect(() => {
    if (!enabled) return
    if (votingDemo()) { setList(DEMO_COORDINATORS); return }
    const q = query(collection(db, 'users'), where('role', '==', 'coordinator'))
    return onSnapshot(q, (snap) => {
      setList(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)).filter((u) => u.active !== false)
        .map((u) => ({ uid: u.uid, name: u.name, branchIds: u.branchIds ?? [] })))
    }, () => setList([]))
  }, [enabled])
  return list
}

/** Live config; fields not saved yet fall back to the defaults. null while loading. */
export function useVotingConfig(store: VotingStore | null, branches: CrmBranch[] | null): VotingConfig | null {
  const [doc, setDoc] = useState<Partial<VotingConfig> | null | undefined>(undefined)
  useEffect(() => { if (!store) return; return store.subscribeConfig(setDoc, () => setDoc(null)) }, [store])
  return useMemo(() => {
    if (doc === undefined || !branches) return null
    return { ...defaultConfig(branches), ...doc }
  }, [doc, branches])
}

/** Participation and family counts per CRM branch; unsaved branches get name-based defaults. */
export function useBranchSettings(store: VotingStore | null, branches: CrmBranch[] | null): Record<string, BranchSettings> | null {
  const [saved, setSaved] = useState<Record<string, Partial<BranchSettings>> | null>(null)
  useEffect(() => { if (!store) return; return store.subscribeBranchSettings(setSaved, () => setSaved({})) }, [store])
  return useMemo(() => {
    if (!saved || !branches) return null
    return Object.fromEntries(branches.map((b) => [b.id, { ...defaultBranchSettings(b.name), ...saved[b.id] } as BranchSettings]))
  }, [saved, branches])
}

export function useAllVotes(store: VotingStore | null): VoteDoc[] {
  const [v, setV] = useState<VoteDoc[]>([])
  useEffect(() => { if (!store) return; return store.subscribeVotes(setV, (e) => console.error('votes', e)) }, [store])
  return v
}

export function useMyVote(store: VotingStore | null, uid: string | null, branchId: string | null): VoteDoc | null | undefined {
  const [v, setV] = useState<VoteDoc | null | undefined>(undefined)
  useEffect(() => {
    if (!store || !uid || !branchId) return
    return store.subscribeMyVote(uid, branchId, setV, () => setV(null))
  }, [store, uid, branchId])
  return v
}

export { useLocalDraft } from './draft'

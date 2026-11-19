// Reads the standalone voting app's data from its own Firebase project (shachentov-1316f). That project's rules are
// open (SPEC D1), so no sign-in is needed. Read-only: nothing is ever written there.
import { getApps, initializeApp } from 'firebase/app'
import { collection, doc, getDoc, getDocs, getFirestore } from 'firebase/firestore'
import type { PeriodDecision } from '../lib/prices/history'
import type { RoundMeta } from '../lib/rounds/recommend'
import type { LegacyConfigDoc, LegacyVoteDoc } from './legacyImport'
import type { QuoteRecord } from './store'

/** Public web config of the old project (the same values the old site ships to every visitor). */
const OLD_PROJECT = {
  apiKey: 'AIzaSyCvYBb-abDO0EcyW7rpVyK1RQQoAKdlJX0',
  authDomain: 'shachentov-1316f.firebaseapp.com',
  projectId: 'shachentov-1316f',
  appId: '1:751389452970:web:547c8a1be8f36d1ab3bed3',
}

export interface LegacyData {
  config: LegacyConfigDoc | null
  votes: LegacyVoteDoc[]
  archived: LegacyVoteDoc[]
  quotes: QuoteRecord[]
  decisions: PeriodDecision[]
  rounds: RoundMeta[]
}

export async function readLegacy(): Promise<LegacyData> {
  const app = getApps().find((a) => a.name === 'legacy-voting') ?? initializeApp(OLD_PROJECT, 'legacy-voting')
  const db = getFirestore(app)
  const all = async <T,>(name: string) => (await getDocs(collection(db, name))).docs.map((d) => d.data() as T)
  const cfg = await getDoc(doc(db, 'config', 'main'))
  const [votes, archived, quotes, decisions, rounds] = await Promise.all([
    all<LegacyVoteDoc>('votes'), all<LegacyVoteDoc>('archivedVotes'), all<QuoteRecord>('priceQuotes'),
    all<PeriodDecision>('priceDecisions'), all<RoundMeta>('rounds'),
  ])
  return { config: cfg.exists() ? (cfg.data() as LegacyConfigDoc) : null, votes, archived, quotes, decisions, rounds }
}

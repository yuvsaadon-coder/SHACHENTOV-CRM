// Sample CRM branches and coordinators for the demo mode (VITE_VOTING_DEMO=true). Never used in production.
import type { Coordinator } from './cycle'
import type { CrmBranch } from './hooks'

const b = (id: string, name: string): CrmBranch => ({ id, name, type: 'food' })
export const DEMO_BRANCHES: CrmBranch[] = [
  b('br-baka', 'בקעה'), b('br-gilo', 'גילה'), b('br-neve', 'נווה יעקב'), b('br-nachlaot', 'נחלאות'), b('br-katamon', 'קטמון'),
  b('br-km', 'קרית מנחם'), b('br-ramot', 'רמות'), b('br-ta', 'תל אביב'), b('br-kadima', 'קדימה'), b('br-bs', 'בית שמש'),
  b('br-ravshimon', 'נחלאות רב שמעון'), b('br-savta', 'סבתא רבקא'),
]
export const DEMO_COORDINATORS: Coordinator[] = [
  { uid: 'u-lea', name: 'לאה ליבנת', branchIds: ['br-gilo'] },
  { uid: 'u-yoh', name: 'יוחאי אבוטבול', branchIds: ['br-baka'] },
  { uid: 'u-nao', name: 'נעמי', branchIds: ['br-neve'] },
  { uid: 'u-oz', name: 'עוז בינר', branchIds: ['br-nachlaot'] },
  { uid: 'u-tzi', name: 'ציפי', branchIds: ['br-katamon'] },
  { uid: 'u-est', name: 'אסתי בראור', branchIds: ['br-katamon'] },
  { uid: 'u-yai', name: 'יאיר יעקבי', branchIds: ['br-ramot'] },
  { uid: 'u-yeh', name: 'יהודית', branchIds: ['br-km'] },
  { uid: 'u-bs', name: 'רכזת בית שמש', branchIds: ['br-bs'] },
  { uid: 'u-rs', name: 'רכז רב שמעון', branchIds: ['br-ravshimon'] },
]

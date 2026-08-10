import type { Timestamp } from 'firebase/firestore'

export type Domain = 'CEO' | 'JLM' | 'SUP' | 'FIN' | 'DON' | 'DES' | 'PUB' | 'VOL'
export type Role = Domain | 'admin' | 'coordinator'
export type TaskStatus = 'בוצע' | 'בעבודה' | 'בהמתנה' | 'לא בוצע' | 'אחר'
export type TaskFrequency = 'חד-פעמי' | 'חודשי' | 'רבעוני' | 'חצי-שנתי' | 'שנתי' | 'שוטף' | 'לפי חג'
export type ContactType = 'מטה' | 'ספק' | 'תורם'
export type FormatType = 'checklist' | 'product_selection' | 'rfq' | 'design_request'

export interface Task {
  id: string
  domain: Domain
  category: string
  title: string
  steps: string
  frequency: TaskFrequency
  startDate: Timestamp | null
  endDate: Timestamp | null
  holidayAnchor: string | null
  responsible: string
  involved: string[]
  activator: string | null
  contactRefs: string[]
  status: TaskStatus
  notes: string
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
  updatedBy: string
}

export interface Contact {
  id: string
  name: string
  type: ContactType
  domainTags: string[]
  phone: string
  email: string
  notes: string
}

export interface AppUser {
  uid: string
  name: string
  email: string
  role: Role
  branchId?: string
  active: boolean
}

export interface Comment {
  id: string
  text: string
  author: string
  createdAt: Timestamp
}

export interface Attachment {
  id: string
  fileName: string
  storageUrl: string
  uploadedBy: string
  uploadedAt: Timestamp
}

export interface HistoryEntry {
  id: string
  field: string
  oldValue: string
  newValue: string
  changedBy: string
  changedAt: Timestamp
}

export type RoleLevel = 'מטה' | 'סניף חוץ' | 'סניף ירושלים' | 'בתי קפה נודדים' | 'טוסטר' | 'סניפים עיתיים' | 'יריד'
export type RoleStatus = 'מאויש' | 'חסר' | 'חלקי' | 'בסיכון' | 'אחר'
export type RolePriority = 'רגיל' | 'בינוני' | 'דחוף'
export type VolunteerStatus = 'יציב' | 'חוסר מתמשך' | 'חוסר קריטי'

export const FOOD_BRANCH_LEVELS: RoleLevel[] = ['סניף חוץ', 'סניף ירושלים']
export const VOLUNTEER_STATUS_OPTIONS: VolunteerStatus[] = ['יציב', 'חוסר מתמשך', 'חוסר קריטי']
export const DIST_FREQ_OPTIONS = ['יומי', 'שבועי', 'שלוש בשבוע', 'דו-שבועי', 'חודשי']

export interface SeasonalPeriod {
  name: string
  hasMoreVolunteers: boolean
  description: string
}

export interface BranchVolunteerInfo {
  packagingStatus?: VolunteerStatus
  distributionStatus?: VolunteerStatus
  collectionStatus?: VolunteerStatus
  targetPackagingVolunteers?: number | null
  targetDistributionVolunteers?: number | null
  weeklyBaskets?: number | null
  distributionFrequency?: string
  acceptsGroups?: boolean
  seasonalPeriods?: SeasonalPeriod[]
  generalVolunteerStatus?: VolunteerStatus
}

export interface OrgRole {
  id: string
  roleName: string
  level: RoleLevel
  area: string
  holderName: string
  status: RoleStatus
  priority: RolePriority
  email: string
  phone: string
  linkedTaskIds: string[]
  affectsTasks: boolean
  delegatedTo: string | null
  notes: string
  reportsTo?: string
  volunteerInfo?: BranchVolunteerInfo | null
  portalBranchId?: string
}

export const ROLE_LEVELS: RoleLevel[] = ['מטה', 'סניף חוץ', 'סניף ירושלים', 'בתי קפה נודדים', 'טוסטר', 'סניפים עיתיים', 'יריד']
export const ROLE_STATUS_LABELS: RoleStatus[] = ['מאויש', 'חסר', 'חלקי', 'בסיכון', 'אחר']
export const ROLE_PRIORITY_LABELS: RolePriority[] = ['רגיל', 'בינוני', 'דחוף']

export interface FormatInstance {
  id: string
  type: FormatType
  taskRef: string
  title: string
  data: Record<string, unknown>
  status: string
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export const DOMAIN_LABELS: Record<Domain, string> = {
  CEO: 'מנכ"ל',
  JLM: 'סניפי ירושלים',
  SUP: 'ספקים',
  FIN: 'כספים',
  DON: 'תרומות',
  DES: 'עיצובים',
  PUB: 'פרסומים',
  VOL: 'מתנדבים',
}

export const DOMAIN_OWNERS: Record<Domain, string> = {
  CEO: 'יובל סעדון',
  JLM: 'כרמל קרופפלד',
  SUP: 'שלמה דרורי',
  FIN: 'אילן אמסל',
  DON: 'אפרת בנימין / דלית סין משה',
  DES: 'דיקלה',
  PUB: 'יעל',
  VOL: 'שיר בתאל סומך',
}

export const DOMAIN_COLORS: Record<Domain, string> = {
  CEO: '#141348',
  JLM: '#189A9F',
  SUP: '#147F84',
  FIN: '#0A6B2E',
  DON: '#FDC857',
  DES: '#E4DFEC',
  PUB: '#3A3A6B',
  VOL: '#C6EFCE',
}

export const STATUS_LABELS: TaskStatus[] = ['בוצע', 'בעבודה', 'בהמתנה', 'לא בוצע', 'אחר']
export const FREQUENCY_LABELS: TaskFrequency[] = ['חד-פעמי', 'חודשי', 'רבעוני', 'חצי-שנתי', 'שנתי', 'שוטף', 'לפי חג']
export const DOMAINS: Domain[] = ['CEO', 'JLM', 'SUP', 'FIN', 'DON', 'DES', 'PUB', 'VOL']

// ─── Coordinator portal types ───────────────────────────────────────────────

export interface Branch {
  id: string
  name: string
  type: 'food' | 'cafe_youth'
  city: string
  coordinatorUids: string[]
  createdAt: Timestamp
}

export type QuarterLabel = 'Q1' | 'Q2' | 'Q3' | 'Q4'
export const QUARTERS: QuarterLabel[] = ['Q1', 'Q2', 'Q3', 'Q4']
export const QUARTER_LABELS: Record<QuarterLabel, string> = {
  Q1: 'רבעון 1 (ינואר–מרץ)',
  Q2: 'רבעון 2 (אפריל–יוני)',
  Q3: 'רבעון 3 (יולי–ספטמבר)',
  Q4: 'רבעון 4 (אוקטובר–דצמבר)',
}

export interface QuarterlyReport {
  id: string
  branchId: string
  branchType: 'food' | 'cafe_youth'
  quarter: QuarterLabel
  year: number
  submittedAt: Timestamp
  submittedBy: string
  isFirstReport: boolean
  data: Record<string, unknown>
}

export type KnowledgeItemType = 'document' | 'link' | 'tip'
export const KNOWLEDGE_TAGS = ['לוגיסטיקה', 'מתנדבים', 'אוכלוסייה', 'תפעול', 'אחר'] as const
export type KnowledgeTag = (typeof KNOWLEDGE_TAGS)[number]

export interface KnowledgeItem {
  id: string
  branchId: string
  type: KnowledgeItemType
  title: string
  content: string
  url?: string
  tags: string[]
  createdBy: string
  createdAt: Timestamp
}

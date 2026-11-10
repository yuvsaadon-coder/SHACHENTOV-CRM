import type { Timestamp } from 'firebase/firestore'

export type Domain = 'CEO' | 'JLM' | 'SUP' | 'FIN' | 'DON' | 'DES' | 'PUB' | 'VOL'
/** Access level stored on a person. Domain codes are legacy values left on older docs; they behave as 'hq'. */
export type Role = Domain | 'admin' | 'hq' | 'coordinator' | 'none'
export type AccessLevel = 'admin' | 'hq' | 'coordinator' | 'none'
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
  involved: string[]
  activator: string | null
  contactRefs: string[]
  status: TaskStatus
  notes: string
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
  updatedBy: string
  parentTaskId?: string
  dependsOn?: string[]
  /** Denormalized count of tasks/{id}/attachments, kept in sync on upload/delete — lets task cards show a 📎 badge without a subcollection read per card. */
  attachmentCount?: number
  /** Tracks which cycle the current status belongs to (e.g. "2026-Q3", "2026-08", "2026").
   *  When the current cycle key differs from this value, the task is auto-reset to "לא בוצע". */
  cycleKey?: string
}

export interface Contact {
  id: string
  name: string
  type: ContactType
  domainTags: string[]
  phone: string
  email: string
  notes: string
  /** Columns carried over from the roles/contacts sheet. */
  organization?: string
  role?: string
  category?: string
  ownerInOrg?: string
  cadence?: string
  /** Set when the sheet had no phone or email for this contact. */
  needsInfo?: boolean
  /** Set on contacts archived automatically when a person left a position. */
  formerPersonId?: string
  formerRoleId?: string
  endedAt?: Timestamp
}

/**
 * A person in the organisation — the single place where "who" is stored.
 * Which positions they hold (roleIds) lives here and nowhere else; the org
 * tree, branch coordinators and contact details are all derived from it.
 */
export interface AppUser {
  /** Document id. Equals the Firebase Auth uid once the person has a login. */
  uid: string
  name: string
  email: string
  /** Digits only. Coordinators sign in to the portal with name + phone. */
  phone?: string
  role: Role
  roleIds?: string[]
  /** Portal branches of the positions in roleIds. Recomputed on every save; security rules read it. */
  branchIds?: string[]
  active: boolean
}

// Private per-user to-dos, kept in users/{uid}/personalTasks — not part of the
// org-wide `tasks` collection, so they never show up on the Gantt/Kanban/task
// list and aren't tied to a domain, category, or anyone else.
export type PersonalTaskStatus = 'לא בוצע' | 'בהמתנה' | 'בעבודה' | 'חסומה' | 'בוצע'
export const PERSONAL_TASK_STATUSES: PersonalTaskStatus[] = ['לא בוצע', 'בהמתנה', 'בעבודה', 'חסומה', 'בוצע']
export const PERSONAL_TASK_STATUS_STYLE: Record<PersonalTaskStatus, { backgroundColor: string; color: string }> = {
  'לא בוצע': { backgroundColor: '#F3F4F6', color: '#4B5563' },
  'בהמתנה':  { backgroundColor: '#FEF3C7', color: '#92400E' },
  'בעבודה':  { backgroundColor: '#189A9F', color: '#ffffff' },
  'חסומה':   { backgroundColor: '#FEE2E2', color: '#991B1B' },
  'בוצע':    { backgroundColor: '#C6EFCE', color: '#0A6B2E' },
}

export interface PersonalTask {
  id: string
  title: string
  notes: string
  done: boolean
  status?: PersonalTaskStatus
  recurring: boolean
  dueDate: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
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

export type RoleLevel = 'ועד מנהל' | 'מטה' | 'סניף חוץ' | 'סניף ירושלים' | 'בתי קפה נודדים' | 'טוסטר' | 'סניפים עיתיים' | 'יריד'
export type RoleStatus = 'מאויש' | 'חסר' | 'חלקי' | 'בסיכון' | 'אחר'
export type RolePriority = 'רגיל' | 'בינוני' | 'דחוף'
export type RecruitmentUrgency = 'לא לגיוס' | 'לגיוס - בינוני' | 'לגיוס - דחוף' | 'לגיוס - קריטי'
export const RECRUITMENT_URGENCY_OPTIONS: RecruitmentUrgency[] = ['לא לגיוס', 'לגיוס - בינוני', 'לגיוס - דחוף', 'לגיוס - קריטי']
export const RECRUITMENT_NEEDS_STATUS: RoleStatus[] = ['חסר', 'חלקי', 'בסיכון']
export type VolunteerStatus = 'יציב' | 'חוסר מתמשך' | 'חוסר קריטי'

export const FOOD_BRANCH_LEVELS: RoleLevel[] = ['סניף חוץ', 'סניף ירושלים']
export const VOLUNTEER_STATUS_OPTIONS: VolunteerStatus[] = ['יציב', 'חוסר מתמשך', 'חוסר קריטי']
export const DIST_FREQ_OPTIONS = ['יומי', 'שבועי', 'שלוש בשבוע', 'דו-שבועי', 'חודשי', 'חגים', 'אחר']

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
  monthlyBaskets?: number | null
  distributionFrequency?: string
  distributionDay?: string
  packagingTime?: string
  distributionTime?: string
  address?: string
  acceptsGroups?: boolean
  seasonalPeriods?: SeasonalPeriod[]
  generalVolunteerStatus?: VolunteerStatus
}

export interface RoleHolder {
  uid: string
  name: string
  phone: string
  email: string
}

export interface OrgRole {
  id: string
  roleName: string
  level: RoleLevel
  area: string
  status: RoleStatus
  priority: RolePriority
  recruitmentUrgency?: RecruitmentUrgency
  linkedTaskIds: string[]
  affectsTasks: boolean
  delegatedTo: string | null
  notes: string
  reportsTo?: string
  volunteerInfo?: BranchVolunteerInfo | null
  portalBranchId?: string
  /** Task domain this position owns, when it is an HQ position. */
  domain?: Domain
  /** Derived from the people directory when roles are loaded — never stored on the role. */
  holders: RoleHolder[]
  /** Derived: holder names joined with ", ". */
  holderName: string
  /** Derived: the first holder's phone / email. */
  phone: string
  email: string
}

export const DERIVED_ROLE_FIELDS = ['id', 'holders', 'holderName', 'phone', 'email'] as const
export type StoredOrgRole = Omit<OrgRole, (typeof DERIVED_ROLE_FIELDS)[number]>

export const ROLE_LEVELS: RoleLevel[] = ['ועד מנהל', 'מטה', 'סניף חוץ', 'סניף ירושלים', 'בתי קפה נודדים', 'טוסטר', 'סניפים עיתיים', 'יריד']
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
  createdAt: Timestamp
  // Operational data (from Excel / manual edit)
  distributionFrequency?: string
  distributionDay?: string
  weeklyBaskets?: number | null
  monthlyBaskets?: number | null
  packagingTime?: string
  distributionTime?: string
  address?: string
  acceptsGroups?: boolean
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

// ── Quarterly report question definitions (editable by HQ) ─────────────────
// PortalReport.tsx renders the form for a branch by reading the questions of
// that branch's type from this collection, ordered by `order`. `key` is the
// field name written into QuarterlyReport.data — existing reports keep
// rendering correctly as long as a question's `key` doesn't change.

export type ReportFieldType = 'number' | 'text' | 'textarea' | 'rating' | 'radio'

export const REPORT_FIELD_TYPES: { id: ReportFieldType; label: string }[] = [
  { id: 'number', label: 'מספר' },
  { id: 'text', label: 'טקסט קצר' },
  { id: 'textarea', label: 'טקסט ארוך' },
  { id: 'rating', label: 'דירוג 1–5 + הערות' },
  { id: 'radio', label: 'בחירה מרשימה' },
]

export interface ReportQuestion {
  id: string
  branchType: 'food' | 'cafe_youth'
  key: string
  label: string
  section: string
  type: ReportFieldType
  options?: string[]
  firstReportOnly: boolean
  order: number
}

export type KnowledgeItemType = 'document' | 'link' | 'tip' | 'research_article' | 'file' | 'checklist'
export const KNOWLEDGE_TAGS = ['לוגיסטיקה', 'מתנדבים', 'אוכלוסייה', 'תפעול', 'חפיפה', 'פורמטים', 'אחר'] as const
export type KnowledgeTag = (typeof KNOWLEDGE_TAGS)[number]

export interface KnowledgeItem {
  id: string
  branchId: string
  type: KnowledgeItemType
  title: string
  content: string
  url?: string
  fileUrl?: string
  fileName?: string
  fileSize?: number
  checklistItems?: string[]
  tags: string[]
  createdBy: string
  createdAt: Timestamp
}

export type HQKnowledgeCategory = 'handover' | 'instructions' | 'procedures' | 'sop' | 'tips' | 'ישיבות ועד' | 'other'

export const HQ_KNOWLEDGE_CATEGORIES: { id: HQKnowledgeCategory; label: string; icon: string }[] = [
  { id: 'handover',      label: 'קבצי חפיפה',            icon: '🔄' },
  { id: 'instructions',  label: 'הנחיות',                 icon: '📋' },
  { id: 'procedures',    label: 'שימור מידע תהליכי',     icon: '⚙️' },
  { id: 'sop',           label: 'סדרי פעולות',            icon: '📌' },
  { id: 'tips',          label: 'טיפים ועצות',            icon: '💡' },
  { id: 'ישיבות ועד',   label: 'ישיבות ועד',             icon: '📜' },
  { id: 'other',         label: 'אחר',                    icon: '📎' },
]

export interface HQKnowledgeItem {
  id: string
  domain: Domain | 'all'
  category: HQKnowledgeCategory
  title: string
  content: string
  fileUrl?: string
  fileName?: string
  tags: string[]
  visibleToCoordinators?: boolean
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

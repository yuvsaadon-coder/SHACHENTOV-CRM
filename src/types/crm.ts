import type { Timestamp } from 'firebase/firestore'

// ─── Taxonomy scalar types ────────────────────────────────────────────────────

export type SectorType =
  | 'ממשל מרכזי'
  | 'שלטון מקומי'
  | 'חברה ממשלתית'
  | 'חברה אזרחית'
  | 'מגזר עסקי'
  | 'אקדמיה'
  | 'פילנתרופיה'
  | 'לא ידוע'

export type ProgramType = 'ממשלתי' | 'מוניציפלי' | 'אכיפת החוק' | 'לא ידוע'

export type CohortLabel = 'א' | 'ב' | 'ג' | 'ד' | 'ה' | 'ו' | 'ז' | 'ח' | 'לא ידוע'

export type DistrictType = 'ירושלים' | 'מרכז' | 'צפון' | 'דרום' | 'חו"ל' | 'לא ידוע'

export type EngagementLevel = 'גבוהה' | 'בינונית' | 'נמוכה' | 'ללא מעורבות' | 'טרם רלוונטי'

export type InfluenceLayer =
  | 'שכבת ההשפעה הארגונית (Decision Makers)'
  | 'שכבת השינוי וההובלה (Change Leaders)'
  | 'שכבת הביצוע (Implementers)'

export type CommunityStatus =
  | 'מתמיין'
  | 'לא התקבל'
  | 'משתתף'
  | 'בוגר לא פעיל'
  | 'חבר קהילה'

export type EnrollmentStatus =
  | 'מועמד'
  | 'במיון'
  | 'ראיון'
  | 'התקבל'
  | 'פעיל'
  | 'בוגר'
  | 'נשר'

export type UserRole = 'SuperAdmin' | 'ProgramManager'

export type BroadcastChannel = 'whatsapp' | 'sms' | 'email'

export type BroadcastStatus = 'sent' | 'failed' | 'simulated'

export type FieldType =
  | 'text'
  | 'textarea'
  | 'single_choice'
  | 'multi_choice'
  | 'dropdown'
  | 'date'
  | 'number'
  | 'file'

export type GenderType = 'אישה' | 'גבר' | 'אחר'

// Hierarchy level groups from taxonomy
export type HierarchyGroup =
  | 'הנהלה בכירה'
  | 'דרג ניהול ביניים'
  | 'תפקודי-מקצועי'
  | 'דרגות מבצעיות — אכיפת חוק'
  | 'חיצוני / סטטוס'

// ─── Domain entities ──────────────────────────────────────────────────────────

export interface Profile {
  id: string // USR-XXXXX
  firstName: string
  lastName: string
  phone?: string
  email?: string
  nationalId?: string
  gender?: GenderType
  birthDate?: Timestamp | null
  linkedinUrl?: string
  city?: string
  district?: DistrictType
  organizationId?: string
  organizationName?: string // denormalized for display
  currentSector?: SectorType
  currentSectorGeneral?: string
  inPublicSector?: boolean
  role?: string // free text job title
  roleNormalized?: string // from picklist
  roleDepartment?: string
  hierarchyGroup?: HierarchyGroup
  hierarchyLevel?: string // specific title within group
  professionalExpertise?: string[] // from skills taxonomy
  contentExpertise?: string[] // from content domains taxonomy
  publicSystemArea?: string // מערכת ציבורית — domain of activity
  influenceLayer?: InfluenceLayer
  underRepresentation?: string[] // e.g. ['מגזר ערבי', 'מגזר חרדי']
  bio?: string
  communityStatus?: CommunityStatus
  engagementScore?: number // weighted float 0–1
  engagementLevel?: EngagementLevel
  engagementEvents?: Record<string, number> // eventKey → 0|1
  exitReason?: string
  internalNotes?: string
  statusNotes?: string
  lastDataUpdateAt?: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy?: string
  updatedBy?: string
}

export interface Organization {
  id: string // ORG-XXXXX
  name: string
  sector?: SectorType
  generalSector?: string
  district?: DistrictType
  website?: string
  createdAt: Timestamp
}

export interface Program {
  id: string
  name: ProgramType
  title: string
  description?: string
  managerIds: string[] // AppUser UIDs
  isActive: boolean
  createdAt: Timestamp
}

export interface Cohort {
  id: string
  programId: string
  programName?: ProgramType
  label: CohortLabel
  year: number
  title?: string
  startDate?: Timestamp | null
  endDate?: Timestamp | null
  isActive: boolean
  createdAt: Timestamp
}

export interface StatusHistoryEntry {
  from: EnrollmentStatus
  to: EnrollmentStatus
  changedAt: Timestamp
  changedBy: string
  note?: string
}

export interface Enrollment {
  id: string
  profileId: string
  programId: string
  cohortId: string
  cohortLabel?: CohortLabel
  cohortYear?: number
  status: EnrollmentStatus
  statusHistory: StatusHistoryEntry[]
  notes?: string
  internalNotes?: string
  evaluationScore?: number
  interviewDate?: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy?: string
}

// ─── Form Builder ─────────────────────────────────────────────────────────────

export interface ConditionalRule {
  fieldId: string
  operator: 'equals' | 'not_equals' | 'contains' | 'is_empty' | 'is_not_empty'
  value?: string
}

export interface FormField {
  id: string
  type: FieldType
  label: string
  placeholder?: string
  helpText?: string
  required: boolean
  options?: string[] // for single/multi choice & dropdown
  maxLength?: number
  showIf?: ConditionalRule // conditional logic
  order: number
}

export interface FormDefinition {
  id: string
  title: string
  description?: string
  programId?: string
  cohortId?: string
  fields: FormField[]
  publicToken: string // UUID v4 for public URL
  isActive: boolean
  submitMessage?: string
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface FormSubmission {
  id: string
  formId: string
  profileId?: string // matched or newly created profile
  isNewProfile: boolean
  responses: Record<string, string | string[]> // fieldId → answer
  submittedAt: Timestamp
  ipAddress?: string
}

// ─── Segmentation Engine ──────────────────────────────────────────────────────

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'in'
  | 'not_in'
  | 'greater_than'
  | 'less_than'
  | 'is_empty'
  | 'is_not_empty'

export interface SegmentCondition {
  id: string
  field: string // e.g. 'currentSector', 'engagementLevel', 'professionalExpertise'
  operator: ConditionOperator
  value?: string | string[] | number
}

export interface SegmentGroup {
  id: string
  logicalOperator: 'AND' | 'OR'
  conditions: SegmentCondition[]
  groups?: SegmentGroup[] // nested groups
}

export interface SegmentQuery {
  logicalOperator: 'AND' | 'OR'
  conditions: SegmentCondition[]
  groups: SegmentGroup[]
}

export interface Segment {
  id: string
  name: string
  description?: string
  query: SegmentQuery
  lastResultCount?: number
  lastExecutedAt?: Timestamp | null
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Communications ───────────────────────────────────────────────────────────

export interface BroadcastRecipient {
  profileId: string
  name: string
  phone?: string
  email?: string
  delivered?: boolean
  deliveredAt?: Timestamp | null
  error?: string
}

export interface BroadcastLog {
  id: string
  channel: BroadcastChannel
  segmentId?: string
  segmentName?: string
  recipientCount: number
  templateTitle?: string
  templateBody: string
  mergeTagsUsed?: string[]
  dispatchedAt: Timestamp
  completedAt?: Timestamp | null
  status: BroadcastStatus
  recipients?: BroadcastRecipient[]
  createdBy: string
}

// ─── Application user ─────────────────────────────────────────────────────────

export interface AppUser {
  uid: string
  name: string
  email: string
  role: UserRole
  assignedProgramIds: string[] // relevant for ProgramManager
  isActive: boolean
  createdAt: Timestamp
  lastLoginAt?: Timestamp | null
}

// ─── Constants / Labels ───────────────────────────────────────────────────────

export const SECTOR_LABELS: Record<SectorType, string> = {
  'ממשל מרכזי': 'ממשל מרכזי',
  'שלטון מקומי': 'שלטון מקומי',
  'חברה ממשלתית': 'חברה ממשלתית',
  'חברה אזרחית': 'חברה אזרחית',
  'מגזר עסקי': 'מגזר עסקי',
  'אקדמיה': 'אקדמיה',
  'פילנתרופיה': 'פילנתרופיה',
  'לא ידוע': 'לא ידוע',
}

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  'מועמד': 'מועמד',
  'במיון': 'במיון',
  'ראיון': 'ראיון',
  'התקבל': 'התקבל',
  'פעיל': 'פעיל',
  'בוגר': 'בוגר',
  'נשר': 'נשר',
}

export const ENROLLMENT_STATUS_COLORS: Record<EnrollmentStatus, string> = {
  'מועמד': 'bg-sky-100 text-sky-700',
  'במיון': 'bg-amber-100 text-amber-700',
  'ראיון': 'bg-violet-100 text-violet-700',
  'התקבל': 'bg-emerald-100 text-emerald-700',
  'פעיל': 'bg-green-100 text-green-700',
  'בוגר': 'bg-indigo-100 text-indigo-700',
  'נשר': 'bg-rose-100 text-rose-700',
}

export const COMMUNITY_STATUS_COLORS: Record<CommunityStatus, string> = {
  'מתמיין': 'bg-sky-100 text-sky-700',
  'לא התקבל': 'bg-rose-100 text-rose-700',
  'משתתף': 'bg-emerald-100 text-emerald-700',
  'בוגר לא פעיל': 'bg-gray-100 text-gray-600',
  'חבר קהילה': 'bg-indigo-100 text-indigo-700',
}

export const ENGAGEMENT_LEVEL_COLORS: Record<EngagementLevel, string> = {
  'גבוהה': 'bg-green-100 text-green-700',
  'בינונית': 'bg-amber-100 text-amber-700',
  'נמוכה': 'bg-rose-100 text-rose-700',
  'ללא מעורבות': 'bg-gray-100 text-gray-500',
  'טרם רלוונטי': 'bg-slate-100 text-slate-500',
}

export const SECTOR_COLORS: Record<SectorType, string> = {
  'ממשל מרכזי': 'bg-blue-100 text-blue-700',
  'שלטון מקומי': 'bg-teal-100 text-teal-700',
  'חברה ממשלתית': 'bg-cyan-100 text-cyan-700',
  'חברה אזרחית': 'bg-purple-100 text-purple-700',
  'מגזר עסקי': 'bg-orange-100 text-orange-700',
  'אקדמיה': 'bg-pink-100 text-pink-700',
  'פילנתרופיה': 'bg-yellow-100 text-yellow-700',
  'לא ידוע': 'bg-gray-100 text-gray-500',
}

export const BROADCAST_CHANNEL_LABELS: Record<BroadcastChannel, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'אימייל',
}

export const PROGRAM_LABELS: Record<ProgramType, string> = {
  'ממשלתי': 'ממשלתי',
  'מוניציפלי': 'מוניציפלי',
  'אכיפת החוק': 'אכיפת החוק',
  'לא ידוע': 'לא ידוע',
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'שדה טקסט',
  textarea: 'פסקת טקסט',
  single_choice: 'בחירה יחידה',
  multi_choice: 'בחירה מרובה',
  dropdown: 'רשימת בחירה',
  date: 'תאריך',
  number: 'מספר',
  file: 'העלאת קובץ',
}

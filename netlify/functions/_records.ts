/**
 * Turns the system's data into compact Hebrew record lines for the HQ chatbot. Pure — no Firebase.
 * Never put passwords, tokens, personal to-dos, chat history or volunteers' names or phones in here.
 */
import type { RankedChunk, RetrievalDoc } from './_retrieval'

export interface SnapshotRecord {
  type: string
  id: string
  /** Short heading used for ranking and for the prompt. */
  title: string
  text: string
  /** Core records are always in the prompt; the rest compete by relevance. */
  core?: boolean
}

type Data = Record<string, unknown>

/** Keys that must never reach the model, wherever they appear. */
const BLOCKED_KEY = /pass|secret|token|credential|apikey/i

export const DOMAIN_LABELS: Record<string, string> = {
  CEO: 'מנכ"ל', JLM: 'סניפי ירושלים', SUP: 'ספקים', FIN: 'כספים', DON: 'תרומות', DES: 'עיצובים', PUB: 'פרסומים', VOL: 'מתנדבים',
}
const PARTNER_TYPE: Record<string, string> = { payment: 'מערכת סליקה וקבלות', volunteering: 'פלטפורמת התנדבות', partner: 'שותף' }
const PARTNER_STATUS: Record<string, string> = { active: 'פעיל', pilot: 'בפיילוט', potential: 'פוטנציאלי', inactive: 'לא פעיל' }
const PARTNER_CAT: Record<string, string> = { technology: 'טכנולוגיה', finance: 'כספים', volunteering: 'התנדבות', operations: 'תפעול', food_baskets: 'סלי מזון' }
const PAYMENT: Record<string, string> = { credit: 'אשראי', standing_order: 'הוראת קבע', transfer: 'העברה', cash: 'מזומן', check: "צ'ק", bit: 'ביט', foreign: 'מט"ח' }
const RECEIPT: Record<string, string> = { automatic: 'אוטומטית', manual: 'ידנית במערכת', via_linked: 'דרך מערכת מקושרת' }
const USED_FOR: Record<string, string> = { donations: 'תרומות', services: 'מכירת שירותים', products: 'מכירת מוצרים' }
const FINANCE_TYPE: Record<string, string> = { audited: 'דו"ח מבוקר', narrative: 'דוח מילולי', annual_budget: 'תקציב שנתי', execution_report: 'תקציב מול ביצוע', grant_report: 'דיווח לקרן', other: 'אחר' }
const FINANCE_STATUS: Record<string, string> = { draft: 'טיוטה', final: 'סופי', submitted: 'הוגש' }
const OFFICIAL: Record<string, string> = { registration: 'תעודת רישום עמותה', section46: 'אישור סעיף 46', approval: 'אישור ניהול תקין' }
const DRIVE_TYPE: Record<string, string> = { document: 'מסמך', sheet: 'גיליון', folder: 'תיקייה' }
const DRIVE_CAT: Record<string, string> = { budget: 'תקציב', finance: 'כספים', other: 'אחר' }
const HQ_CAT: Record<string, string> = { handover: 'קבצי חפיפה', instructions: 'הנחיות', procedures: 'שימור מידע תהליכי', sop: 'סדרי פעולות', tips: 'טיפים ועצות', other: 'אחר' }
const BRANCH_TYPE: Record<string, string> = { food: 'סניף סלי מזון', cafe_youth: 'מועדון נוער / בית קפה' }
const VOTES_IN: Record<string, string> = { always: 'מצביע תמיד', holidays: 'מצביע בחגים בלבד', never: 'לא מצביע' }

export interface Lookups {
  branchName: (id: string) => string
  roleTitle: (id: string) => string
  holdersOf: (roleId: string) => string[]
  contactName: (id: string) => string
}

export function dateStr(v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'string') return v.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : v
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'number') return new Date(v).toISOString().slice(0, 10)
  const o = v as { toDate?: () => Date; seconds?: number; _seconds?: number }
  if (typeof o.toDate === 'function') return o.toDate().toISOString().slice(0, 10)
  const s = o.seconds ?? o._seconds
  if (typeof s === 'number') return new Date(s * 1000).toISOString().slice(0, 10)
  return ''
}

const cut = (s: unknown, n: number) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}
const list = (v: unknown, map?: Record<string, string>) =>
  Array.isArray(v) ? v.map((x) => (map ? map[String(x)] ?? String(x) : String(x))).filter(Boolean).join(', ') : ''
const names = (ids: unknown, f: (id: string) => string) => (Array.isArray(ids) ? ids.map((i) => f(String(i))).filter(Boolean).join(', ') : '')

/** `label: value` parts, skipping empty ones. */
function parts(pairs: [string, unknown][]): string {
  return pairs
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join(' | ')
}

/** Every simple field of a document as `key: value` — for collections without a dedicated formatter. */
export function flatten(data: Data, opts: { skip?: string[]; maxLen?: number } = {}): string {
  const out: string[] = []
  for (const [k, v] of Object.entries(data)) {
    if (opts.skip?.includes(k) || BLOCKED_KEY.test(k) || v == null || v === '') continue
    let s: string
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') s = String(v)
    else if (Array.isArray(v)) s = v.every((x) => typeof x !== 'object') ? v.join(', ') : cut(JSON.stringify(v, (key, val) => (BLOCKED_KEY.test(key) ? undefined : val)), 240)
    else if (dateStr(v)) s = dateStr(v)
    else s = cut(JSON.stringify(v, (key, val) => (BLOCKED_KEY.test(key) ? undefined : val)), 240)
    if (s) out.push(`${k}: ${s}`)
  }
  return cut(out.join(' | '), opts.maxLen ?? 700)
}

export function accessLabel(role: unknown): string {
  const r = String(role ?? '')
  if (r === 'admin' || r === 'CEO') return 'מנהל מערכת'
  if (r === 'coordinator') return 'רכז/ת סניף'
  if (r === 'none' || r === '') return 'ללא גישה למערכת'
  return DOMAIN_LABELS[r] ? `צוות מטה (${DOMAIN_LABELS[r]})` : 'צוות מטה'
}

export function taskRecord(id: string, t: Data): SnapshotRecord {
  const title = String(t.title ?? '')
  const dates = [dateStr(t.startDate), dateStr(t.endDate)].filter(Boolean).join(' עד ')
  return {
    type: 'משימה', id, title: `${id} ${title}`,
    text: `[משימה ${id}] ${title} | ${parts([
      ['תחום', DOMAIN_LABELS[String(t.domain)] ?? t.domain],
      ['קטגוריה', t.category], ['תדירות', t.frequency], ['תאריכים', dates], ['חג', t.holidayAnchor],
      ['סטטוס', t.status], ['מפעיל', t.activator], ['מעורבים', list(t.involved)],
      ['שלבים', cut(t.steps, 700)], ['הערות', cut(t.notes, 400)],
      ['קבצים מצורפים', Number(t.attachmentCount) > 0 ? t.attachmentCount : ''],
    ])}`,
  }
}

export function userRecord(id: string, u: Data, lk: Lookups): SnapshotRecord {
  return {
    type: 'אדם', id, title: String(u.name ?? ''), core: true,
    text: `[אדם ${id}] ${u.name ?? ''} | ${parts([
      ['הרשאה', accessLabel(u.role)], ['אימייל', u.email], ['טלפון', u.phone],
      ['פעיל', u.active === false ? 'לא' : 'כן'],
      ['תפקידים', names(u.roleIds, lk.roleTitle)], ['סניפי פורטל', names(u.branchIds, lk.branchName)],
    ])}`,
  }
}

export function roleRecord(id: string, r: Data, lk: Lookups): SnapshotRecord {
  const vi = (r.volunteerInfo ?? null) as Data | null
  return {
    type: 'תפקיד', id, title: String(r.roleName ?? ''), core: true,
    text: `[תפקיד ${id}] ${r.roleName ?? ''} | ${parts([
      ['רמה', r.level], ['תחום', DOMAIN_LABELS[String(r.domain)] ?? r.domain], ['אזור', r.area],
      ['סטטוס איוש', r.status], ['עדיפות', r.priority], ['גיוס', r.recruitmentUrgency],
      ['מאויש על ידי', lk.holdersOf(id).join(', ') || 'אין'],
      ['כפוף ל', r.reportsTo ? lk.roleTitle(String(r.reportsTo)) : ''],
      ['סניף פורטל', r.portalBranchId ? lk.branchName(String(r.portalBranchId)) : ''],
      ['נתוני מתנדבים', vi ? flatten(vi, { maxLen: 500 }) : ''], ['הערות', cut(r.notes, 300)],
    ])}`,
  }
}

export function contactRecord(id: string, c: Data, lk: Lookups): SnapshotRecord {
  return {
    type: 'איש קשר', id, title: String(c.name ?? ''),
    text: `[איש קשר ${id}] ${c.name ?? ''} | ${parts([
      ['ארגון', c.organization], ['תפקיד', c.role], ['קטגוריה', c.category], ['סוג', c.type],
      ['טלפון', c.phone], ['אימייל', c.email], ['תחומים', list(c.domainTags)],
      ['סניפים', names(c.branchIds, lk.branchName)], ['הערות', cut(c.notes, 300)],
    ])}`,
  }
}

export function branchRecord(id: string, b: Data): SnapshotRecord {
  return {
    type: 'סניף', id, title: String(b.name ?? ''), core: true,
    text: `[סניף ${id}] ${b.name ?? ''} | ${parts([
      ['עיר', b.city], ['סוג', BRANCH_TYPE[String(b.type)] ?? b.type],
      ['תדירות חלוקה', b.distributionFrequency], ['יום חלוקה', b.distributionDay],
      ['שעת חלוקה', b.distributionTime], ['שעת אריזה', b.packagingTime],
      ['סלים בשבוע', b.weeklyBaskets], ['סלים בחודש', b.monthlyBaskets],
      ['כתובת', b.address], ['קולט קבוצות', b.acceptsGroups === true ? 'כן' : b.acceptsGroups === false ? 'לא' : ''],
    ])}`,
  }
}

export function partnerRecord(id: string, p: Data, lk: Lookups): SnapshotRecord {
  const contacts = [...(Array.isArray(p.contactIds) ? p.contactIds : []), p.internalContactId, p.externalContactId].filter(Boolean).map((c) => lk.contactName(String(c))).filter(Boolean)
  return {
    type: 'שותף/פלטפורמה', id, title: String(p.name ?? ''),
    text: `[${PARTNER_TYPE[String(p.partnerType)] ?? 'שותף'} ${id}] ${p.name ?? ''} | ${parts([
      ['סטטוס', PARTNER_STATUS[String(p.status)] ?? p.status], ['קטגוריות', list(p.categories, PARTNER_CAT)],
      ['אתר', p.websiteUrl], ['מתק ניהול', p.adminUrl], ['אמצעי תשלום', list(p.paymentMethods, PAYMENT)],
      ['הפקת קבלה', RECEIPT[String(p.receiptGeneration)] ?? ''], ['משמש ל', list(p.usedFor, USED_FOR)],
      ['סניפים', names(p.branchIds, lk.branchName)], ['אנשי קשר', [...new Set(contacts)].join(', ')],
      ['איש קשר', p.contactName], ['טלפון', p.phone], ['אימייל', p.email],
      ['קבצים', fileNames(p.files)], ['הערות', cut(p.notes, 500)],
    ])}`,
  }
}

export function supplierRecord(id: string, s: Data, lk: Lookups): SnapshotRecord {
  const linked = (Array.isArray(s.contactIds) ? s.contactIds : []).map((c) => lk.contactName(String(c))).filter(Boolean)
  return {
    type: 'ספק', id, title: String(s.name ?? ''),
    text: `[ספק ${id}] ${s.name ?? ''} | ${parts([
      ['סטטוס', s.status === 'inactive' ? 'לא פעיל' : 'פעיל'], ['קטגוריות', list(s.categories)],
      ['מספק לסניפים', names(s.branchIds, lk.branchName)], ['איש קשר', s.contactName], ['טלפון', s.phone], ['אימייל', s.email],
      ['אנשי קשר מקושרים', linked.join(', ')], ['אתר', s.websiteUrl], ['קבצים', fileNames(s.files)], ['הערות', cut(s.notes, 500)],
    ])}`,
  }
}

function fileNames(files: unknown): string {
  return Array.isArray(files) ? files.map((f) => String((f as Data)?.name ?? '')).filter(Boolean).join(', ') : ''
}

export function financeRecord(id: string, d: Data): SnapshotRecord {
  return {
    type: 'דוח כספי', id, title: String(d.title ?? ''),
    text: `[דוח כספי ${id}] ${d.title ?? ''} | ${parts([
      ['סוג', FINANCE_TYPE[String(d.docType)] ?? d.docType], ['תקופה', d.period], ['סטטוס', FINANCE_STATUS[String(d.status)] ?? d.status],
      ['קובץ', d.fileName], ['הערות', cut(d.notes, 400)],
    ])}`,
  }
}

export function officialRecord(id: string, d: Data): SnapshotRecord {
  const label = OFFICIAL[String(d.subtype)] ?? String(d.subtype ?? '')
  return {
    type: 'טופס רשמי', id, title: label,
    text: `[טופס רשמי ${id}] ${label} | ${parts([
      ['שנה', d.year], ['תוקף עד', dateStr(d.validUntil)], ['מספר רישום', d.registrationNumber], ['קובץ', d.fileName], ['הערות', cut(d.notes, 300)],
    ])}`,
  }
}

export function driveRecord(id: string, d: Data): SnapshotRecord {
  return {
    type: 'קישור דרייב', id, title: String(d.name ?? ''),
    text: `[קישור דרייב ${id}] ${d.name ?? ''} | ${parts([
      ['סוג', DRIVE_TYPE[String(d.driveType)] ?? d.driveType], ['קטגוריה', DRIVE_CAT[String(d.category)] ?? d.category],
      ['שנה', d.year], ['קישור', d.url], ['הערות', cut(d.notes, 300)],
    ])}`,
  }
}

export function hqKnowledgeRecord(id: string, k: Data): SnapshotRecord {
  return {
    type: 'ידע מטה', id, title: String(k.title ?? ''),
    text: `[ידע מטה ${id}] ${k.title ?? ''} | ${parts([
      ['קטגוריה', HQ_CAT[String(k.category)] ?? k.category], ['תחום', k.domain === 'all' ? 'כללי' : DOMAIN_LABELS[String(k.domain)] ?? k.domain],
      ['קובץ', k.fileName], ['תוכן', String(k.content ?? '').trim()],
    ])}`,
  }
}

export function knowledgeItemRecord(id: string, k: Data, lk: Lookups): SnapshotRecord {
  const branch = k.branchId === 'global' ? 'כלל-ארגוני' : lk.branchName(String(k.branchId ?? ''))
  return {
    type: 'ידע סניפי', id, title: String(k.title ?? ''),
    text: `[ידע ${id}] ${k.title ?? ''} | ${parts([
      ['סניף', branch], ['סוג', k.type], ['תוכן', String(k.content ?? '').trim()],
      ['צ׳קליסט', list(k.checklistItems)], ['קישור', k.url], ['קובץ', k.fileName],
    ])}`,
  }
}

function reportValue(v: unknown): string {
  if (v && typeof v === 'object') {
    const o = v as { rating?: unknown; notes?: unknown }
    return [o.rating != null && o.rating !== '' ? `דירוג ${o.rating}/5` : '', cut(o.notes, 300)].filter(Boolean).join(' — ')
  }
  return cut(v, 400)
}

export function reportRecord(id: string, r: Data, labelByKey: Record<string, string>, lk: Lookups): SnapshotRecord {
  const branch = lk.branchName(String(r.branchId ?? ''))
  const data = (r.data ?? {}) as Data
  const answers = Object.entries(data)
    .map(([k, v]) => [labelByKey[k] ?? k, reportValue(v)] as [string, string])
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' | ')
  return {
    type: 'דיווח רבעוני', id, title: `${branch} ${r.quarter ?? ''} ${r.year ?? ''}`,
    text: `[דיווח רבעוני ${id}] ${branch} | ${r.quarter ?? ''} ${r.year ?? ''} | הוגש: ${dateStr(r.submittedAt)} | ${answers}`,
  }
}

export interface VolunteerAggregateInput {
  members: { branchIds?: string[]; status?: string }[]
  shifts: { id?: string; branchId?: string; month?: string; capacity?: number; status?: string }[]
  assignments: { branchId?: string; status?: string; shiftId?: string }[]
  responses: { branchId?: string; month?: string; status?: string; sentAt?: unknown }[]
}

/** Counts only — no volunteer names, phones or links ever leave Firestore for the model. */
export function volunteerAggregates(input: VolunteerAggregateInput, lk: Lookups): SnapshotRecord[] {
  const branches = new Set<string>()
  for (const m of input.members) for (const b of m.branchIds ?? []) branches.add(b)
  for (const s of input.shifts) if (s.branchId) branches.add(s.branchId)
  for (const a of input.assignments) if (a.branchId) branches.add(a.branchId)
  for (const r of input.responses) if (r.branchId) branches.add(r.branchId)

  const monthOfShift = new Map<string, string>()
  for (const s of input.shifts) if (s.id && s.month) monthOfShift.set(s.id, s.month)
  const out: SnapshotRecord[] = []
  for (const b of branches) {
    const members = input.members.filter((m) => m.branchIds?.includes(b))
    const active = members.filter((m) => m.status !== 'inactive').length
    const months = new Map<string, { shifts: number; capacity: number; cancelled: number; assign: Record<string, number>; resp: Record<string, number>; sent: number }>()
    const get = (m: string) => {
      let e = months.get(m)
      if (!e) { e = { shifts: 0, capacity: 0, cancelled: 0, assign: {}, resp: {}, sent: 0 }; months.set(m, e) }
      return e
    }
    for (const s of input.shifts) {
      if (s.branchId !== b || !s.month) continue
      const e = get(s.month)
      if (s.status === 'cancelled') e.cancelled++
      else { e.shifts++; e.capacity += Number(s.capacity) || 0 }
    }
    for (const a of input.assignments) {
      if (a.branchId !== b) continue
      const m = a.shiftId ? monthOfShift.get(a.shiftId) : undefined
      if (!m) continue
      const e = get(m)
      e.assign[a.status ?? '?'] = (e.assign[a.status ?? '?'] ?? 0) + 1
    }
    for (const r of input.responses) {
      if (r.branchId !== b || !r.month) continue
      const e = get(r.month)
      if (r.sentAt) e.sent++
      const st = r.status ?? 'ללא תשובה'
      e.resp[st] = (e.resp[st] ?? 0) + 1
    }
    const monthLines = [...months.entries()].sort(([a], [c]) => a.localeCompare(c)).map(([m, e]) => {
      const assign = Object.entries(e.assign).map(([k, v]) => `${ASSIGN[k] ?? k} ${v}`).join(', ')
      const resp = Object.entries(e.resp).map(([k, v]) => `${RESP[k] ?? k} ${v}`).join(', ')
      return `${m}: משמרות ${e.shifts} (קיבולת ${e.capacity}${e.cancelled ? `, בוטלו ${e.cancelled}` : ''})${assign ? `, שיבוצים: ${assign}` : ''}${resp ? `, תגובות: ${resp}` : ''}${e.sent ? `, נשלחו ${e.sent}` : ''}`
    })
    out.push({
      type: 'מתנדבים (סיכום)', id: b, title: `מתנדבים ${lk.branchName(b)}`,
      text: `[מתנדבים – סיכום סניף ${lk.branchName(b)}] מתנדבים רשומים: ${members.length} (פעילים: ${active})${monthLines.length ? ` | ${monthLines.join(' | ')}` : ''}`,
    })
  }
  return out
}

const ASSIGN: Record<string, string> = { committed: 'התחייבו', cancelled: 'בוטלו', attended: 'הגיעו', no_show: 'לא הגיעו' }
const RESP: Record<string, string> = { answered: 'ענו', declined: 'סירבו', none: 'ללא תשובה' }

// ── Basket survey ───────────────────────────────────────────────────────────

export function votingRecords(
  config: Data | undefined,
  rounds: { id: string; data: Data }[],
  decisions: { id: string; data: Data }[],
  settings: { id: string; data: Data }[],
  lk: Lookups,
): SnapshotRecord[] {
  const out: SnapshotRecord[] = []
  const products = (Array.isArray(config?.products) ? config!.products : []) as Data[]
  for (const p of products) {
    out.push({
      type: 'סקר סלים – מוצר', id: String(p.id ?? p.name), title: String(p.name ?? ''),
      text: `[סקר סלים – מוצר] ${p.name ?? ''} | ${parts([
        ['קטגוריה', p.cat], ['מחיר', p.price], ['מקסימום', p.max], ['קטגוריית ספק', p.supplier],
        ['פעיל בסקר', p.active === false ? 'לא (מוסתר)' : 'כן'], ['מוחרג מסניפים', names(p.excludedBranches, lk.branchName)],
      ])}`,
    })
  }
  const baskets = (Array.isArray(config?.baskets) ? config!.baskets : []) as Data[]
  if (baskets.length > 0) {
    out.push({ type: 'סקר סלים – סלים', id: 'baskets', title: 'סלים ותקציבים', text: `[סקר סלים – סלים] ${baskets.map((b) => `${b.name}: תקציב ${b.budget}`).join(' | ')}` })
  }
  const round = config?.round as Data | undefined
  if (round) {
    out.push({
      type: 'סקר סלים – סבב נוכחי', id: 'round', title: 'סבב נוכחי',
      text: `[סקר סלים – סבב נוכחי] ${parts([['מספר', round.num], ['פתוח להצבעה', round.open ? 'כן' : 'לא'], ['סוג הזמנה', round.orderType], ['שנה', round.year], ['נפתח', dateStr(round.openedAt)]])}`,
    })
  }
  for (const r of rounds) out.push({ type: 'סקר סלים – סבב', id: r.id, title: `סבב ${r.id}`, text: `[סקר סלים – סבב ${r.id}] ${flatten(r.data, { maxLen: 900 })}` })
  for (const d of decisions) out.push({ type: 'סקר סלים – החלטת ספק', id: d.id, title: `החלטת ספק ${d.id}`, text: `[סקר סלים – החלטת ספק ${d.id}] ${flatten(d.data, { maxLen: 900 })}` })
  for (const s of settings) {
    out.push({
      type: 'סקר סלים – סניף', id: s.id, title: lk.branchName(s.id),
      text: `[סקר סלים – סניף ${lk.branchName(s.id)}] ${parts([['הצבעה', VOTES_IN[String(s.data.votesIn)] ?? s.data.votesIn], ['משפחות (שגרה)', s.data.familiesRoutine], ['משפחות (חג)', s.data.familiesHoliday]])}`,
    })
  }
  return out
}

// ── Catalog and context assembly ────────────────────────────────────────────

export function catalogRecord(counts: Record<string, number>, taskStats: { byStatus: Record<string, number>; byDomain: Record<string, number> }): SnapshotRecord {
  const total = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' | ')
  const status = Object.entries(taskStats.byStatus).map(([k, v]) => `${k} ${v}`).join(', ')
  const domain = Object.entries(taskStats.byDomain).map(([k, v]) => `${DOMAIN_LABELS[k] ?? k} ${v}`).join(', ')
  return {
    type: 'קטלוג נתונים', id: 'catalog', title: 'קטלוג נתונים', core: true,
    text: `[קטלוג נתונים — כמה רשומות יש בכל אוסף] ${total}\nמשימות לפי סטטוס: ${status}\nמשימות לפי תחום: ${domain}`,
  }
}

export function recordsAsDocs(records: SnapshotRecord[]): RetrievalDoc[] {
  return records.map((r) => ({ id: `${r.type}:${r.id}`, title: r.title, label: r.type, text: r.text }))
}

export interface ContextBuild {
  coreText: string
  recordsText: string
  recordsChars: number
  omitted: number
}

/** Core records first, then the ranked records that still fit in `budget` characters. */
export function buildRecordsContext(core: SnapshotRecord[], rankedChunks: RankedChunk[], budget: number): ContextBuild {
  const coreText = core.map((r) => r.text).join('\n')
  let left = Math.max(0, budget - coreText.length)
  const coreIds = new Set(core.map((r) => `${r.type}:${r.id}`))
  const lines: string[] = []
  let omitted = 0
  const seen = new Map<string, number>()
  for (const c of rankedChunks) {
    if (coreIds.has(c.docId)) continue
    if (c.text.length > left) { omitted++; continue }
    const n = seen.get(c.docId) ?? 0
    seen.set(c.docId, n + 1)
    lines.push(c.text)
    left -= c.text.length
  }
  const recordsText = lines.join('\n')
  return { coreText, recordsText, recordsChars: coreText.length + recordsText.length, omitted }
}

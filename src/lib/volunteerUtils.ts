/** Generate a 24-character URL-safe random token. */
export function randomToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  const arr = crypto.getRandomValues(new Uint8Array(24))
  for (const b of arr) out += chars[b % chars.length]
  return out
}

/** Format an ISO date string as a Hebrew-style label, e.g. "ג׳ 2.12". */
export function formatShiftDate(isoDate: string): { dayName: string; label: string } {
  const d = new Date(isoDate + 'T00:00:00')
  const days = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
  return {
    dayName: days[d.getDay()],
    label: `${d.getDate()}.${d.getMonth() + 1}`,
  }
}

/** Returns "2026-12" for the current month. */
export function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Returns next month string from a given month string. */
export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m) // first day of next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Returns prev month string from a given month string. */
export function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2) // first day of prev month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Human-readable month label: "דצמבר 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const names = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']
  return `${names[m - 1]} ${y}`
}

export const DEFAULT_SEND_TEMPLATE =
  'היי {name}, פתחנו שיבוצים לחלוקות שכן טוב {branch} לחודש {month}. אפשר לבחור מתי מתאים כאן: {link}'

export const DEFAULT_REMINDER_TEMPLATE =
  'היי {name}, תזכורת: מחר ({date}) חלוקה של שכן טוב {branch} בשעה {shift time} ב{place}. מחכים לך! אם משהו השתנה, עדכן אותנו.'

/** Replace {placeholders} (any name, spaces allowed); unknown ones are left untouched. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (m, key: string) => (key in vars ? vars[key] : m))
}

/** Digits-only international number for wa.me; accepts +972…, 972… and local 05x… forms. */
export function toWaNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('972')) return digits
  if (digits.startsWith('0')) return '972' + digits.slice(1)
  return digits
}

export function waUrl(phone: string, message: string): string {
  return `https://wa.me/${toWaNumber(phone)}?text=${encodeURIComponent(message)}`
}

/** Build the WhatsApp web link for a volunteer + personal URL. */
export function waLink(phone: string, name: string, branchName: string, monthStr: string, token: string, template = DEFAULT_SEND_TEMPLATE): string {
  const msg = fillTemplate(template, {
    name, branch: branchName, month: monthLabel(monthStr), link: `${window.location.origin}/v/${token}`,
  })
  return waUrl(phone, msg)
}

export type ReplyState = 'none' | 'sent' | 'opened' | 'answered' | 'declined'

export const REPLY_LABEL: Record<ReplyState, string> = {
  none: 'לא נשלח', sent: 'נשלח', opened: 'נפתח', answered: 'ענה', declined: 'סירב',
}

/** Where a volunteer stands for the month, from the stored response doc (if any). */
export function replyState(r?: { status?: string; sentAt?: unknown; openedAt?: unknown }): ReplyState {
  if (!r) return 'none'
  if (r.status === 'answered') return 'answered'
  if (r.status === 'declined') return 'declined'
  if (r.openedAt) return 'opened'
  if (r.sentAt) return 'sent'
  return 'none'
}

/** True when the volunteer has not yet answered or declined. */
export const isMissingReply = (s: ReplyState) => s !== 'answered' && s !== 'declined'

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function tomorrowISO(now = new Date()): string {
  return isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
}

export interface ReportShift { id: string; date: string; startTime: string; endTime: string; location: string; capacity: number; status: string }
export interface ReportAssignment { shiftId: string; volunteerId: string; status: string }
export interface ReportVolunteer { id: string; name: string; status: string; optOut: boolean }
export interface ReportResponse { volunteerId: string; status?: string; sentAt?: unknown; openedAt?: unknown }

/** Plain-text coordinator report for a month, ready to paste into WhatsApp. */
export function buildReport(input: {
  branchName: string
  month: string
  shifts: ReportShift[]
  assignments: ReportAssignment[]
  volunteers: ReportVolunteer[]
  responses: ReportResponse[]
}): string {
  const { branchName, month, shifts, assignments, volunteers, responses } = input
  const name = (id: string) => volunteers.find((v) => v.id === id)?.name ?? id
  const lines: string[] = [`דוח חלוקות ${branchName} — ${monthLabel(month)}`, '']

  const active = shifts.filter((s) => s.status !== 'cancelled')
  if (active.length === 0) lines.push('אין חלוקות בחודש זה.')
  for (const s of active) {
    const mine = assignments.filter((a) => a.shiftId === s.id)
    const committed = mine.filter((a) => a.status === 'committed' || a.status === 'attended' || a.status === 'no_show')
    const missing = Math.max(0, s.capacity - committed.length)
    const { dayName, label } = formatShiftDate(s.date)
    lines.push(`${dayName} ${label} ${s.startTime}–${s.endTime}${s.location ? ` · ${s.location}` : ''}`)
    lines.push(`  רשומים ${committed.length}/${s.capacity}${missing > 0 ? ` · חסרים ${missing}` : ' · מלא'}`)
    const attended = mine.filter((a) => a.status === 'attended').length
    const noShows = mine.filter((a) => a.status === 'no_show')
    if (attended > 0) lines.push(`  הגיעו ${attended}`)
    if (noShows.length > 0) lines.push(`  לא הגיעו: ${noShows.map((a) => name(a.volunteerId)).join(', ')}`)
  }

  const eligible = volunteers.filter((v) => v.status === 'active' && !v.optOut)
  const stateOf = (id: string) => replyState(responses.find((r) => r.volunteerId === id))
  const notAnswered = eligible.filter((v) => isMissingReply(stateOf(v.id)))
  const declined = eligible.filter((v) => stateOf(v.id) === 'declined')
  lines.push('')
  lines.push(`ענו: ${eligible.filter((v) => stateOf(v.id) === 'answered').length} · סירבו: ${declined.length} · לא ענו: ${notAnswered.length}`)
  if (notAnswered.length > 0) lines.push(`לא ענו: ${notAnswered.map((v) => v.name).join(', ')}`)
  if (declined.length > 0) lines.push(`סירבו: ${declined.map((v) => v.name).join(', ')}`)
  return lines.join('\n')
}

/** Generate an .ics file content for given shift dates. */
export function buildICS(volunteerId: string, shifts: { date: string; startTime: string; endTime: string; location: string; branchName: string }[]): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const toICS = (date: string, time: string) => {
    const d = new Date(`${date}T${time}:00`)
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
  }
  const events = shifts.map((s, i) => {
    // Reminder 24h before
    const start = toICS(s.date, s.startTime)
    const end = toICS(s.date, s.endTime)
    return [
      'BEGIN:VEVENT',
      `UID:shachentov-${volunteerId}-${i}@shahen.crm`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:חלוקת שכן טוב – ${s.branchName}`,
      `LOCATION:${s.location}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT24H',
      'ACTION:DISPLAY',
      `DESCRIPTION:תזכורת: חלוקה מחר ב-${s.startTime} – ${s.location}`,
      'END:VALARM',
      'END:VEVENT',
    ].join('\r\n')
  }).join('\r\n')

  return ['BEGIN:VCALENDAR','VERSION:2.0','CALSCALE:GREGORIAN','METHOD:PUBLISH',events,'END:VCALENDAR'].join('\r\n')
}

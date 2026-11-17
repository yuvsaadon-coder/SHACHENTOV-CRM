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

/** Build the WhatsApp web link for a volunteer + personal URL. */
export function waLink(phone: string, name: string, branchName: string, monthStr: string, token: string): string {
  const month = monthLabel(monthStr)
  const url = `${window.location.origin}/v/${token}`
  const msg = `היי ${name}, פתחנו שיבוצים לחלוקות שכן טוב ${branchName} לחודש ${month}. אפשר לבחור מתי מתאים כאן: ${url}`
  const e164 = phone.replace('+', '')
  return `https://wa.me/${e164}?text=${encodeURIComponent(msg)}`
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

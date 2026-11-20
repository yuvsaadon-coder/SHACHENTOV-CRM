/** The operational fields a coordinator may change on their own branch, and how each is validated. */
export const OPS_FIELDS = [
  'distributionFrequency', 'distributionDay', 'weeklyBaskets', 'monthlyBaskets',
  'packagingTime', 'distributionTime', 'address', 'acceptsGroups',
] as const

export type OpsField = (typeof OPS_FIELDS)[number]
export type OpsUpdate = Partial<Record<OpsField, string | number | boolean | null>>

const TEXT_MAX = 200
const NUMBER_FIELDS = new Set<OpsField>(['weeklyBaskets', 'monthlyBaskets'])

/** Returns the clean update, or an error in Hebrew. Unknown fields are refused, never ignored. */
export function validateOps(input: unknown): { ok: true; update: OpsUpdate } | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, error: 'נתונים לא תקינים' }
  const update: OpsUpdate = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!(OPS_FIELDS as readonly string[]).includes(key)) return { ok: false, error: `שדה לא מותר: ${key}` }
    const field = key as OpsField
    if (field === 'acceptsGroups') {
      if (typeof value !== 'boolean') return { ok: false, error: 'ערך לא תקין ב"קולט קבוצות"' }
      update[field] = value
    } else if (NUMBER_FIELDS.has(field)) {
      if (value === null || value === '') { update[field] = null; continue }
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100000) return { ok: false, error: 'מספר הסלים חייב להיות מספר שלם בין 0 ל-100000' }
      update[field] = value
    } else {
      if (value === null) { update[field] = null; continue }
      if (typeof value !== 'string') return { ok: false, error: 'ערך טקסט לא תקין' }
      const text = value.trim()
      if (text.length > TEXT_MAX) return { ok: false, error: `טקסט ארוך מדי (עד ${TEXT_MAX} תווים)` }
      update[field] = text === '' ? null : text
    }
  }
  if (Object.keys(update).length === 0) return { ok: false, error: 'אין מה לעדכן' }
  return { ok: true, update }
}

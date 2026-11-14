// מבנה התיוק (טקסונומיה) - טיפוסים ופונקציות עזר.
// הטקסונומיה החיה נשמרת ב-Firestore במסמך config/taxonomy וניתנת לעריכה ממסך הניהול.
// קובץ taxonomy/taxonomy.json הוא נקודת ההתחלה (זריעה).

export interface TaxValue {
  key: string
  label: string
  hint?: string
  /** הערת היקף (scope note): מה לא נכנס לכאן ולאן כן */
  exclude?: string
  note?: string
  active?: boolean
}

export interface TaxDimension {
  label: string
  multi: boolean
  values: TaxValue[]
}

export interface LinkType {
  key: string
  label: string
  inverse: string
}

export interface Taxonomy {
  version: number
  folders: TaxValue[]
  dimensions: Record<string, TaxDimension>
  linkTypes: LinkType[]
  required: string[]
  /** רשימות מפתחות שטוחות - בשימוש כללי האבטחה של Firestore לאימות ערכים */
  keys?: Record<string, string[]>
}

export const MULTI_DIMS = ['forum', 'dimension', 'responsibility', 'unit', 'leg', 'topic', 'stakeholderCircle', 'chapter'] as const
export const SINGLE_DIMS = ['docType', 'status', 'publisher'] as const
export type MultiDim = (typeof MULTI_DIMS)[number]
export type SingleDim = (typeof SINGLE_DIMS)[number]

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/

export function isValidKey(key: string): boolean {
  return KEY_RE.test(key)
}

export function isActive(v: TaxValue): boolean {
  return v.active !== false
}

/** מחשב את רשימות המפתחות שכללי האבטחה בודקים מולן. כולל גם ערכים לא פעילים - כדי שמסמכים ישנים יישארו תקינים. */
export function computeKeys(tax: Taxonomy): Record<string, string[]> {
  const keys: Record<string, string[]> = {
    folder: tax.folders.map((f) => f.key),
    linkType: tax.linkTypes.map((l) => l.key),
  }
  for (const [dim, def] of Object.entries(tax.dimensions)) keys[dim] = def.values.map((v) => v.key)
  return keys
}

export function withKeys(tax: Taxonomy): Taxonomy {
  return { ...tax, keys: computeKeys(tax) }
}

export function folderLabel(tax: Taxonomy, key: string): string {
  return tax.folders.find((f) => f.key === key)?.label ?? key
}

export function valueLabel(tax: Taxonomy, dim: string, key: string): string {
  return tax.dimensions[dim]?.values.find((v) => v.key === key)?.label ?? key
}

export function linkTypeLabel(tax: Taxonomy, key: string, inverse = false): string {
  const lt = tax.linkTypes.find((l) => l.key === key)
  if (!lt) return key
  return inverse ? lt.inverse : lt.label
}

/** בודק שינוי טקסונומיה לפני שמירה: אסור למחוק מפתחות קיימים (רק להשבית), אסור כפילויות, מפתחות בפורמט תקין. */
export function validateTaxonomyChange(before: Taxonomy, after: Taxonomy): string[] {
  const errors: string[] = []
  const checkList = (name: string, prev: { key: string }[], next: { key: string; label?: string }[]) => {
    const seen = new Set<string>()
    for (const v of next) {
      if (!isValidKey(v.key)) errors.push(`${name}: מפתח לא תקין "${v.key}" (אותיות לטיניות קטנות, ספרות ומקף בלבד)`)
      if (seen.has(v.key)) errors.push(`${name}: מפתח כפול "${v.key}"`)
      seen.add(v.key)
      if (v.label !== undefined && !v.label.trim()) errors.push(`${name}: לערך "${v.key}" חסרה תווית`)
    }
    for (const v of prev) if (!seen.has(v.key)) errors.push(`${name}: אי אפשר למחוק את "${v.key}" - יש להשבית אותו במקום`)
  }
  checkList('תיקיות', before.folders, after.folders)
  checkList('סוגי קישור', before.linkTypes, after.linkTypes)
  for (const [dim, def] of Object.entries(before.dimensions)) {
    const next = after.dimensions[dim]
    if (!next) {
      errors.push(`אי אפשר למחוק את הציר "${def.label}"`)
      continue
    }
    checkList(def.label, def.values, next.values)
  }
  return errors
}

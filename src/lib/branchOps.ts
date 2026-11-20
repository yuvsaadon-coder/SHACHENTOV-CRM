import type { Branch } from '../types'

export const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת', 'משתנה']

export interface OpsForm {
  distributionFrequency: string
  distributionDay: string
  weeklyBaskets: string
  monthlyBaskets: string
  packagingTime: string
  distributionTime: string
  address: string
  acceptsGroups: boolean
}

export function opsFormFrom(b: Branch): OpsForm {
  return {
    distributionFrequency: b.distributionFrequency ?? '',
    distributionDay: b.distributionDay ?? '',
    weeklyBaskets: b.weeklyBaskets != null ? String(b.weeklyBaskets) : '',
    monthlyBaskets: b.monthlyBaskets != null ? String(b.monthlyBaskets) : '',
    packagingTime: b.packagingTime ?? '',
    distributionTime: b.distributionTime ?? '',
    address: b.address ?? '',
    acceptsGroups: b.acceptsGroups ?? false,
  }
}

/** The request body: only fields that changed, numbers as numbers, empty text as null. */
export function opsPayload(form: OpsForm, branch: Branch): Record<string, string | number | boolean | null> {
  const before = opsFormFrom(branch)
  const out: Record<string, string | number | boolean | null> = {}
  for (const key of Object.keys(form) as (keyof OpsForm)[]) {
    if (form[key] === before[key]) continue
    const v = form[key]
    if (key === 'weeklyBaskets' || key === 'monthlyBaskets') out[key] = v === '' ? null : Number(v)
    else if (typeof v === 'string') out[key] = v.trim() === '' ? null : v.trim()
    else out[key] = v
  }
  return out
}

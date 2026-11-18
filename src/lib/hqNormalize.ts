import type { HQPartner, HQSupplier } from '../types'

/** Documents written by older versions or by hand may lack fields the UI relies on. */
export function normalizePartner(id: string, data: Partial<HQPartner>): HQPartner {
  return {
    ...data,
    id,
    name: data.name ?? '',
    partnerType: data.partnerType ?? 'partner',
    categories: Array.isArray(data.categories) ? data.categories : [],
    status: data.status ?? 'potential',
    branchIds: Array.isArray(data.branchIds) ? data.branchIds : [],
    files: Array.isArray(data.files) ? data.files : [],
    active: data.active ?? true,
  } as HQPartner
}

export function normalizeSupplier(id: string, data: Partial<HQSupplier>): HQSupplier {
  return {
    ...data,
    id,
    name: data.name ?? '',
    categories: Array.isArray(data.categories) ? data.categories : [],
    branchIds: Array.isArray(data.branchIds) ? data.branchIds : [],
    files: Array.isArray(data.files) ? data.files : [],
    status: data.status ?? 'active',
    active: data.active ?? true,
  } as HQSupplier
}

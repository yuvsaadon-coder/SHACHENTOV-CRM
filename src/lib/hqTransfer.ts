import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import { PARTNER_CAT_LABELS } from '../types'
import type { HQPartner, HQSupplier } from '../types'

type Fields<T> = Omit<T, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>

const unique = (ids: (string | undefined)[]) => [...new Set(ids.filter((x): x is string => !!x))]

function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}

export function partnerToSupplier(p: HQPartner): Fields<HQSupplier> {
  const labels = p.categories.map((c) => PARTNER_CAT_LABELS[c]).filter(Boolean)
  const contactIds = unique([...(p.contactIds ?? []), p.internalContactId, p.externalContactId])
  return clean({
    name: p.name,
    categories: p.supplierCategories ?? labels,
    branchIds: p.branchIds ?? [],
    status: p.status === 'active' ? 'active' : 'inactive',
    contactName: p.contactName,
    phone: p.phone,
    email: p.email,
    contactIds: contactIds.length > 0 ? contactIds : undefined,
    notes: p.notes,
    websiteUrl: p.websiteUrl,
    adminUrl: p.adminUrl,
    paymentMethods: p.paymentMethods,
    receiptGeneration: p.receiptGeneration,
    usedFor: p.usedFor,
    partnerType: p.partnerType,
    partnerCategories: p.categories,
    partnerStatus: p.status,
    statusHistory: p.statusHistory,
    active: true,
  })
}

export function supplierToPartner(s: HQSupplier): Fields<HQPartner> {
  const contactIds = s.contactIds ?? []
  return clean({
    name: s.name,
    partnerType: s.partnerType ?? 'partner',
    categories: s.partnerCategories ?? [],
    status: s.partnerStatus ?? (s.status === 'active' ? 'active' : 'inactive'),
    websiteUrl: s.websiteUrl,
    adminUrl: s.adminUrl,
    internalContactId: contactIds[0],
    externalContactId: contactIds[1],
    notes: s.notes,
    paymentMethods: s.paymentMethods,
    receiptGeneration: s.receiptGeneration,
    usedFor: s.usedFor,
    statusHistory: s.statusHistory,
    contactIds: contactIds.length > 0 ? contactIds : undefined,
    contactName: s.contactName,
    phone: s.phone,
    email: s.email,
    branchIds: s.branchIds,
    supplierCategories: s.categories,
    active: true,
  })
}

/** Creates the target document and deletes the source in one atomic batch. */
async function move(fromCol: string, fromId: string, toCol: string, data: object, uid: string) {
  const batch = writeBatch(db)
  batch.set(doc(collection(db, toCol)), {
    ...data,
    createdBy: uid,
    updatedBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.delete(doc(db, fromCol, fromId))
  await batch.commit()
}

export const transferPartnerToSupplier = (p: HQPartner, uid: string) =>
  move('hq_partners', p.id, 'hq_suppliers', partnerToSupplier(p), uid)

export const transferSupplierToPartner = (s: HQSupplier, uid: string) =>
  move('hq_suppliers', s.id, 'hq_partners', supplierToPartner(s), uid)


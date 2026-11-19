import type { BranchContact } from '../hooks/useBranchSuppliers'

const digits = (s?: string) => (s ?? '').replace(/\D/g, '')

/** Linked contacts that are not just a repeat of the supplier's own contact details. */
export function distinctContacts(own: { contactName?: string; phone?: string; email?: string }, linked: BranchContact[]): BranchContact[] {
  const seen = new Set<string>()
  const ownPhone = digits(own.phone)
  const ownEmail = (own.email ?? '').trim().toLowerCase()
  return linked.filter((c) => {
    const phone = digits(c.phone)
    const email = (c.email ?? '').trim().toLowerCase()
    if ((phone && phone === ownPhone) || (email && email === ownEmail)) return false
    const key = `${c.name.trim()}|${phone}|${email}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** tel: href from an Israeli-style phone number as typed by people. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

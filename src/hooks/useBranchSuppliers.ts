import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

export interface BranchContact { name: string; phone?: string; email?: string; role?: string; organization?: string }
export interface BranchSupplier {
  id: string; name: string; categories: string[]
  contactName?: string; phone?: string; email?: string; websiteUrl?: string; logoUrl?: string; status?: string
  contacts: BranchContact[]
}
export interface BranchPartner { id: string; name: string; partnerType?: string; websiteUrl?: string; logoUrl?: string; status?: string; contacts: BranchContact[] }

/** Suppliers and partners of a branch, via the server (coordinators cannot read HQ collections directly). */
export function useBranchSuppliers(branchId: string) {
  const { firebaseUser } = useAuth()
  const [suppliers, setSuppliers] = useState<BranchSupplier[]>([])
  const [partners, setPartners] = useState<BranchPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    ;(async () => {
      try {
        const token = await firebaseUser?.getIdToken()
        const res = await fetch('/.netlify/functions/branch-suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
          body: JSON.stringify({ branchId }),
        })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { suppliers: BranchSupplier[]; partners: BranchPartner[] }
        if (cancelled) return
        setSuppliers(data.suppliers)
        setPartners(data.partners)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [branchId, firebaseUser])

  return { suppliers, partners, loading, error }
}

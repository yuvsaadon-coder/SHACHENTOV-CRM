import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

/** Saves a coordinator's changes to their branch's operational data (through the server, which checks the branch). */
export function useUpdateBranchOps() {
  const { firebaseUser } = useAuth()
  const [saving, setSaving] = useState(false)

  const save = async (branchId: string, fields: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> => {
    setSaving(true)
    try {
      const token = await firebaseUser?.getIdToken()
      const res = await fetch('/.netlify/functions/update-branch-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ branchId, fields }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      return res.ok ? { ok: true } : { ok: false, error: data.error ?? 'השמירה נכשלה' }
    } catch {
      return { ok: false, error: 'שגיאת רשת — נסה שוב.' }
    } finally {
      setSaving(false)
    }
  }

  return { save, saving }
}

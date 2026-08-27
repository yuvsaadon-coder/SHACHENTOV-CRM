'use client'

import { useEffect, useState } from 'react'
import { getForms, createForm } from '@/lib/firestore'
import type { FormDefinition } from '@/types/crm'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Plus, Copy, ExternalLink, ToggleLeft, ToggleRight } from 'lucide-react'
import { generateToken } from '@/lib/utils'
import Link from 'next/link'
import { updateDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'

export default function FormsPage() {
  const { appUser } = useAuth()
  const [forms, setForms] = useState<FormDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    getForms().then(data => { setForms(data); setLoading(false) })
  }, [])

  async function handleCreate() {
    if (!appUser) return
    setCreating(true)
    const id = await createForm({
      title: 'טופס חדש',
      fields: [],
      publicToken: generateToken(),
      isActive: false,
      createdBy: appUser.uid,
    })
    setCreating(false)
    window.location.href = `/forms/${id}`
  }

  async function toggleActive(form: FormDefinition) {
    await updateDoc(doc(db, 'forms', form.id), { isActive: !form.isActive })
    setForms(prev => prev.map(f => f.id === form.id ? { ...f, isActive: !f.isActive } : f))
  }

  function copyLink(form: FormDefinition) {
    const url = `${window.location.origin}/forms/${form.publicToken}`
    navigator.clipboard.writeText(url)
    setCopied(form.id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">טפסים</h1>
          <p className="text-sm text-gray-500 mt-0.5">יצירה וניהול טפסים ציבוריים</p>
        </div>
        <Button
          size="sm"
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={handleCreate}
          loading={creating}
        >
          טופס חדש
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : forms.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
          <p className="text-sm">אין טפסים עדיין</p>
          <button onClick={handleCreate} className="text-blue-600 text-sm hover:underline mt-1">
            צור טופס ראשון
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {forms.map(form => (
            <div key={form.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <Link href={`/forms/${form.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                  {form.title}
                </Link>
                <p className="text-xs text-gray-400 mt-0.5">
                  {form.fields.length} שדות
                  {form.isActive ? ' · פעיל' : ' · לא פעיל'}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => toggleActive(form)}
                  title={form.isActive ? 'השבת' : 'הפעל'}
                  className="text-gray-400 hover:text-blue-600"
                >
                  {form.isActive
                    ? <ToggleRight className="w-5 h-5 text-blue-600" />
                    : <ToggleLeft className="w-5 h-5" />}
                </button>

                <button
                  onClick={() => copyLink(form)}
                  title="העתק קישור"
                  className="text-gray-400 hover:text-blue-600"
                >
                  <Copy className="w-4 h-4" />
                </button>
                {copied === form.id && (
                  <span className="text-xs text-green-600">הועתק!</span>
                )}

                <Link href={`/forms/${form.publicToken}`} target="_blank" title="פתח טופס">
                  <ExternalLink className="w-4 h-4 text-gray-400 hover:text-blue-600" />
                </Link>

                <Link href={`/forms/${form.id}`}>
                  <Button size="sm" variant="outline">עריכה</Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

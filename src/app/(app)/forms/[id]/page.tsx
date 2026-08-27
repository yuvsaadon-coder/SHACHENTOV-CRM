'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { getFormById, updateForm } from '@/lib/firestore'
import type { FormDefinition } from '@/types/crm'
import { FormBuilder } from '@/components/forms/FormBuilder'
import { Button } from '@/components/ui/Button'
import { ArrowRight, Copy, ExternalLink, ToggleLeft, ToggleRight, Save } from 'lucide-react'
import Link from 'next/link'
import { use } from 'react'

export default function FormEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [form, setForm] = useState<FormDefinition | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getFormById(id).then(f => { setForm(f); setLoading(false) })
  }, [id])

  const handleChange = useCallback((updated: FormDefinition) => {
    setForm(updated)
    setSaved(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSaving(true)
      await updateForm(updated.id, { title: updated.title, description: updated.description, fields: updated.fields })
      setSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }, 1200)
  }, [])

  async function toggleActive() {
    if (!form) return
    const updated = { ...form, isActive: !form.isActive }
    setForm(updated)
    await updateForm(form.id, { isActive: updated.isActive })
  }

  function copyLink() {
    if (!form) return
    navigator.clipboard.writeText(`${window.location.origin}/forms/${form.publicToken}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading || !form) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-gray-100 rounded" />
        <div className="h-[60vh] bg-gray-100 rounded-xl" />
      </div>
    )
  }

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/forms/${form.publicToken}`
    : `/forms/${form.publicToken}`

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/forms" className="hover:text-blue-600 flex items-center gap-1">
            <ArrowRight className="w-3.5 h-3.5" />
            טפסים
          </Link>
          <span>/</span>
          <span className="text-gray-800 font-medium truncate max-w-48">{form.title}</span>
        </div>

        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-gray-400">שומר...</span>}
          {saved && <span className="text-xs text-green-600">נשמר ✓</span>}

          <button
            onClick={toggleActive}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600"
            title={form.isActive ? 'השבת טופס' : 'הפעל טופס'}
          >
            {form.isActive ? (
              <><ToggleRight className="w-5 h-5 text-blue-600" /> <span className="text-xs text-blue-600">פעיל</span></>
            ) : (
              <><ToggleLeft className="w-5 h-5" /> <span className="text-xs">לא פעיל</span></>
            )}
          </button>

          <Button
            size="sm"
            variant="outline"
            icon={<Copy className="w-3.5 h-3.5" />}
            onClick={copyLink}
          >
            {copied ? 'הועתק!' : 'העתק קישור'}
          </Button>

          <Link href={`/forms/${form.publicToken}`} target="_blank">
            <Button size="sm" variant="outline" icon={<ExternalLink className="w-3.5 h-3.5" />}>
              תצוגה מקדימה
            </Button>
          </Link>
        </div>
      </div>

      {/* Builder */}
      <div className="flex-1 overflow-auto">
        <FormBuilder form={form} onChange={handleChange} />
      </div>
    </div>
  )
}

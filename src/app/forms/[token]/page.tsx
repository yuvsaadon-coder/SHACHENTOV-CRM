'use client'

import { useEffect, useState } from 'react'
import { getFormByToken } from '@/lib/firestore'
import type { FormDefinition } from '@/types/crm'
import { FormRenderer } from '@/components/forms/FormRenderer'
import { use } from 'react'

export default function PublicFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [form, setForm] = useState<FormDefinition | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getFormByToken(token).then(f => { setForm(f); setLoading(false) })
  }, [token])

  async function handleSubmit(responses: Record<string, string | string[]>) {
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/forms/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, responses }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message ?? 'אירעה שגיאה. נסה שוב.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-8 w-64 bg-gray-200 rounded mx-auto" />
            <div className="h-64 bg-white rounded-2xl" />
          </div>
        ) : !form ? (
          <div className="text-center py-20">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">הטופס אינו זמין</h2>
            <p className="text-sm text-gray-400">הטופס לא נמצא או שאינו פעיל.</p>
          </div>
        ) : submitted ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-200 shadow-sm">
            <div className="text-5xl mb-4">✓</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">הטופס נשלח בהצלחה!</h2>
            <p className="text-sm text-gray-500">
              {form.submitMessage ?? 'תודה על מילוי הטופס. תגובתך נרשמה.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{form.title}</h1>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
            <FormRenderer form={form} onSubmit={handleSubmit} submitting={submitting} />
          </div>
        )}

        {/* Branding footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          מובילות דיגיטליות · מערכת CRM
        </p>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import type { FormDefinition, FormField } from '@/types/crm'
import { cn } from '@/lib/utils'

interface FormRendererProps {
  form: FormDefinition
  onSubmit: (responses: Record<string, string | string[]>) => Promise<void>
  submitting?: boolean
}

function evaluateShowIf(
  field: FormField,
  responses: Record<string, string | string[]>
): boolean {
  if (!field.showIf) return true
  const { fieldId, operator, value } = field.showIf
  const current = responses[fieldId] ?? ''
  const strVal = Array.isArray(current) ? current.join(',') : current

  switch (operator) {
    case 'equals': return strVal === value
    case 'not_equals': return strVal !== value
    case 'contains': return strVal.includes(value ?? '')
    case 'is_empty': return strVal === ''
    case 'is_not_empty': return strVal !== ''
    default: return true
  }
}

export function FormRenderer({ form, onSubmit, submitting = false }: FormRendererProps) {
  const [responses, setResponses] = useState<Record<string, string | string[]>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const sortedFields = [...form.fields].sort((a, b) => a.order - b.order)
  const visibleFields = sortedFields.filter(f => evaluateShowIf(f, responses))

  function set(fieldId: string, value: string | string[]) {
    setResponses(r => ({ ...r, [fieldId]: value }))
    if (errors[fieldId]) setErrors(e => ({ ...e, [fieldId]: '' }))
  }

  function toggleMulti(fieldId: string, option: string) {
    const current = (responses[fieldId] as string[] | undefined) ?? []
    set(fieldId, current.includes(option) ? current.filter(x => x !== option) : [...current, option])
  }

  function validate() {
    const errs: Record<string, string> = {}
    visibleFields.forEach(field => {
      if (!field.required) return
      const val = responses[field.id]
      if (!val || (Array.isArray(val) && val.length === 0) || val === '') {
        errs[field.id] = 'שדה זה הינו חובה'
      }
    })
    return errs
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    await onSubmit(responses)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {form.description && (
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{form.description}</p>
      )}

      {visibleFields.map(field => (
        <FieldInput
          key={field.id}
          field={field}
          value={responses[field.id]}
          error={errors[field.id]}
          onChange={(v) => set(field.id, v)}
          onToggleMulti={(o) => toggleMulti(field.id, o)}
        />
      ))}

      <button
        type="submit"
        disabled={submitting}
        className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? (
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : null}
        {form.submitMessage ?? 'שליחה'}
      </button>
    </form>
  )
}

function FieldInput({
  field,
  value,
  error,
  onChange,
  onToggleMulti,
}: {
  field: FormField
  value?: string | string[]
  error?: string
  onChange: (v: string | string[]) => void
  onToggleMulti: (option: string) => void
}) {
  const labelEl = (
    <label className="text-sm font-medium text-gray-700">
      {field.label}
      {field.required && <span className="text-red-500 me-1">*</span>}
    </label>
  )

  const baseInputClass = cn(
    'w-full h-10 px-3 rounded-lg border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
    error ? 'border-red-400' : 'border-gray-300'
  )

  return (
    <div className="space-y-1.5">
      {labelEl}
      {field.helpText && <p className="text-xs text-gray-400">{field.helpText}</p>}

      {field.type === 'text' && (
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          className={baseInputClass}
        />
      )}

      {field.type === 'number' && (
        <input
          type="number"
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={baseInputClass}
        />
      )}

      {field.type === 'date' && (
        <input
          type="date"
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          className={baseInputClass}
        />
      )}

      {field.type === 'textarea' && (
        <textarea
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className={cn(
            'w-full px-3 py-2 rounded-lg border bg-white text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500',
            error ? 'border-red-400' : 'border-gray-300'
          )}
        />
      )}

      {field.type === 'dropdown' && (
        <select
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          className={baseInputClass}
        >
          <option value="">{field.placeholder ?? 'בחר...'}</option>
          {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}

      {field.type === 'single_choice' && (
        <div className="space-y-2">
          {field.options?.map(option => (
            <label key={option} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={field.id}
                value={option}
                checked={(value as string) === option}
                onChange={() => onChange(option)}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm text-gray-700">{option}</span>
            </label>
          ))}
        </div>
      )}

      {field.type === 'multi_choice' && (
        <div className="space-y-2">
          {field.options?.map(option => {
            const arr = (value as string[] | undefined) ?? []
            return (
              <label key={option} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={arr.includes(option)}
                  onChange={() => onToggleMulti(option)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm text-gray-700">{option}</span>
              </label>
            )
          })}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

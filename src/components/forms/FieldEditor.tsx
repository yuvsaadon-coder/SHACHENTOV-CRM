'use client'

import { useState } from 'react'
import type { FormField, FieldType, ConditionalRule } from '@/types/crm'
import { FIELD_TYPE_LABELS } from '@/types/crm'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FieldEditorProps {
  field: FormField
  allFields: FormField[] // for showIf field selector
  onChange: (updated: FormField) => void
  onDelete: () => void
}

const FIELD_TYPES: FieldType[] = [
  'text', 'textarea', 'single_choice', 'multi_choice', 'dropdown', 'date', 'number',
]

const OPERATORS: { value: ConditionalRule['operator']; label: string }[] = [
  { value: 'equals', label: 'שווה ל' },
  { value: 'not_equals', label: 'לא שווה ל' },
  { value: 'contains', label: 'מכיל' },
  { value: 'is_empty', label: 'ריק' },
  { value: 'is_not_empty', label: 'לא ריק' },
]

export function FieldEditor({ field, allFields, onChange, onDelete }: FieldEditorProps) {
  const [newOption, setNewOption] = useState('')
  const hasOptions = ['single_choice', 'multi_choice', 'dropdown'].includes(field.type)

  function update<K extends keyof FormField>(key: K, value: FormField[K]) {
    onChange({ ...field, [key]: value })
  }

  function addOption() {
    if (!newOption.trim()) return
    const options = [...(field.options ?? []), newOption.trim()]
    onChange({ ...field, options })
    setNewOption('')
  }

  function removeOption(i: number) {
    const options = (field.options ?? []).filter((_, idx) => idx !== i)
    onChange({ ...field, options })
  }

  return (
    <div className="space-y-4">
      {/* Type + Required */}
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="סוג שדה"
          value={field.type}
          onChange={e => update('type', e.target.value as FieldType)}
        >
          {FIELD_TYPES.map(t => (
            <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
          ))}
        </Select>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">חובה</label>
          <label className="flex items-center gap-2 h-9 cursor-pointer">
            <input
              type="checkbox"
              checked={field.required}
              onChange={e => update('required', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-600">שדה חובה</span>
          </label>
        </div>
      </div>

      <Input
        label="תווית"
        value={field.label}
        onChange={e => update('label', e.target.value)}
        placeholder="שאלה או תווית..."
      />

      <Input
        label="טקסט מקום (Placeholder)"
        value={field.placeholder ?? ''}
        onChange={e => update('placeholder', e.target.value)}
        placeholder="טקסט כרמז..."
      />

      <Input
        label="טקסט עזר"
        value={field.helpText ?? ''}
        onChange={e => update('helpText', e.target.value)}
        placeholder="הסבר קצר מתחת לשדה..."
      />

      {/* Options (for choice types) */}
      {hasOptions && (
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">אפשרויות</label>
          <div className="space-y-1.5 mb-2">
            {(field.options ?? []).map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-1 text-sm text-gray-700 bg-gray-50 rounded px-3 py-1.5">{opt}</span>
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="text-gray-300 hover:text-red-500 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newOption}
              onChange={e => setNewOption(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addOption())}
              placeholder="הוסף אפשרות..."
              className="flex-1 h-8 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button type="button" size="sm" variant="outline" onClick={addOption} icon={<Plus className="w-3.5 h-3.5" />}>
              הוסף
            </Button>
          </div>
        </div>
      )}

      {/* Conditional logic */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-2">הצג רק אם...</label>
        {field.showIf ? (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Select
                value={field.showIf.fieldId}
                onChange={e => update('showIf', { ...field.showIf!, fieldId: e.target.value })}
              >
                <option value="">בחר שדה...</option>
                {allFields
                  .filter(f => f.id !== field.id)
                  .map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </Select>
              <Select
                value={field.showIf.operator}
                onChange={e => update('showIf', { ...field.showIf!, operator: e.target.value as ConditionalRule['operator'] })}
              >
                {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
              </Select>
              {!['is_empty', 'is_not_empty'].includes(field.showIf.operator) && (
                <input
                  type="text"
                  value={field.showIf.value ?? ''}
                  onChange={e => update('showIf', { ...field.showIf!, value: e.target.value })}
                  placeholder="ערך..."
                  className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => update('showIf', undefined)}
              className="text-xs text-gray-400 hover:text-red-600"
            >
              הסר תנאי
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() =>
              update('showIf', {
                fieldId: allFields.filter(f => f.id !== field.id)[0]?.id ?? '',
                operator: 'equals',
                value: '',
              })
            }
            className="text-xs text-blue-600 hover:underline"
          >
            + הוסף תנאי הצגה
          </button>
        )}
      </div>

      {/* Delete */}
      <div className="pt-2 border-t border-gray-100">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          icon={<Trash2 className="w-3.5 h-3.5" />}
          onClick={onDelete}
        >
          מחיקת שדה
        </Button>
      </div>
    </div>
  )
}

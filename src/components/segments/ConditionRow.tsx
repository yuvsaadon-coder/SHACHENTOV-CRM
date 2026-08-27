'use client'

import type { SegmentCondition, ConditionOperator } from '@/types/crm'
import { SEGMENT_FIELDS } from '@/lib/taxonomy'
import { Select } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Trash2 } from 'lucide-react'

interface ConditionRowProps {
  condition: SegmentCondition
  onChange: (updated: SegmentCondition) => void
  onDelete: () => void
}

const OPERATORS: { value: ConditionOperator; label: string; noValue?: boolean }[] = [
  { value: 'equals', label: 'שווה ל' },
  { value: 'not_equals', label: 'שונה מ' },
  { value: 'contains', label: 'מכיל' },
  { value: 'in', label: 'אחד מ' },
  { value: 'not_in', label: 'לא אחד מ' },
  { value: 'greater_than', label: 'גדול מ' },
  { value: 'less_than', label: 'קטן מ' },
  { value: 'is_empty', label: 'ריק', noValue: true },
  { value: 'is_not_empty', label: 'לא ריק', noValue: true },
]

export function ConditionRow({ condition, onChange, onDelete }: ConditionRowProps) {
  const fieldDef = SEGMENT_FIELDS.find(f => f.key === condition.field)
  const opDef = OPERATORS.find(o => o.value === condition.operator)

  const availableOps = fieldDef?.type === 'number'
    ? OPERATORS
    : fieldDef?.type === 'boolean'
    ? [{ value: 'equals' as ConditionOperator, label: 'שווה ל' }]
    : OPERATORS.filter(o => !['greater_than', 'less_than'].includes(o.value))

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Field */}
      <Select
        value={condition.field}
        onChange={e => onChange({ ...condition, field: e.target.value, value: undefined })}
        className="h-8 text-xs min-w-36"
      >
        <option value="">בחר שדה...</option>
        {SEGMENT_FIELDS.map(f => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </Select>

      {/* Operator */}
      <Select
        value={condition.operator}
        onChange={e => onChange({ ...condition, operator: e.target.value as ConditionOperator })}
        className="h-8 text-xs min-w-28"
      >
        {availableOps.map(op => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </Select>

      {/* Value */}
      {!opDef?.noValue && fieldDef && (
        fieldDef.type === 'enum' ? (
          <Select
            value={(condition.value as string) ?? ''}
            onChange={e => onChange({ ...condition, value: e.target.value })}
            className="h-8 text-xs min-w-32"
          >
            <option value="">בחר...</option>
            {fieldDef.options?.map(o => <option key={o} value={o}>{o}</option>)}
          </Select>
        ) : fieldDef.type === 'enum_multi' ? (
          <div className="flex flex-wrap gap-1 max-w-64">
            {fieldDef.options?.map(option => {
              const selected = Array.isArray(condition.value)
                ? (condition.value as string[]).includes(option)
                : false
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    const arr = Array.isArray(condition.value) ? (condition.value as string[]) : []
                    onChange({
                      ...condition,
                      value: selected ? arr.filter(x => x !== option) : [...arr, option],
                    })
                  }}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    selected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {option}
                </button>
              )
            })}
          </div>
        ) : fieldDef.type === 'boolean' ? (
          <Select
            value={(condition.value as string) ?? ''}
            onChange={e => onChange({ ...condition, value: e.target.value })}
            className="h-8 text-xs min-w-24"
          >
            <option value="true">כן</option>
            <option value="false">לא</option>
          </Select>
        ) : (
          <input
            type={fieldDef.type === 'number' ? 'number' : 'text'}
            value={(condition.value as string) ?? ''}
            onChange={e => onChange({ ...condition, value: e.target.value })}
            placeholder="ערך..."
            className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-28"
          />
        )
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDelete}
        className="text-gray-300 hover:text-red-500 p-1"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
}

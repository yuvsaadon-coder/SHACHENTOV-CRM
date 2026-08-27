'use client'

import { useState, useCallback } from 'react'
import type { SegmentQuery, SegmentCondition } from '@/types/crm'
import { ConditionRow } from './ConditionRow'
import { Button } from '@/components/ui/Button'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SegmentBuilderProps {
  query: SegmentQuery
  onChange: (query: SegmentQuery) => void
  resultCount?: number
}

function generateId() {
  return Math.random().toString(36).slice(2, 9)
}

function emptyCondition(): SegmentCondition {
  return { id: generateId(), field: '', operator: 'equals', value: '' }
}

export function SegmentBuilder({ query, onChange, resultCount }: SegmentBuilderProps) {
  function addCondition() {
    onChange({ ...query, conditions: [...query.conditions, emptyCondition()] })
  }

  function updateCondition(id: string, updated: SegmentCondition) {
    onChange({
      ...query,
      conditions: query.conditions.map(c => c.id === id ? updated : c),
    })
  }

  function deleteCondition(id: string) {
    onChange({ ...query, conditions: query.conditions.filter(c => c.id !== id) })
  }

  return (
    <div className="space-y-4">
      {/* Root operator */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700">הצג פרופילים שעומדים</span>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          {(['AND', 'OR'] as const).map(op => (
            <button
              key={op}
              type="button"
              onClick={() => onChange({ ...query, logicalOperator: op })}
              className={cn(
                'px-3 py-1 text-xs font-medium transition-colors',
                query.logicalOperator === op
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              {op === 'AND' ? 'בכל התנאים' : 'באחד התנאים'}
            </button>
          ))}
        </div>
        {resultCount !== undefined && (
          <span className="text-sm text-gray-500">
            <span className="font-semibold text-gray-900">{resultCount}</span> פרופילים
          </span>
        )}
      </div>

      {/* Conditions */}
      <div className="space-y-2">
        {query.conditions.map((condition, i) => (
          <div key={condition.id} className="flex items-center gap-2">
            {i > 0 && (
              <span className="text-xs text-gray-400 w-12 flex-shrink-0 text-end">
                {query.logicalOperator === 'AND' ? 'וגם' : 'או'}
              </span>
            )}
            {i === 0 && <span className="w-12 flex-shrink-0" />}
            <div className="flex-1">
              <ConditionRow
                condition={condition}
                onChange={updated => updateCondition(condition.id, updated)}
                onDelete={() => deleteCondition(condition.id)}
              />
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        icon={<Plus className="w-3.5 h-3.5" />}
        onClick={addCondition}
      >
        הוסף תנאי
      </Button>
    </div>
  )
}

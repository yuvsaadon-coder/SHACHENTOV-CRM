'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { FormDefinition, FormField, FieldType } from '@/types/crm'
import { FIELD_TYPE_LABELS } from '@/types/crm'
import { FieldEditor } from './FieldEditor'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import {
  Plus,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Type,
  AlignLeft,
  CheckSquare,
  List,
  ChevronDown as DropdownIcon,
  Calendar,
  Hash,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const PALETTE: { type: FieldType; label: string; icon: React.ReactNode }[] = [
  { type: 'text', label: 'טקסט', icon: <Type className="w-4 h-4" /> },
  { type: 'textarea', label: 'פסקה', icon: <AlignLeft className="w-4 h-4" /> },
  { type: 'single_choice', label: 'בחירה יחידה', icon: <CheckSquare className="w-4 h-4" /> },
  { type: 'multi_choice', label: 'בחירה מרובה', icon: <List className="w-4 h-4" /> },
  { type: 'dropdown', label: 'רשימה', icon: <DropdownIcon className="w-4 h-4" /> },
  { type: 'date', label: 'תאריך', icon: <Calendar className="w-4 h-4" /> },
  { type: 'number', label: 'מספר', icon: <Hash className="w-4 h-4" /> },
]

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

interface FormBuilderProps {
  form: FormDefinition
  onChange: (form: FormDefinition) => void
}

export function FormBuilder({ form, onChange }: FormBuilderProps) {
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(
    form.fields[0]?.id ?? null
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const setField = useCallback(
    (updated: FormField) => {
      onChange({
        ...form,
        fields: form.fields.map(f => (f.id === updated.id ? updated : f)),
      })
    },
    [form, onChange]
  )

  function addField(type: FieldType) {
    const id = generateId()
    const newField: FormField = {
      id,
      type,
      label: FIELD_TYPE_LABELS[type],
      required: false,
      options: ['single_choice', 'multi_choice', 'dropdown'].includes(type) ? ['אפשרות 1'] : undefined,
      order: form.fields.length,
    }
    onChange({ ...form, fields: [...form.fields, newField] })
    setSelectedFieldId(id)
  }

  function deleteField(id: string) {
    const updated = form.fields
      .filter(f => f.id !== id)
      .map((f, i) => ({ ...f, order: i }))
    onChange({ ...form, fields: updated })
    setSelectedFieldId(updated[0]?.id ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = form.fields.findIndex(f => f.id === active.id)
    const newIndex = form.fields.findIndex(f => f.id === over.id)
    const reordered = arrayMove(form.fields, oldIndex, newIndex).map((f, i) => ({ ...f, order: i }))
    onChange({ ...form, fields: reordered })
  }

  const selectedField = form.fields.find(f => f.id === selectedFieldId) ?? null

  return (
    <div className="flex gap-4 h-full">
      {/* Left: field palette */}
      <div className="w-44 flex-shrink-0 space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">סוגי שדות</p>
        {PALETTE.map(p => (
          <button
            key={p.type}
            type="button"
            onClick={() => addField(p.type)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 text-start text-sm text-gray-700 transition-colors"
          >
            <span className="text-gray-400">{p.icon}</span>
            {p.label}
          </button>
        ))}
      </div>

      {/* Center: canvas */}
      <div className="flex-1 min-w-0">
        {/* Form title + description */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3 space-y-2">
          <Input
            value={form.title}
            onChange={e => onChange({ ...form, title: e.target.value })}
            placeholder="כותרת הטופס"
            className="text-lg font-semibold border-0 border-b border-gray-100 rounded-none px-0 focus:ring-0 focus:border-blue-400"
          />
          <Textarea
            value={form.description ?? ''}
            onChange={e => onChange({ ...form, description: e.target.value })}
            placeholder="תיאור הטופס (אופציונלי)..."
            rows={2}
            className="border-0 px-0 focus:ring-0 text-sm"
          />
        </div>

        {form.fields.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-10 text-center text-gray-400">
            <p className="text-sm">לחץ על סוג שדה בצד שמאל כדי להוסיף שדה</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={form.fields.map(f => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {[...form.fields]
                  .sort((a, b) => a.order - b.order)
                  .map(field => (
                    <SortableFieldRow
                      key={field.id}
                      field={field}
                      selected={field.id === selectedFieldId}
                      onSelect={() => setSelectedFieldId(field.id === selectedFieldId ? null : field.id)}
                    />
                  ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => addField('text')}
          className="mt-3 w-full"
        >
          שדה חדש
        </Button>
      </div>

      {/* Right: field editor */}
      <div className="w-72 flex-shrink-0">
        {selectedField ? (
          <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
              עריכת שדה
            </p>
            <FieldEditor
              field={selectedField}
              allFields={form.fields}
              onChange={setField}
              onDelete={() => deleteField(selectedField.id)}
            />
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-5 text-center text-xs text-gray-400">
            בחר שדה לעריכה
          </div>
        )}
      </div>
    </div>
  )
}

function SortableFieldRow({
  field,
  selected,
  onSelect,
}: {
  field: FormField
  selected: boolean
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={cn(
        'flex items-center gap-2 p-3 bg-white rounded-lg border cursor-default transition-colors',
        selected ? 'border-blue-400 shadow-sm' : 'border-gray-200 hover:border-gray-300'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <button onClick={onSelect} className="flex-1 text-start">
        <span className="text-sm font-medium text-gray-800">{field.label}</span>
        <span className="text-xs text-gray-400 me-2">{FIELD_TYPE_LABELS[field.type]}</span>
        {field.required && <span className="text-xs text-red-500">*</span>}
        {field.showIf && <span className="text-xs text-amber-500 me-2">מותנה</span>}
      </button>
      <button onClick={onSelect} className="text-gray-400">
        {selected ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
    </div>
  )
}

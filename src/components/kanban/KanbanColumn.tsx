import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { KanbanCard } from './KanbanCard'
import type { Task, TaskStatus } from '../../types'

const STATUS_COLORS: Record<TaskStatus, string> = {
  'בוצע': 'border-[#0A6B2E]',
  'בעבודה': 'border-[#189A9F]',
  'בהמתנה': 'border-[#FDC857]',
  'לא בוצע': 'border-gray-300',
  'אחר': 'border-purple-300',
}

export function KanbanColumn({ status, tasks }: { status: TaskStatus; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-2 w-56 shrink-0 rounded-xl border-t-4 bg-white p-3 shadow-sm transition-colors ${STATUS_COLORS[status]} ${isOver ? 'bg-brand-teal050' : ''}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-bold text-brand-navy">{status}</span>
        <span className="bg-gray-100 text-gray-600 text-xs w-5 h-5 rounded-full flex items-center justify-center">
          {tasks.length}
        </span>
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {tasks.map((t) => (
          <KanbanCard key={t.id} task={t} />
        ))}
      </SortableContext>
      {tasks.length === 0 && (
        <div className="text-xs text-gray-300 text-center py-4 border-2 border-dashed border-gray-100 rounded-lg">
          גרור לכאן
        </div>
      )}
    </div>
  )
}

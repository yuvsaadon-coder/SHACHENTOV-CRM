import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link } from 'react-router-dom'
import { DomainBadge } from '../ui/DomainBadge'
import type { Task } from '../../types'

export function KanbanCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white border border-gray-100 rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
    >
      <Link
        to={`/tasks/${task.id}`}
        className="block text-sm font-medium text-brand-navy hover:underline mb-2 leading-snug"
        onClick={(e) => e.stopPropagation()}
      >
        {task.title}
      </Link>
      <div className="flex items-center justify-between gap-1">
        <DomainBadge domain={task.domain} />
        {task.endDate && (
          <span className="text-xs text-gray-400">
            {task.endDate.toDate().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}
          </span>
        )}
      </div>
      {task.responsible && (
        <div className="text-xs text-gray-400 mt-1 truncate">{task.responsible}</div>
      )}
    </div>
  )
}

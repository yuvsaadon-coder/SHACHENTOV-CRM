import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link } from 'react-router-dom'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { DomainBadge } from '../ui/DomainBadge'
import { STATUS_LABELS, type Task, type TaskStatus } from '../../types'

const STATUS_STYLE: Record<TaskStatus, React.CSSProperties> = {
  'בוצע':    { backgroundColor: '#C6EFCE', color: '#0A6B2E' },
  'בעבודה':  { backgroundColor: '#189A9F', color: '#ffffff' },
  'בהמתנה':  { backgroundColor: '#FDC857', color: '#7A5A00' },
  'לא בוצע': { backgroundColor: '#F3F4F6', color: '#4B5563' },
  'אחר':     { backgroundColor: '#E4DFEC', color: '#5F497A' },
}

export function KanbanCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const stopDrag = (e: React.PointerEvent) => e.stopPropagation()

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
        onPointerDown={stopDrag}
      >
        {task.title}
        {!!task.attachmentCount && (
          <span className="mr-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full align-middle">
            📎 {task.attachmentCount}
          </span>
        )}
      </Link>
      <div className="flex items-center justify-between gap-1 mt-2">
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
      <div className="mt-2" onPointerDown={stopDrag}>
        <select
          value={task.status}
          onChange={(e) => void updateDoc(doc(db, 'tasks', task.id), { status: e.target.value as TaskStatus, updatedAt: serverTimestamp() })}
          onClick={(e) => e.stopPropagation()}
          style={STATUS_STYLE[task.status]}
          className="w-full text-xs font-medium px-2 py-1 rounded border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#189A9F]"
        >
          {STATUS_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </div>
  )
}

import { useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent
} from '@dnd-kit/core'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../context/AuthContext'
import { KanbanColumn } from './KanbanColumn'
import type { Task, TaskStatus } from '../../types'
import { STATUS_LABELS } from '../../types'

export function KanbanView({ tasks }: { tasks: Task[] }) {
  const { appUser } = useAuth()
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragStart = (e: DragStartEvent) => {
    const t = tasks.find((task) => task.id === e.active.id)
    if (t) setActiveTask(t)
  }

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveTask(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const newStatus = over.id as TaskStatus
    if (!STATUS_LABELS.includes(newStatus)) return
    const task = tasks.find((t) => t.id === active.id)
    if (!task || task.status === newStatus) return

    await updateDoc(doc(db, 'tasks', task.id), {
      status: newStatus, updatedAt: serverTimestamp(), updatedBy: appUser?.name,
    })
  }

  const byStatus = STATUS_LABELS.reduce((acc, s) => {
    acc[s] = tasks.filter((t) => t.status === s)
    return acc
  }, {} as Record<TaskStatus, Task[]>)

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
        {STATUS_LABELS.map((status) => (
          <KanbanColumn key={status} status={status} tasks={byStatus[status]} />
        ))}
      </div>
      <DragOverlay>
        {activeTask && (
          <div className="bg-white border border-brand-teal rounded-xl p-3 shadow-xl w-64">
            <p className="text-sm font-medium text-brand-navy">{activeTask.title}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

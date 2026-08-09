import type { TaskStatus } from '../../types'

const styles: Record<TaskStatus, string> = {
  'בוצע': 'bg-[#C6EFCE] text-[#0A6B2E]',
  'בעבודה': 'bg-[#189A9F] text-white',
  'בהמתנה': 'bg-[#FDC857] text-[#7A5A00]',
  'לא בוצע': 'bg-[#EEF2F2] text-[#8A9A9A]',
  'אחר': 'bg-[#E4DFEC] text-[#5F497A]',
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}

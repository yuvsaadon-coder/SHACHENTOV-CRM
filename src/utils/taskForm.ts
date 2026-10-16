import type { Task } from '../types'

export const NEW_TASK_DEFAULTS: Partial<Task> = {
  domain: 'CEO',
  status: 'לא בוצע',
  frequency: 'חד-פעמי',
  involved: [],
  contactRefs: [],
  steps: '',
  notes: '',
}

export function validateRequiredTaskFields(form: Partial<Task>): string | null {
  if (!form.title?.trim()) return 'נא למלא כותרת משימה'
  if (!form.domain) return 'נא לבחור תחום'
  if (!form.status) return 'נא לבחור סטטוס'
  if (!form.frequency) return 'נא לבחור תדירות'
  return null
}

export function withInlineStatus(
  form: Partial<Task>,
  status: Task['status'],
): Partial<Task> {
  return { ...form, status }
}

import { describe, expect, it } from 'vitest'
import {
  NEW_TASK_DEFAULTS,
  validateRequiredTaskFields,
  withInlineStatus,
} from '../utils/taskForm'

describe('task form state', () => {
  it('keeps an inline status update when an unrelated field is edited later', () => {
    const afterStatus = withInlineStatus({
      title: 'משימה',
      frequency: 'חודשי',
      status: 'לא בוצע',
      notes: '',
    }, 'בוצע')
    const afterNotes = { ...afterStatus, notes: 'הערה חדשה' }

    expect(afterNotes.status).toBe('בוצע')
  })

  it('initializes and accepts the untouched frequency default', () => {
    const form = { ...NEW_TASK_DEFAULTS, title: 'משימה חדשה' }

    expect(form.frequency).toBe('חד-פעמי')
    expect(validateRequiredTaskFields(form)).toBeNull()
  })

  it('rejects missing required values', () => {
    expect(validateRequiredTaskFields({ ...NEW_TASK_DEFAULTS })).toBe('נא למלא כותרת משימה')
    expect(validateRequiredTaskFields({
      ...NEW_TASK_DEFAULTS,
      title: 'משימה',
      frequency: undefined,
    })).toBe('נא לבחור תדירות')
  })
})

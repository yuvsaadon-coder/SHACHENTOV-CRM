import type { Task, OrgRole, Contact } from '../types'
import { DOMAIN_LABELS } from '../types'

function toCSV(rows: string[][]): string {
  return rows
    .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

function download(filename: string, content: string) {
  const BOM = '﻿'
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportTasks(tasks: Task[]) {
  const header = ['מזהה', 'כותרת', 'תחום', 'קטגוריה', 'סטטוס', 'מעורבים', 'תדירות', 'תאריך התחלה', 'תאריך סיום', 'נקודת ציון שנתית', 'מפעיל', 'הערות']
  const rows = tasks.map(t => [
    t.id,
    t.title,
    DOMAIN_LABELS[t.domain] ?? t.domain,
    t.category,
    t.status,
    (t.involved ?? []).join(' | '),
    t.frequency,
    t.startDate ? t.startDate.toDate().toLocaleDateString('he-IL') : '',
    t.endDate   ? t.endDate.toDate().toLocaleDateString('he-IL')   : '',
    t.holidayAnchor ?? '',
    t.activator ?? '',
    t.notes ?? '',
  ])
  const today = new Date().toISOString().slice(0, 10)
  download(`tasks_${today}.csv`, toCSV([header, ...rows]))
}

export function exportRoles(roles: OrgRole[]) {
  const header = ['תפקיד', 'ממלא תפקיד', 'רמה', 'אזור', 'סטטוס', 'עדיפות', 'טלפון', 'אימייל', 'מואצל ל', 'הערות']
  const rows = roles.map(r => [
    r.roleName,
    r.holderName,
    r.level,
    r.area,
    r.status,
    r.priority,
    r.phone,
    r.email,
    r.delegatedTo ?? '',
    r.notes,
  ])
  const today = new Date().toISOString().slice(0, 10)
  download(`roles_${today}.csv`, toCSV([header, ...rows]))
}

export function exportContacts(contacts: Contact[]) {
  const header = ['שם', 'סוג', 'תחומים', 'טלפון', 'אימייל', 'הערות']
  const rows = contacts.map(c => [
    c.name,
    c.type,
    (c.domainTags ?? []).join(' | '),
    c.phone,
    c.email,
    c.notes,
  ])
  const today = new Date().toISOString().slice(0, 10)
  download(`contacts_${today}.csv`, toCSV([header, ...rows]))
}

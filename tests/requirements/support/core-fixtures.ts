// Shared synthetic fixtures for components/core and emulator/core tests —
// see TEST-PLAN.md §5. Hand-authored fixture facts only; never call a
// production filter/aggregation/cycle function to compute its own expected
// result here.

import { makeTimestamp } from './core-firestore-mock'

export const FROZEN_NOW = new Date('2026-09-06T12:00:00')

export const IDENTITIES = {
  adminA: { uid: 'admin-a', name: 'מנהל בדיקה', email: 'admin-a@example.test', role: 'admin', active: true },
  hqCeo: { uid: 'hq-ceo', name: 'רכז בדיקה מנכל', email: 'hq-ceo@example.test', role: 'CEO', active: true },
  hqJlm: { uid: 'hq-jlm', name: 'רכז בדיקה ירושלים', email: 'hq-jlm@example.test', role: 'JLM', active: true },
  hqSup: { uid: 'hq-sup', name: 'רכז בדיקה ספקים', email: 'hq-sup@example.test', role: 'SUP', active: true },
  hqFin: { uid: 'hq-fin', name: 'רכז בדיקה א', email: 'hq-fin@example.test', role: 'FIN', active: true, phone: '0500000001' },
  hqDon: { uid: 'hq-don', name: 'רכז בדיקה תרומות', email: 'hq-don@example.test', role: 'DON', active: true },
  hqDes: { uid: 'hq-des', name: 'רכז בדיקה עיצוב', email: 'hq-des@example.test', role: 'DES', active: true },
  hqPub: { uid: 'hq-pub', name: 'רכז בדיקה פרסום', email: 'hq-pub@example.test', role: 'PUB', active: true },
  hqVol: { uid: 'hq-vol', name: 'רכז בדיקה מתנדבים', email: 'hq-vol@example.test', role: 'VOL', active: true },
  coordA: { uid: 'coord-a', name: 'רכז סניף א', email: 'coord-a@example.test', role: 'coordinator', active: true, branchId: 'branch-a' },
  coordB: { uid: 'coord-b', name: 'רכז סניף ב', email: 'coord-b@example.test', role: 'coordinator', active: true, branchId: 'branch-b' },
  profileMissing: { uid: 'profile-missing' },
  roleMissing: { uid: 'role-missing', name: 'ללא תפקיד', email: 'role-missing@example.test', active: true },
  roleUnknown: { uid: 'role-unknown', name: 'תפקיד לא ידוע', email: 'role-unknown@example.test', role: 'invented-role', active: true },
  hqFinInactive: { uid: 'hq-fin-inactive', name: 'רכז בדיקה לא פעיל', email: 'hq-fin-inactive@example.test', role: 'FIN', active: false },
} as const

export const BRANCHES = {
  a: { id: 'branch-a', name: 'סניף בדיקה א', type: 'food' as const, city: 'ירושלים', coordinatorUids: ['coord-a'], coordinatorNames: ['רכז סניף א'] },
  b: { id: 'branch-b', name: 'סניף בדיקה ב', type: 'food' as const, city: 'עיר בדיקה', coordinatorUids: ['coord-b'], coordinatorNames: ['רכז סניף ב'] },
  c: { id: 'branch-c', name: 'קפה נוער בדיקה', type: 'cafe_youth' as const, city: 'ירושלים', coordinatorUids: ['coord-a'], coordinatorNames: ['רכז סניף א'] },
  d: { id: 'branch-d', name: 'סניף בדיקה ד (ללא דיווחים)', type: 'food' as const, city: 'עיר בדיקה', coordinatorUids: [] as string[], coordinatorNames: [] as string[] },
}

export const TASKS = {
  fin: {
    id: 'task-fin',
    domain: 'FIN' as const,
    category: 'תקציב',
    title: 'משימת בדיקה כספים',
    steps: '',
    frequency: 'חד-פעמי' as const,
    startDate: makeTimestamp(new Date('2026-09-01')),
    endDate: makeTimestamp(new Date('2026-09-10')),
    holidayAnchor: null,
    involved: ['צוות בדיקה'],
    activator: null,
    contactRefs: ['contact-supplier'],
    status: 'בעבודה' as const,
    notes: '',
    createdAt: makeTimestamp(new Date('2026-08-20')),
    updatedAt: makeTimestamp(new Date('2026-08-20')),
    createdBy: 'admin-a',
    updatedBy: 'admin-a',
  },
  done: {
    id: 'task-done',
    domain: 'VOL' as const,
    category: 'מתנדבים',
    title: 'משימת בדיקה שהושלמה',
    steps: '',
    frequency: 'חד-פעמי' as const,
    startDate: makeTimestamp(new Date('2026-07-01')),
    endDate: makeTimestamp(new Date('2026-07-05')),
    holidayAnchor: null,
    involved: [],
    activator: null,
    contactRefs: [],
    status: 'בוצע' as const,
    notes: '',
    createdAt: makeTimestamp(new Date('2026-06-20')),
    updatedAt: makeTimestamp(new Date('2026-07-05')),
    createdBy: 'admin-a',
    updatedBy: 'admin-a',
  },
  overdue: {
    id: 'task-overdue',
    domain: 'SUP' as const,
    category: 'ספקים',
    title: 'משימת בדיקה באיחור',
    steps: '',
    frequency: 'חד-פעמי' as const,
    startDate: makeTimestamp(new Date('2026-09-01')),
    endDate: makeTimestamp(new Date('2026-09-05')),
    holidayAnchor: null,
    involved: [],
    activator: null,
    contactRefs: [],
    status: 'בהמתנה' as const,
    notes: '',
    createdAt: makeTimestamp(new Date('2026-08-25')),
    updatedAt: makeTimestamp(new Date('2026-08-25')),
    createdBy: 'admin-a',
    updatedBy: 'admin-a',
  },
}

export const REPORTS = {
  aQ3_2026: {
    id: 'report-a-q3-2026',
    branchId: 'branch-a',
    branchType: 'food' as const,
    quarter: 'Q3' as const,
    year: 2026,
    submittedAt: makeTimestamp(new Date('2026-08-15')),
    submittedBy: 'coord-a',
    isFirstReport: false,
    data: { challenge: 'נדרשים מתנדבי בדיקה', baskets: '0', supplier: { rating: '4', notes: 'הערת בדיקה' } },
  },
  aQ3_2025: {
    id: 'report-a-q3-2025',
    branchId: 'branch-a',
    branchType: 'food' as const,
    quarter: 'Q3' as const,
    year: 2025,
    submittedAt: makeTimestamp(new Date('2025-08-15')),
    submittedBy: 'coord-a',
    isFirstReport: true,
    data: { challenge: 'אתגר משנה קודמת' },
  },
  bQ2_2026: {
    id: 'report-b-q2-2026',
    branchId: 'branch-b',
    branchType: 'food' as const,
    quarter: 'Q2' as const,
    year: 2026,
    submittedAt: makeTimestamp(new Date('2026-05-15')),
    submittedBy: 'coord-b',
    isFirstReport: false,
    data: { challenge: 'אתגר סניף ב' },
  },
}

export function withId<T extends { id: string }>(fixture: T) {
  return { ...fixture, id: fixture.id }
}

/** Firestore document-snapshot shape used by firestoreMock.emitQuery/emitDoc consumers. */
export function docSnap(fixture: { id: string; [k: string]: unknown }) {
  const { id, ...data } = fixture
  return { id, data }
}

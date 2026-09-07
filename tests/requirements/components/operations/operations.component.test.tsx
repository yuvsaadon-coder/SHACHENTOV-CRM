import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'

import { ContactsPage } from '../../../../src/pages/ContactsPage'
import { RolesPage } from '../../../../src/pages/RolesPage'
import { DashboardPage } from '../../../../src/pages/DashboardPage'
import { OrgChartPage } from '../../../../src/pages/OrgChartPage'
import { OrgChartView } from '../../../../src/components/orgchart/OrgChartView'
import { BranchDetailsPanel } from '../../../../src/components/orgchart/BranchDetailsPanel'
import { HierarchySetupPage } from '../../../../src/pages/HierarchySetupPage'
import { BranchesPage } from '../../../../src/pages/BranchesPage'
import { CoordinatorPortal } from '../../../../src/pages/portal/CoordinatorPortal'
import { PortalReport } from '../../../../src/pages/portal/PortalReport'
import { PortalHome } from '../../../../src/pages/portal/PortalHome'
import { ReportsPage } from '../../../../src/pages/ReportsPage'
import { ReportQuestionsAdminPage } from '../../../../src/pages/admin/ReportQuestionsAdminPage'

const s = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())
  return {
    listeners, notify, del: Symbol('deleteField'),
    ts: (iso = '2026-09-07T00:00:00Z') => ({ toDate: () => new Date(iso) }),
    contacts: [] as any[], tasks: [] as any[], roles: [] as any[], branches: [] as any[], reports: [] as any[], questions: [] as any[],
    reportsLoading: false,
    failContactUpdateOnce: false,
    failContactDeleteOnce: false,
    auth: { appUser: { uid: 'admin', name: 'Admin', role: 'admin', active: true }, logOut: vi.fn(async () => undefined), loading: false },
    toast: vi.fn(), addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), batchCommit: vi.fn(), blobs: [] as Blob[],
  }
})

function tick() {
  const [, setN] = React.useState(0)
  React.useEffect(() => { const l = () => setN((n) => n + 1); s.listeners.add(l); return () => { s.listeners.delete(l) } }, [])
}
const arr = (c: string) => c === 'contacts' ? s.contacts : c === 'tasks' ? s.tasks : c === 'roles' ? s.roles : c === 'branches' ? s.branches : c === 'quarterlyReports' ? s.reports : s.questions
async function add(c: string, data: any) { const a = arr(c); const d = { id: `${c}-${a.length + 1}`, ...data }; a.push(d); s.notify(); return { id: d.id } }
async function upd(c: string, id: string, data: any) {
  const d = arr(c).find((x: any) => x.id === id)
  if (d) for (const [k, v] of Object.entries(data)) {
    if (v === s.del) delete d[k]
    else d[k] = v
  }
  s.notify()
}
async function del(c: string, id: string) { const a = arr(c); const i = a.findIndex((x: any) => x.id === id); if (i >= 0) a.splice(i, 1); s.notify() }

vi.mock('../../../../src/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('../../../../src/context/AuthContext', () => ({ useAuth: () => s.auth }))
vi.mock('../../../../src/context/ToastContext', () => ({ useToast: () => ({ toast: s.toast }) }))
vi.mock('../../../../src/hooks/useContacts', () => ({ useContacts: () => { tick(); return { contacts: s.contacts, loading: false, addContact: (d: any) => add('contacts', d), updateContact: (id: string, d: any) => s.failContactUpdateOnce ? (s.failContactUpdateOnce = false, Promise.reject(new Error('synthetic update failure'))) : upd('contacts', id, d), deleteContact: (id: string) => s.failContactDeleteOnce ? (s.failContactDeleteOnce = false, Promise.reject(new Error('synthetic delete failure'))) : del('contacts', id) } } }))
vi.mock('../../../../src/hooks/useTasks', () => ({ useTasks: () => { tick(); return { tasks: s.tasks, loading: false } } }))
vi.mock('../../../../src/hooks/useRoles', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/hooks/useRoles')>('../../../../src/hooks/useRoles')
  return { useRoles: () => { tick(); return { roles: s.roles, loading: false, error: null } }, applyDelegation: actual.applyDelegation }
})
vi.mock('../../../../src/hooks/useBranch', () => ({ useBranch: () => { tick(); return { branches: s.branches.filter((b) => b.coordinatorUids?.includes(s.auth.appUser?.uid)), loading: false } }, useAllBranches: () => { tick(); return { branches: s.branches, loading: false } } }))
vi.mock('../../../../src/hooks/useQuarterlyReports', () => ({ useQuarterlyReports: (bid: string | null) => { tick(); return { reports: bid ? s.reports.filter((r) => r.branchId === bid) : [], loading: s.reportsLoading } } }))
vi.mock('../../../../src/hooks/useAllQuarterlyReports', () => ({ useAllQuarterlyReports: () => { tick(); return { reports: s.reports, loading: false, error: null } } }))
vi.mock('../../../../src/hooks/useReportQuestions', () => ({
  useReportQuestions: (t: string) => { tick(); return { questions: s.questions.filter((q) => q.branchType === t).sort((a, b) => a.order - b.order), loading: false, error: null } },
  useAllReportQuestions: () => { tick(); return { questions: s.questions, labelByKey: Object.fromEntries(s.questions.map((q) => [q.key, q.label])), loading: false } },
  useReportQuestionAdmin: () => ({ create: (d: any) => add('reportQuestions', d), update: (id: string, d: any) => upd('reportQuestions', id, d), remove: (id: string) => del('reportQuestions', id), reorder: (id: string, order: number) => upd('reportQuestions', id, { order }) }),
}))
vi.mock('firebase/firestore', () => ({
  collection: (_: unknown, collection: string) => ({ collection }), doc: (_: unknown, collection: string, id: string) => ({ collection, id }),
  query: (ref: any) => ref,
  where: () => ({}),
  serverTimestamp: () => s.ts(), deleteField: () => s.del,
  addDoc: s.addDoc.mockImplementation((r: any, d: any) => add(r.collection, d)),
  updateDoc: s.updateDoc.mockImplementation((r: any, d: any) => upd(r.collection, r.id, d)),
  deleteDoc: s.deleteDoc.mockImplementation((r: any) => del(r.collection, r.id)),
  getDocs: vi.fn(async () => ({ docs: s.roles.map((r) => ({ id: r.id, data: () => ({ ...r }) })) })),
  writeBatch: vi.fn(() => { const ops: any[] = []; return { update: (ref: any, data: any) => ops.push({ ref, data }), commit: s.batchCommit.mockImplementation(async () => { for (const o of ops) await upd(o.ref.collection, o.ref.id, o.data) }) } }),
}))

const c = (id: string, x: any = {}) => ({ id, name: x.name ?? id, type: x.type ?? 'מטה', domainTags: x.domainTags ?? [], phone: x.phone ?? '', email: x.email ?? '', notes: x.notes ?? '', ...x })
const t = (id: string, x: any = {}) => ({ id, title: x.title ?? id, domain: 'FIN', category: '', steps: '', frequency: 'שוטף', startDate: null, endDate: null, holidayAnchor: null, involved: [], activator: null, contactRefs: [], status: 'לא בוצע', notes: '', createdAt: s.ts(), updatedAt: s.ts(), createdBy: 'seed', updatedBy: 'seed', ...x })
const r = (id: string, x: any = {}) => ({ id, roleName: x.roleName ?? id, level: x.level ?? 'מטה', area: x.area ?? '', holderName: x.holderName ?? '', status: x.status ?? 'מאויש', priority: x.priority ?? 'רגיל', email: '', phone: '', linkedTaskIds: [], affectsTasks: false, delegatedTo: x.delegatedTo ?? null, notes: '', ...x })
const b = (id: string, x: any = {}) => ({ id, name: x.name ?? id, type: x.type ?? 'food', city: x.city ?? 'ירושלים', coordinatorUids: x.coordinatorUids ?? [], createdAt: s.ts(), ...x })
const q = (id: string, x: any = {}) => ({ id, branchType: x.branchType ?? 'food', key: x.key ?? id, label: x.label ?? id, section: x.section ?? 'כללי', type: x.type ?? 'text', firstReportOnly: x.firstReportOnly ?? false, order: x.order ?? 1, options: x.options, ...x })
const rep = (id: string, x: any = {}) => ({ id, branchId: x.branchId ?? 'A', branchType: x.branchType ?? 'food', quarter: x.quarter ?? 'Q3', year: x.year ?? 2026, submittedAt: s.ts(), submittedBy: x.submittedBy ?? 'coord-a', isFirstReport: x.isFirstReport ?? false, data: x.data ?? {}, ...x })
const rr = (ui: React.ReactElement, path = '/') => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)
const portal = (ui: React.ReactElement, branch = b('A')) => rr(<Routes><Route element={<Outlet context={{ branch }} />}><Route path="/" element={ui} /></Route></Routes>)
const lastBlob = async () => (s.blobs.at(-1) as Blob).text()
const ctl = (label: string, root: HTMLElement = document.body) => {
  const labelNode = within(root).getByText(label)
  const control = labelNode.parentElement?.querySelector('input,select,textarea') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
  if (!control) throw new Error(`No control next to ${label}`)
  return control
}

beforeEach(() => {
  s.contacts = []; s.tasks = []; s.roles = []; s.branches = []; s.reports = []; s.questions = []; s.reportsLoading = false; s.failContactUpdateOnce = false; s.failContactDeleteOnce = false
  s.auth.appUser = { uid: 'admin', name: 'Admin', role: 'admin', active: true }
  s.toast.mockClear(); s.addDoc.mockClear(); s.updateDoc.mockClear(); s.deleteDoc.mockClear(); s.batchCommit.mockClear(); s.blobs = []
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { s.blobs.push(blob as Blob); return 'blob:ops' })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
})

describe('operations requirement tests', () => {
  it('TEST-C01.contact-crud-filter-realtime [A]', async () => {
    s.contacts = [c('hq', { name: 'מטה קשר', type: 'מטה' }), c('donor', { name: 'תורם קשר', type: 'תורם' })]
    const u = userEvent.setup(); const first = rr(<ContactsPage />)
    await u.click(screen.getByRole('button', { name: /הוסף איש קשר/ }))
    const addModal = screen.getByText('איש קשר חדש').closest('[dir="rtl"]') as HTMLElement
    fireEvent.change(ctl('שם *', addModal), { target: { value: 'ספק בדיקה' } }); fireEvent.change(ctl('סוג', addModal), { target: { value: 'ספק' } }); fireEvent.change(ctl('טלפון', addModal), { target: { value: '050' } }); fireEvent.change(ctl('אימייל', addModal), { target: { value: 's@example.test' } }); fireEvent.change(ctl('ארגון / חברה', addModal), { target: { value: 'חברה' } }); fireEvent.click(within(addModal).getByRole('button', { name: 'כספים' }))
    fireEvent.click(within(addModal).getByRole('button', { name: 'הוסף' })); await waitFor(() => expect(s.contacts.some((x) => x.name === 'ספק בדיקה')).toBe(true))
    expect(s.contacts.find((x) => x.name === 'ספק בדיקה')).toMatchObject({ phone: '050', email: 's@example.test', domainTags: ['FIN'] })
    first.unmount(); rr(<ContactsPage />); expect(screen.getByText('ספק בדיקה')).toBeInTheDocument()
    await u.selectOptions(screen.getByDisplayValue('כל הסוגים'), 'ספק'); expect(screen.queryByText('תורם קשר')).not.toBeInTheDocument()
    await u.clear(screen.getByPlaceholderText(/חיפוש/)); await u.type(screen.getByPlaceholderText(/חיפוש/), 'ספק בדיקה'); expect(screen.getByText('ספק בדיקה')).toBeInTheDocument()
    await u.clear(screen.getByPlaceholderText(/חיפוש/)); await u.type(screen.getByPlaceholderText(/חיפוש/), 'חברה'); expect(screen.getByText('ספק בדיקה')).toBeInTheDocument()
    act(() => { s.contacts = [...s.contacts, c('live', { name: 'ספק חי', type: 'ספק', organization: 'חברה' })]; s.notify() }); expect(await screen.findByText('ספק חי')).toBeInTheDocument()
    await u.click(screen.getAllByTitle('עריכה')[0]); { const editModal = screen.getByText('עריכת איש קשר').closest('[dir="rtl"]') as HTMLElement; fireEvent.change(ctl('טלפון', editModal), { target: { value: '052' } }); await u.click(within(editModal).getByRole('button', { name: 'שמור' })) } await waitFor(() => expect(s.contacts.find((x) => x.name === 'ספק בדיקה')?.phone).toBe('052'))
    await u.click(screen.getAllByTitle('עריכה')[0]); await u.click(screen.getByRole('button', { name: 'מחק' })); await u.click(screen.getByRole('button', { name: 'ביטול' })); expect(screen.getByText('ספק בדיקה')).toBeInTheDocument()
    await u.click(screen.getAllByTitle('עריכה')[0]); await u.click(screen.getByRole('button', { name: 'מחק' })); await u.click(screen.getByRole('button', { name: 'אשר מחיקה' })); await waitFor(() => expect(s.contacts.some((x) => x.name === 'ספק בדיקה')).toBe(false))
  })

  it('TEST-C02.domain-default-and-department-filter [G]', () => {
    s.auth.appUser = { uid: 'fin', name: 'FIN', role: 'FIN', active: true }; s.contacts = [c('fin', { name: 'איש כספים', domainTags: ['FIN'] }), c('vol', { name: 'איש מתנדבים', domainTags: ['VOL'] })]
    rr(<ContactsPage />); expect(screen.getByText('איש כספים')).toBeInTheDocument(); expect(screen.queryByText('איש מתנדבים')).not.toBeInTheDocument(); expect(screen.getByRole('combobox', { name: /מחלקה|תחום/ })).toBeInTheDocument()
  })

  it('TEST-C03.complete-record-links [A]', async () => {
    s.contacts = [c('cx', { name: 'איש קישור' })]; s.tasks = [t('a', { title: 'לפי מזהה', contactRefs: ['cx'] }), t('b', { title: 'לפי מפעיל', activator: 'איש קישור' }), t('z', { title: 'זר', contactRefs: ['z'] })]
    rr(<ContactsPage />); fireEvent.click(screen.getByText('איש קישור')); expect(screen.getByText(/משימות מקושרות \(2\)/)).toBeInTheDocument(); expect(screen.getByText('לפי מזהה')).toBeInTheDocument(); expect(screen.getByText('לפי מפעיל')).toBeInTheDocument(); expect(screen.queryByText('זר')).not.toBeInTheDocument()
  })
  it('TEST-C03.csv-roundtrip [A]', async () => {
    s.contacts = [c('csv', { name: 'ספק "בדיקה", ירושלים', type: 'ספק', domainTags: ['FIN'], notes: 'א\nב' }), c('o', { name: 'תורם אחר', type: 'תורם' })]
    rr(<ContactsPage />); fireEvent.change(screen.getByDisplayValue('כל הסוגים'), { target: { value: 'ספק' } }); fireEvent.click(screen.getByRole('button', { name: 'ייצוא CSV' }))
    const csv = await lastBlob(); expect(csv).toContain('"ספק ""בדיקה"", ירושלים"'); expect(csv).toContain('"א\nב"'); expect(csv).not.toContain('תורם אחר')
  })
  it('TEST-C03.production-sparse-task [G]', () => {
    s.contacts = [c('cx', { name: 'איש דליל' })]; s.tasks = [t('sparse', { contactRefs: undefined })]
    rr(<ContactsPage />); expect(() => fireEvent.click(screen.getByText('איש דליל'))).not.toThrow()
  })

  it('TEST-O01.role-crud-clear-delete [A]', async () => {
    s.branches = [b('A', { name: 'סניף א' })]; s.roles = [r('p', { roleName: 'אב' }), r('e', { roleName: 'תפקיד', status: 'חסר', reportsTo: 'p', portalBranchId: 'A' })]
    const u = userEvent.setup(); rr(<RolesPage />); await u.click(screen.getAllByTitle('עריכה').at(-1)!)
    const roleModal = screen.getByText('עריכת תפקיד').closest('[dir="rtl"]') as HTMLElement
    fireEvent.change(ctl('ממלא תפקיד', roleModal), { target: { value: 'מחזיק חדש' } }); await u.selectOptions(ctl('עדיפות', roleModal), 'דחוף'); await u.selectOptions(ctl('סטטוס גיוס', roleModal), 'לגיוס - קריטי'); fireEvent.change(ctl('טלפון', roleModal), { target: { value: '050-1' } }); fireEvent.change(ctl('אימייל', roleModal), { target: { value: 'role@example.test' } })
    await u.selectOptions(ctl('כפוף ל-', roleModal), ''); await u.selectOptions(ctl('סניף פורטל מקושר', roleModal), ''); await u.clear(ctl('מואצל ל-', roleModal)); await u.type(ctl('מואצל ל-', roleModal), 'מחליף'); await u.click(within(roleModal).getByRole('button', { name: 'שמור' }))
    await waitFor(() => expect(s.roles.find((x) => x.id === 'e')).toMatchObject({ delegatedTo: 'מחליף', holderName: 'מחזיק חדש', priority: 'דחוף', recruitmentUrgency: 'לגיוס - קריטי', phone: '050-1', email: 'role@example.test' })); expect(s.roles.find((x) => x.id === 'e')).not.toHaveProperty('reportsTo'); expect(s.roles.find((x) => x.id === 'e')).not.toHaveProperty('portalBranchId')
    await u.click(screen.getAllByTitle('עריכה').at(-1)!); await u.click(screen.getByRole('button', { name: 'מחק תפקיד' })); await u.click(screen.getByRole('button', { name: 'אשר מחיקה' })); await waitFor(() => expect(s.roles.some((x) => x.id === 'e')).toBe(false))
  })
  it('TEST-O02.current-delegation-display [C]', () => {
    s.roles = [r('hq', { roleName: 'מטה חסר', status: 'חסר' }), r('br', { roleName: 'סניף חסר', level: 'סניף חוץ', status: 'חסר' }), r('ex', { roleName: 'מפורש', status: 'חסר', delegatedTo: 'מחליף מפורש' })]
    const { unmount } = rr(<RolesPage />); expect(screen.getByText('מואצל: מנכ"ל (יובל)')).toBeInTheDocument(); expect(screen.getByText('מואצל: מחליף מפורש')).toBeInTheDocument(); expect(s.roles[0].delegatedTo).toBeNull(); unmount()
    rr(<DashboardPage />); fireEvent.click(screen.getByRole('button', { name: /תפקידים הדורשים טיפול/ })); expect(screen.getByText('מואצל: מנכ"ל (יובל)')).toBeInTheDocument()
  })
  it('TEST-O03.status-area-dashboard [A]', async () => {
    s.tasks = [t('t1', { title: 'משימת גיוס' })]; s.roles = [r('r1', { roleName: 'אריזה', area: 'צפון', status: 'חסר', linkedTaskIds: ['t1'], affectsTasks: true, recruitmentUrgency: 'לגיוס - דחוף' }), r('r2', { roleName: 'חלוקה', area: 'דרום', status: 'בסיכון' })]
    const { unmount } = rr(<RolesPage />); expect(screen.getByText('משימת גיוס')).toBeInTheDocument(); fireEvent.change(screen.getByDisplayValue('חסר'), { target: { value: 'חלקי' } }); await waitFor(() => expect(s.roles[0].status).toBe('חלקי')); unmount()
    rr(<DashboardPage />); fireEvent.click(screen.getByRole('button', { name: /תפקידים הדורשים טיפול/ })); expect(screen.getByRole('button', { name: /חלקי \(1\)/ })).toBeInTheDocument(); expect(screen.getByRole('button', { name: /בסיכון \(1\)/ })).toBeInTheDocument(); expect(screen.getByText('אריזה')).toBeInTheDocument(); expect(screen.getByText('חלוקה')).toBeInTheDocument(); expect(screen.getByText('חלקי')).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: /צפון/ })); expect(screen.getByText('אריזה')).toBeInTheDocument(); expect(screen.queryByText('חלוקה')).not.toBeInTheDocument()
  })

  it('TEST-O04.keyboard-drilldown [A]', async () => {
    s.roles = [r('root', { roleName: 'מנכ"ל', level: 'ועד מנהל' }), r('hq', { roleName: 'רכז ירושלים', reportsTo: 'root' }), r('br', { roleName: 'סניף קרית יובל', level: 'סניף ירושלים', reportsTo: 'hq', portalBranchId: 'A' })]
    const u = userEvent.setup(); rr(<OrgChartPage />); const expand = await screen.findByRole('button', { name: /הרחב רכז ירושלים/ }); expand.focus(); await u.keyboard('{Enter}'); const card = screen.getByRole('button', { name: /פרטי סניף: סניף קרית יובל/ }); card.focus(); await u.keyboard('{Enter}'); expect(await screen.findByText('פרטי סניף')).toBeInTheDocument(); expect(screen.getByText('פרטי פעילות')).toBeInTheDocument(); expect(screen.getByRole('button', { name: /דיווחים רבעוניים/ })).toBeInTheDocument()
  })
  it('TEST-O04.volunteer-roundtrip [A]', async () => {
    s.roles = [r('br', { roleName: 'סניף תפעול', level: 'סניף חוץ', portalBranchId: 'A', volunteerInfo: {} })]
    const u = userEvent.setup(); const { rerender } = render(<BranchDetailsPanel role={s.roles[0]} branchId="A" onClose={vi.fn()} onEditRole={vi.fn()} />)
    await u.click(screen.getAllByRole('button', { name: 'חוסר קריטי' })[0]); await u.type(ctl('כתובת סניף'), 'רחוב 7'); await u.selectOptions(ctl('תדירות חלוקה'), 'שבועי'); await u.click(screen.getByRole('button', { name: 'שמור שינויים' }))
    await waitFor(() => expect(s.roles[0].volunteerInfo).toMatchObject({ packagingStatus: 'חוסר קריטי', address: 'רחוב 7', distributionFrequency: 'שבועי' })); rerender(<></>); render(<BranchDetailsPanel role={s.roles[0]} branchId="A" onClose={vi.fn()} onEditRole={vi.fn()} />); expect(screen.getByDisplayValue('רחוב 7')).toBeInTheDocument(); expect(screen.getByDisplayValue('שבועי')).toBeInTheDocument(); expect(screen.getAllByRole('button', { name: 'חוסר קריטי' })[0]).toHaveStyle({ fontWeight: '600' })
  })
  it('TEST-O04.dialog-focus [G]', () => {
    s.roles = [r('hq', { roleName: 'תפקיד מטה' })]; rr(<OrgChartPage />); const card = screen.getByRole('button', { name: /ערוך תפקיד: תפקיד מטה/ }); fireEvent.click(card); fireEvent.click(screen.getByRole('button', { name: '×' })); expect(card).toHaveFocus()
  })
  it('TEST-O05.cycle-visible-or-error [G]', () => {
    render(<OrgChartView roles={[r('A', { roleName: 'מחזור א', reportsTo: 'B' }), r('B', { roleName: 'מחזור ב', reportsTo: 'A' })]} onEdit={vi.fn()} onBranchDetails={vi.fn()} />); expect(screen.getByText('מחזור א')).toBeInTheDocument(); expect(screen.getByText('מחזור ב')).toBeInTheDocument()
  })
  it('TEST-O05.preview-no-write [A]', async () => {
    s.roles = [r('ceo', { roleName: 'מנכ"ל', holderName: 'יובל סעדון' }), r('jlm', { roleName: 'רכזת ירושלים', holderName: 'כרמל קרופפלד' }), r('br', { roleName: 'קרית יובל', level: 'סניף ירושלים' })]
    rr(<HierarchySetupPage />); expect(await screen.findByText(/תצוגה מקדימה/)).toBeInTheDocument(); expect(s.batchCommit).not.toHaveBeenCalled(); expect(s.roles[2].reportsTo).toBeUndefined()
  })
  it('TEST-O05.batch-repeat [A]', async () => {
    s.roles = [r('ceo', { roleName: 'מנכ"ל', holderName: 'יובל סעדון' }), r('jlm', { roleName: 'רכזת ירושלים', holderName: 'כרמל קרופפלד' }), r('br', { roleName: 'קרית יובל', level: 'סניף ירושלים' })]
    const { unmount } = rr(<HierarchySetupPage />); fireEvent.click(await screen.findByRole('button', { name: /הפעל/ })); await waitFor(() => expect(s.roles[2].reportsTo).toBe('jlm')); unmount(); rr(<HierarchySetupPage />); fireEvent.click(await screen.findByRole('button', { name: /הפעל/ })); await waitFor(() => expect(s.batchCommit).toHaveBeenCalledTimes(2))
  })

  it('TEST-B01.branch-operational-crud [A]', async () => {
    const u = userEvent.setup()
    s.branches = [
      b('food-branch', { name: 'סלי מזון - חיפה בדיקה', city: 'חיפה', type: 'food' }),
      b('cafe-branch', { name: 'מועדון נוער - תל אביב בדיקה', city: 'תל אביב', type: 'cafe_youth' }),
    ]
    rr(<BranchesPage />)
    await u.click(screen.getByRole('button', { name: /סניף חדש/ }))
    const addModal = screen.getByText('הוסף סניף חדש').closest('[dir="rtl"]') as HTMLElement
    fireEvent.change(ctl('שם הסניף *', addModal), { target: { value: 'סלי מזון - באר שבע יצירה' } })
    fireEvent.change(ctl('עיר *', addModal), { target: { value: 'באר שבע' } })
    await u.click(within(addModal).getByRole('button', { name: 'צור סניף' }))
    await waitFor(() => expect(s.branches.some((x) => x.name === 'סלי מזון - באר שבע יצירה')).toBe(true))
    await u.click(screen.getAllByRole('button', { name: /עריכה/ })[0])
    fireEvent.change(ctl('כתובת'), { target: { value: 'רחוב ענבים 1' } })
    fireEvent.change(ctl('תדירות חלוקה'), { target: { value: 'שבועי' } })
    fireEvent.change(ctl('סלים שבועי'), { target: { value: '0' } })
    fireEvent.change(ctl('סלים חודשי'), { target: { value: '42' } })
    fireEvent.change(ctl('שעת אריזה'), { target: { value: '09:00' } })
    fireEvent.change(ctl('שעת חלוקה'), { target: { value: '11:00' } })
    await u.click(screen.getByRole('button', { name: 'שמור' }))
    await waitFor(() => expect(s.branches.find((x) => x.name === 'סלי מזון - חיפה בדיקה')).toMatchObject({ address: 'רחוב ענבים 1', distributionFrequency: 'שבועי', weeklyBaskets: 0, monthlyBaskets: 42, packagingTime: '09:00', distributionTime: '11:00' }))
    await u.click(screen.getAllByRole('button', { name: /עריכה/ })[0])
    expect(screen.getByDisplayValue('רחוב ענבים 1')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'ביטול' }))
    await u.click(screen.getByRole('button', { name: /מועדוני נוער/ }))
    expect(screen.getByText(/תל אביב בדיקה/)).toBeInTheDocument()
    expect(screen.queryByText(/חיפה בדיקה/)).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'כל הרמות' }))
    await u.click(screen.getByRole('button', { name: /סניף חוץ/ }))
    expect(screen.getByText(/חיפה בדיקה/)).toBeInTheDocument()
    expect(screen.queryByText(/תל אביב בדיקה/)).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'כל הרמות' }))
    fireEvent.change(screen.getByDisplayValue('כל הערים'), { target: { value: 'חיפה' } })
    expect(screen.getByText(/חיפה בדיקה/)).toBeInTheDocument()
    expect(screen.queryByText(/תל אביב בדיקה/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('חיפה'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('חיפוש...'), { target: { value: 'חיפה' } })
    expect(screen.getByText(/חיפה בדיקה/)).toBeInTheDocument()
    expect(screen.queryByText(/תל אביב בדיקה/)).not.toBeInTheDocument()
  })
  it('TEST-B04.picker-membership-change [A]', async () => {
    s.auth.appUser = { uid: 'coord-a', name: 'רכז', role: 'coordinator', active: true }; s.branches = [b('A', { name: 'א', coordinatorUids: ['coord-a'] }), b('C', { name: 'ג', coordinatorUids: ['coord-a'] })]
    rr(<Routes><Route path="/portal" element={<CoordinatorPortal />}><Route path="home" element={<PortalHome />} /></Route></Routes>, '/portal/home')
    expect(screen.getByText('בחר סניף')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /א/ }))
    expect(await screen.findByText('ברוכים הבאים')).toBeInTheDocument()
    expect(screen.getAllByText('א').length).toBeGreaterThan(0)
    act(() => { s.branches = [b('C', { name: 'ג', coordinatorUids: ['coord-a'] })]; s.notify() })
    await waitFor(() => expect(screen.getAllByText('ג').length).toBeGreaterThan(0))
    expect(screen.queryByText('א')).not.toBeInTheDocument()
    act(() => { s.branches = []; s.notify() })
    expect(await screen.findByText('אין סניפים מוגדרים למשתמש זה.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'יציאה' }))
    await waitFor(() => expect(s.auth.logOut).toHaveBeenCalled())
  })
  it('TEST-B04.child-scope-reset [G]', async () => {
    s.auth.appUser = { uid: 'coord-a', name: 'רכז', role: 'coordinator', active: true }; s.branches = [b('A', { name: 'א', coordinatorUids: ['coord-a'] }), b('C', { name: 'ג', coordinatorUids: ['coord-a'] })]; s.questions = [q('x', { key: 'challenge', label: 'אתגר' })]
    rr(<Routes><Route path="/portal" element={<CoordinatorPortal />}><Route path="report" element={<PortalReport />} /></Route></Routes>, '/portal/report'); fireEvent.click(screen.getByRole('button', { name: /א/ })); await screen.findByText('דיווח רבעוני'); fireEvent.change(ctl('אתגר'), { target: { value: 'ערך של סניף א' } }); act(() => { s.branches = [b('C', { name: 'ג', coordinatorUids: ['coord-a'] })]; s.notify() }); fireEvent.click(screen.getByRole('button', { name: 'שלח דיווח' })); await waitFor(() => expect(s.reports.at(-1)?.branchId).toBe('C')); expect(s.reports.at(-1)?.data.challenge).not.toBe('ערך של סניף א')
  })
  it('TEST-B04.foreign-report-denial [A]', async () => {
    s.auth.appUser = { uid: 'coord-a', name: 'רכז', role: 'coordinator', active: true }; s.questions = [q('x', { key: 'challenge', label: 'אתגר' })]; s.addDoc.mockRejectedValueOnce(new Error('denied'))
    portal(<PortalReport />); fireEvent.change(ctl('אתגר'), { target: { value: 'נשמר' } }); fireEvent.click(screen.getByRole('button', { name: 'שלח דיווח' })); await waitFor(() => expect(s.toast).toHaveBeenCalledWith('שגיאה בשליחת הדיווח. נסה שוב.', 'error')); expect(screen.getByDisplayValue('נשמר')).toBeInTheDocument()
  })

  it('TEST-Q01.portal-report-real-reader [A]', async () => {
    s.auth.appUser = { uid: 'coord-a', name: 'רכז', role: 'coordinator', active: true }; s.questions = [q('text', { key: 'short', label: 'שם', type: 'text', order: 1 }), q('num', { key: 'count', label: 'כמות', type: 'number', order: 2 }), q('long', { key: 'challenge', label: 'אתגר', type: 'textarea', order: 3 }), q('radio', { key: 'choice', label: 'מצב', type: 'radio', options: ['טוב', 'דרוש'], order: 4 }), q('rate', { key: 'rate', label: 'ספק', type: 'rating', order: 5 }), q('first', { key: 'firstOnly', label: 'רק ראשון', type: 'text', firstReportOnly: true, order: 6 }), q('cafe', { branchType: 'cafe_youth', key: 'participants', label: 'משתתפים', type: 'number' })]
    const u = userEvent.setup(); const br = b('A', { name: 'א' }); const { unmount } = portal(<PortalReport />, br)
    await u.selectOptions(ctl('רבעון'), 'Q3'); await u.selectOptions(ctl('שנה'), '2026'); await u.type(ctl('שם'), 'דיווח מזון'); await u.type(ctl('כמות'), '0'); await u.type(ctl('אתגר'), 'א\nב'); await u.click(screen.getByRole('button', { name: 'דרוש' })); await u.click(screen.getByRole('button', { name: '4' })); await u.type(screen.getByPlaceholderText(/הערות על ספק/), 'הערה'); await u.type(ctl('רק ראשון'), 'מידע ראשון'); await u.click(screen.getByRole('button', { name: 'שלח דיווח' }))
    await waitFor(() => expect(s.reports).toHaveLength(1)); expect(s.reports[0]).toMatchObject({ branchId: 'A', branchType: 'food', quarter: 'Q3', year: 2026, submittedBy: 'coord-a', isFirstReport: true, data: { short: 'דיווח מזון', count: '0', challenge: 'א\nב', choice: 'דרוש', rate: { rating: '4', notes: 'הערה' }, firstOnly: 'מידע ראשון' } }); expect(s.reports[0].submittedAt?.toDate()).toEqual(new Date('2026-09-07T00:00:00Z'))
    unmount(); const home = portal(<PortalHome />, br); fireEvent.click(screen.getByRole('button', { name: /רבעון/ })); expect(screen.getByText('דיווח מזון')).toBeInTheDocument(); expect(screen.getByText('4/5')).toBeInTheDocument(); home.unmount()
    const later = portal(<PortalReport />, br); await u.selectOptions(ctl('רבעון'), 'Q2'); expect(screen.getByText('שם')).toBeInTheDocument(); expect(screen.queryByText('רק ראשון')).not.toBeInTheDocument(); await u.click(screen.getByRole('button', { name: 'שלח דיווח' })); await waitFor(() => expect(s.reports).toHaveLength(2)); expect(s.reports[1].data).not.toHaveProperty('firstOnly'); later.unmount()
    const cafe = b('C', { name: 'קפה', type: 'cafe_youth' }); portal(<PortalReport />, cafe); await u.type(ctl('משתתפים'), '12'); await u.click(screen.getByRole('button', { name: 'שלח דיווח' })); await waitFor(() => expect(s.reports.some((x) => x.branchType === 'cafe_youth' && x.data.participants === '12')).toBe(true))
  })
  it('TEST-Q01.first-report-loading-race [G]', async () => {
    s.auth.appUser = { uid: 'coord-a', name: 'רכז', role: 'coordinator', active: true }
    s.questions = [q('normal', { key: 'normal', label: 'רגיל' }), q('first', { key: 'firstOnly', label: 'רק ראשון', firstReportOnly: true })]
    s.reports = [rep('existing', { branchId: 'A', quarter: 'Q2', year: 2026 })]
    s.reportsLoading = true
    portal(<PortalReport />, b('A'))
    expect(screen.queryByText('רק ראשון')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'שלח דיווח' }))
    expect(s.reports).toHaveLength(1)
  })
  it('TEST-Q02.admin-question-editor [A]', async () => {
    s.questions = [q('q1', { key: 'f1', label: 'ישן', order: 1 }), q('q2', { key: 'f2', label: 'שני', order: 2 })]; const u = userEvent.setup(); const portalView = portal(<PortalReport />); expect(within(portalView.container).getByText('ישן')).toBeInTheDocument(); rr(<ReportQuestionsAdminPage />)
    await u.click(screen.getAllByRole('button', { name: /שאלה חדשה/ })[0]); await u.type(screen.getByPlaceholderText('למשל: f18'), 'f3'); await u.type(ctl('כותרת השאלה *'), 'שאלה חדשה'); await u.type(ctl('כותרת סעיף (שאלות עם אותה כותרת מקובצות יחד) *'), 'סעיף חדש'); await u.click(screen.getByRole('button', { name: 'שמור' })); await waitFor(() => expect(s.questions.some((x) => x.key === 'f3')).toBe(true)); expect(await within(portalView.container).findByText('שאלה חדשה')).toBeInTheDocument()
    await u.click(screen.getAllByRole('button', { name: /שאלה חדשה/ })[0]); await u.type(screen.getByPlaceholderText('למשל: f18'), 'f1'); expect(screen.getByText('מזהה זה כבר קיים')).toBeInTheDocument(); await u.click(screen.getByRole('button', { name: 'ביטול' }))
    await u.click(screen.getAllByRole('button', { name: 'ערוך' })[0]); expect(screen.getByDisplayValue('f1')).toBeDisabled(); await u.clear(ctl('כותרת השאלה *')); await u.type(ctl('כותרת השאלה *'), 'חדש'); await u.selectOptions(ctl('סוג שדה'), 'radio'); await u.type(ctl('אפשרויות (מופרדות בפסיקים)'), 'כן, לא'); await u.click(screen.getByRole('button', { name: 'שמור' })); await waitFor(() => expect(s.questions[0]).toMatchObject({ key: 'f1', label: 'חדש', type: 'radio', options: ['כן', 'לא'] })); expect(await within(portalView.container).findByRole('button', { name: 'כן' })).toBeInTheDocument()
    await u.click(screen.getAllByRole('button', { name: 'הזז למטה' })[0]); await waitFor(() => expect(s.questions.find((x) => x.id === 'q1')?.order).toBe(2))
    await u.click(screen.getAllByRole('button', { name: 'מחק' })[0]); await u.click(screen.getByRole('button', { name: 'אשר מחיקה' })); await waitFor(() => expect(s.questions.some((x) => x.id === 'q1')).toBe(false)); await waitFor(() => expect(within(portalView.container).queryByText('חדש')).not.toBeInTheDocument()); portalView.unmount()
  })
  it('TEST-Q03.restore-own-draft [A]', async () => { s.questions = [q('x', { key: 'challenge', label: 'אתגר', type: 'textarea' })]; localStorage.setItem('report_draft_A', JSON.stringify({ quarter: 'Q3', year: 2026, values: { challenge: 'טיוטה' } })); portal(<PortalReport />); expect(await screen.findByDisplayValue('טיוטה')).toBeInTheDocument() })
  it('TEST-Q03.malformed-draft [A]', () => { s.questions = [q('x', { key: 'challenge', label: 'אתגר' })]; localStorage.setItem('report_draft_A', '{bad'); expect(() => portal(<PortalReport />)).not.toThrow(); expect(ctl('אתגר')).toBeInTheDocument() })
  it('TEST-Q03.branch-isolation [G]', async () => {
    s.questions = [q('x', { key: 'challenge', label: 'אתגר' })]; localStorage.setItem('report_draft_A', JSON.stringify({ values: { challenge: 'ערך א' } })); const { rerender } = portal(<PortalReport />, b('A')); await screen.findByDisplayValue('ערך א'); rerender(<MemoryRouter><Routes><Route element={<Outlet context={{ branch: b('C') }} />}><Route path="/" element={<PortalReport />} /></Route></Routes></MemoryRouter>); fireEvent.click(screen.getByRole('button', { name: 'שלח דיווח' })); await waitFor(() => expect(s.reports[0]).toMatchObject({ branchId: 'C', data: { challenge: '' } }))
  })
  it('TEST-Q03.same-branch-other-user-current [C]', async () => { s.questions = [q('x', { key: 'challenge', label: 'אתגר' })]; localStorage.setItem('report_draft_A', JSON.stringify({ values: { challenge: 'טיוטת אחר' } })); s.auth.appUser = { uid: 'other', name: 'רכז אחר', role: 'coordinator', active: true }; portal(<PortalReport />); expect(await screen.findByDisplayValue('טיוטת אחר')).toBeInTheDocument() })
  it('TEST-Q04.coverage-realtime [A]', async () => {
    s.branches = [b('A', { name: 'א' }), b('B', { name: 'ב' }), b('C', { name: 'ג' }), b('D', { name: 'ד' })]; s.reports = [rep('a1', { branchId: 'A' }), rep('a2', { branchId: 'A' }), rep('old', { branchId: 'C', year: 2025 }), rep('orphan', { branchId: 'Z' })]
    rr(<ReportsPage />); fireEvent.click(screen.getByRole('button', { name: /כיסוי/ })); fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'Q3' } }); fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '2026' } }); expect(screen.getByText('1 מתוך 4 סניפים דיווחו')).toBeInTheDocument(); expect(screen.getAllByText('ב').length).toBeGreaterThan(0); expect(screen.getAllByText('ד').length).toBeGreaterThan(0); act(() => { s.reports = [...s.reports, rep('c', { branchId: 'C' })]; s.notify() }); expect(await screen.findByText('2 מתוך 4 סניפים דיווחו')).toBeInTheDocument(); expect(screen.getAllByText('א').length).toBeGreaterThan(0); expect(screen.getAllByText('ג').length).toBeGreaterThan(0)
  })
  it('TEST-Q05.filter-render-export [A]', async () => {
    s.branches = [b('A', { name: 'סניף א', city: 'חיפה' }), b('B', { name: 'קפה ב', city: 'תל אביב', type: 'cafe_youth' })]; s.questions = [q('l', { key: 'ratingKey', label: 'דירוג ספק' })]; s.reports = [rep('r1', { branchId: 'A', data: { ratingKey: { rating: '4', notes: 'טוב, פסיק' }, zero: '0', unknown: 'ערך "ישן"' } }), rep('r2', { branchId: 'B', branchType: 'cafe_youth', quarter: 'Q2', data: { p: '12' } }), rep('r3', { branchId: 'A', quarter: 'Q3', year: 2025, data: { unknown: 'שנה אחרת' } })]
    rr(<ReportsPage />)
    const clear = () => fireEvent.click(screen.getByText(/נקה סינון/))
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'A' } }); expect(screen.getByText('2 מתוך 3 דיווחים מכלל הסניפים')).toBeInTheDocument(); clear()
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'חיפה' } }); expect(screen.getByText('2 מתוך 3 דיווחים מכלל הסניפים')).toBeInTheDocument(); clear()
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'food' } }); expect(screen.getByText('2 מתוך 3 דיווחים מכלל הסניפים')).toBeInTheDocument(); clear()
    fireEvent.change(screen.getAllByRole('combobox')[3], { target: { value: 'Q2' } }); expect(screen.getByText('1 מתוך 3 דיווחים מכלל הסניפים')).toBeInTheDocument(); clear()
    fireEvent.change(screen.getAllByRole('combobox')[4], { target: { value: '2025' } }); expect(screen.getByText('1 מתוך 3 דיווחים מכלל הסניפים')).toBeInTheDocument(); clear()
    fireEvent.change(screen.getByPlaceholderText(/חיפוש חופשי/), { target: { value: 'ישן' } }); expect(screen.getByText('1 מתוך 3 דיווחים מכלל הסניפים')).toBeInTheDocument(); clear()
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'A' } }); fireEvent.change(screen.getAllByRole('combobox')[4], { target: { value: '2026' } })
    fireEvent.click(screen.getByRole('button', { name: /רבעון/ }))
    expect(screen.getByText('unknown:')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('4/5')).toBeInTheDocument()
    expect(screen.getByText('טוב, פסיק')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /ייצוא/ }))
    const csv = await lastBlob()
    expect(csv).toContain('"דירוג ספק"')
    expect(csv).toContain('"unknown"')
    expect(csv).toContain('"4 — טוב, פסיק"')
    expect(csv).toContain('"ערך ""ישן"""')
    expect(csv).not.toContain('קפה ב')
  })
  it('TEST-Q05.current-key-label-resolution [C]', () => { s.branches = [b('A')]; s.questions = [q('a', { key: 'shared', label: 'תווית מזון' }), q('b', { key: 'shared', label: 'תווית קפה', branchType: 'cafe_youth' })]; s.reports = [rep('r', { data: { shared: 'ערך', old: 'ישן' } })]; rr(<ReportsPage />); fireEvent.click(screen.getByRole('button', { name: /רבעון/ })); expect(screen.getByText('תווית קפה:')).toBeInTheDocument(); expect(screen.getByText('old:')).toBeInTheDocument() })
  it('TEST-Q06.current-concurrent-submissions [C]', async () => { await Promise.all([add('quarterlyReports', { branchId: 'A', branchType: 'food', quarter: 'Q3', year: 2026, data: { x: 1 } }), add('quarterlyReports', { branchId: 'A', branchType: 'food', quarter: 'Q3', year: 2026, data: { x: 2 } })]); expect(s.reports.filter((x) => x.branchId === 'A')).toHaveLength(2) })
  it('TEST-Q06.failed-submit-preserves-input [A]', async () => { s.auth.appUser = { uid: 'coord-a', name: 'רכז א', role: 'coordinator', active: true }; s.questions = [q('x', { key: 'challenge', label: 'אתגר' })]; s.addDoc.mockRejectedValueOnce(new Error('fail')); portal(<PortalReport />); fireEvent.change(ctl('אתגר'), { target: { value: 'נשאר' } }); fireEvent.click(screen.getByRole('button', { name: 'שלח דיווח' })); await waitFor(() => expect(s.toast).toHaveBeenCalledWith('שגיאה בשליחת הדיווח. נסה שוב.', 'error')); expect(screen.getByDisplayValue('נשאר')).toBeInTheDocument() })
  it('TEST-Q07.partial-reorder-recovery [G]', async () => { s.questions = [q('q1', { key: 'a', label: 'א', order: 1 }), q('q2', { key: 'b', label: 'ב', order: 2 })]; s.updateDoc.mockImplementationOnce((ref: any, data: any) => upd(ref.collection, ref.id, data)).mockRejectedValueOnce(new Error('reject')); rr(<ReportQuestionsAdminPage />); fireEvent.click(screen.getAllByRole('button', { name: 'הזז למטה' })[0]); await waitFor(() => expect(s.questions.map((x) => x.order).sort()).toEqual([1, 2])); expect(s.toast).toHaveBeenCalledWith(expect.stringMatching(/שגיאה|נכשל/), 'error') })
  it('TEST-Q08.saved-value-survival [A]', () => { s.branches = [b('A')]; s.questions = [q('new', { key: 'challenge', label: 'תווית חדשה', type: 'radio' })]; s.reports = [rep('old', { quarter: 'Q2', data: { challenge: 'טקסט ישן', retired: 'שרד' } })]; rr(<ReportsPage />); fireEvent.click(screen.getByRole('button', { name: /רבעון 2/ })); expect(screen.getByText('טקסט ישן')).toBeInTheDocument(); expect(screen.getByText('retired:')).toBeInTheDocument() })
  it('TEST-Q08.current-unversioned-labels [C]', () => { s.branches = [b('A')]; s.questions = [q('new', { key: 'challenge', label: 'תווית רבעון 3' })]; s.reports = [rep('old', { quarter: 'Q2', data: { challenge: 'ערך' } })]; rr(<ReportsPage />); fireEvent.click(screen.getByRole('button', { name: /רבעון 2/ })); expect(screen.getByText('תווית רבעון 3:')).toBeInTheDocument() })
})

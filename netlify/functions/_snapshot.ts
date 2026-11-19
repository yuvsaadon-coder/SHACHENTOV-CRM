/**
 * A live picture of the system, read at request time (nothing cached) and turned into records.
 * Never reads: personal to-dos (users personalTasks), chatSessions, userSecrets, loginAttempts, volunteer_tokens.
 * Volunteers are read only as counts: the name and phone fields are never even selected.
 */
import type { Firestore } from 'firebase-admin/firestore'
import {
  branchRecord, catalogRecord, contactRecord, driveRecord, financeRecord, hqKnowledgeRecord, knowledgeItemRecord, officialRecord,
  partnerRecord, reportRecord, roleRecord, supplierRecord, taskRecord, userRecord, volunteerAggregates, votingRecords,
  type Lookups, type SnapshotRecord,
} from './_records'

type Row = Record<string, unknown>

export interface Snapshot { records: SnapshotRecord[]; counts: Record<string, number>; warnings: string[] }

export async function loadSnapshot(db: Firestore): Promise<Snapshot> {
  const warnings: string[] = []
  const rows = async (name: string, fields?: string[]): Promise<{ id: string; data: Row }[]> => {
    try {
      const col = db.collection(name)
      const snap = await (fields ? col.select(...fields) : col).get()
      return snap.docs.map((d) => ({ id: d.id, data: d.data() as Row }))
    } catch (e) {
      warnings.push(`${name}: ${e instanceof Error ? e.message : String(e)}`)
      return []
    }
  }

  const [users, roles, branches, contacts, tasks, partners, suppliers, finance, official, drive, hqKnowledge, knowledgeItems, reports, questions,
    volunteers, shifts, assignments, responses, rounds, decisions, votingBranches] = await Promise.all([
    rows('users'), rows('roles'), rows('branches'), rows('contacts'), rows('tasks'), rows('hq_partners'), rows('hq_suppliers'),
    rows('hq_finance'), rows('hq_official_docs'), rows('hq_drive_links'), rows('hq_knowledge', ['title', 'category', 'domain', 'content', 'fileName']),
    rows('knowledgeItems', ['branchId', 'type', 'title', 'content', 'checklistItems', 'url', 'fileName']),
    rows('quarterlyReports'), rows('reportQuestions'),
    rows('volunteers', ['branchIds', 'status']), rows('shifts', ['branchId', 'month', 'capacity', 'status']),
    rows('assignments', ['branchId', 'status', 'shiftId']), rows('monthly_responses', ['branchId', 'month', 'status', 'sentAt']),
    rows('voting_rounds'), rows('voting_priceDecisions'), rows('voting_branches'),
  ])
  let votingConfig: Row | undefined
  try { votingConfig = (await db.collection('voting_config').doc('main').get()).data() as Row | undefined } catch (e) {
    warnings.push(`voting_config: ${e instanceof Error ? e.message : String(e)}`)
  }

  const branchById = new Map(branches.map((b) => [b.id, String(b.data.name ?? b.id)]))
  const roleById = new Map(roles.map((r) => [r.id, String(r.data.roleName ?? r.id)]))
  const contactById = new Map(contacts.map((c) => [c.id, String(c.data.name ?? '')]))
  const holders = new Map<string, string[]>()
  for (const u of users) {
    if (u.data.active === false) continue
    for (const rid of Array.isArray(u.data.roleIds) ? (u.data.roleIds as string[]) : []) {
      holders.set(rid, [...(holders.get(rid) ?? []), String(u.data.name ?? '')])
    }
  }
  const lk: Lookups = {
    branchName: (id) => branchById.get(id) ?? id,
    roleTitle: (id) => roleById.get(id) ?? id,
    holdersOf: (id) => holders.get(id) ?? [],
    contactName: (id) => contactById.get(id) ?? '',
  }
  const labelByKey: Record<string, string> = {}
  for (const q of questions) if (q.data.key) labelByKey[String(q.data.key)] = String(q.data.label ?? q.data.key)

  const byStatus: Record<string, number> = {}
  const byDomain: Record<string, number> = {}
  for (const t of tasks) {
    const s = String(t.data.status ?? 'ללא סטטוס'); byStatus[s] = (byStatus[s] ?? 0) + 1
    const d = String(t.data.domain ?? '?'); byDomain[d] = (byDomain[d] ?? 0) + 1
  }

  const records: SnapshotRecord[] = [
    ...branches.map((b) => branchRecord(b.id, b.data)),
    ...roles.map((r) => roleRecord(r.id, r.data, lk)),
    ...users.map((u) => userRecord(u.id, u.data, lk)),
    ...tasks.map((t) => taskRecord(t.id, t.data)),
    ...contacts.map((c) => contactRecord(c.id, c.data, lk)),
    ...partners.map((p) => partnerRecord(p.id, p.data, lk)),
    ...suppliers.map((s) => supplierRecord(s.id, s.data, lk)),
    ...finance.map((d) => financeRecord(d.id, d.data)),
    ...official.map((d) => officialRecord(d.id, d.data)),
    ...drive.map((d) => driveRecord(d.id, d.data)),
    ...hqKnowledge.map((k) => hqKnowledgeRecord(k.id, k.data)),
    ...knowledgeItems.map((k) => knowledgeItemRecord(k.id, k.data, lk)),
    ...reports.map((r) => reportRecord(r.id, r.data, labelByKey, lk)),
    ...volunteerAggregates({
      members: volunteers.map((v) => v.data as { branchIds?: string[]; status?: string }),
      shifts: shifts.map((s) => ({ id: s.id, ...(s.data as Row) })) as never,
      assignments: assignments.map((a) => a.data) as never,
      responses: responses.map((r) => r.data) as never,
    }, lk),
    ...votingRecords(votingConfig, rounds, decisions, votingBranches, lk),
  ]

  const counts: Record<string, number> = {
    סניפים: branches.length, תפקידים: roles.length, אנשים: users.length, משימות: tasks.length, 'אנשי קשר': contacts.length,
    שותפים: partners.length, ספקים: suppliers.length, 'דוחות כספיים': finance.length, 'טפסים רשמיים': official.length,
    'קישורי דרייב': drive.length, 'ידע מטה': hqKnowledge.length, 'ידע סניפי': knowledgeItems.length, 'דיווחים רבעוניים': reports.length,
    'מתנדבים רשומים (ללא שמות)': volunteers.length, משמרות: shifts.length, שיבוצים: assignments.length,
    'מוצרי סקר סלים': Array.isArray(votingConfig?.products) ? (votingConfig!.products as unknown[]).length : 0,
    'סבבי סקר': rounds.length, 'החלטות ספק בסקר': decisions.length,
  }
  records.push(catalogRecord(counts, { byStatus, byDomain }))
  return { records, counts, warnings }
}

/**
 * Builds what the HQ chatbot knows beyond its configured knowledge sources: a catalog of every
 * indexed file, the file excerpts relevant to the question, and the live system records.
 */
import type { Firestore } from 'firebase-admin/firestore'
import { groupByDoc, queryTokens, rankChunks, selectWithinBudget, type RetrievalDoc } from './_retrieval'
import { buildRecordsContext, recordsAsDocs, type SnapshotRecord } from './_records'
import { loadSnapshot } from './_snapshot'

export const TOTAL_BUDGET = 150_000
export const FILES_BUDGET = 60_000
const MAX_CATALOG_LINES = 500

export interface FileTextRow {
  name?: string
  sourceLabel?: string
  places?: { label?: string }[]
  text?: string
  chars?: number
  scanned?: boolean
  error?: string | null
  note?: string | null
}

const placesOf = (f: FileTextRow) => (f.places ?? []).slice(0, 3).map((p) => p.label).filter(Boolean).join('; ') || f.sourceLabel || ''

export function fileStatus(f: FileTextRow): string {
  if (f.error) return `לא נקרא: ${f.error}`
  if (f.scanned) return 'קובץ סרוק — אין בו טקסט שאפשר לקרוא'
  if (!f.text) return f.note ?? 'ריק או סוג קובץ שאינו נתמך'
  return `נקרא (${f.chars ?? f.text.length} תווים)`
}

export function catalogBlock(files: FileTextRow[]): string {
  if (files.length === 0) return ''
  const lines = files.slice(0, MAX_CATALOG_LINES).map((f) => `— ${f.name ?? 'קובץ'} (${placesOf(f)}) — ${fileStatus(f)}`)
  return `קטלוג הקבצים שהמערכת מכירה (${files.length}):\n${lines.join('\n')}`
}

export interface FileExcerpts { text: string; omitted: number; used: number }

export function fileExcerpts(files: FileTextRow[], question: string, history: string[], budget = FILES_BUDGET): FileExcerpts {
  const docs: RetrievalDoc[] = files
    .filter((f) => f.text && f.text.length > 0)
    .map((f) => ({ id: `${f.name}|${placesOf(f)}`, title: f.name ?? 'קובץ', label: placesOf(f), text: f.text! }))
  const sel = selectWithinBudget(rankChunks(docs, queryTokens(question, history)), budget, 10)
  const text = groupByDoc(sel.chosen)
    .map((g) => `מתוך קובץ ${g.title} (${g.label}):\n${g.chunks.map((c) => c.text).join('\n…\n')}`)
    .join('\n\n')
  return { text, omitted: sel.omitted, used: sel.used }
}

export function recordsContext(records: SnapshotRecord[], question: string, history: string[], budget: number) {
  const core = records.filter((r) => r.core)
  const rest = records.filter((r) => !r.core)
  const ranked = rankChunks(recordsAsDocs(rest), queryTokens(question, history))
  return buildRecordsContext(core, ranked, budget)
}

export interface LiveContext {
  catalog: string
  files: string
  records: string
  filesIndexed: number
  notices: string[]
  warnings: string[]
}

/** `usedElsewhere` is the size of the prompt parts that are not built here, so the whole stays in budget. */
export async function buildLiveContext(db: Firestore, question: string, history: string[], usedElsewhere: number): Promise<LiveContext> {
  const warnings: string[] = []
  let records: SnapshotRecord[] = []
  let files: FileTextRow[] = []
  await Promise.all([
    (async () => {
      try {
        const snap = await loadSnapshot(db)
        records = snap.records
        warnings.push(...snap.warnings)
      } catch (e) { warnings.push(`נתוני מערכת: ${e instanceof Error ? e.message : String(e)}`) }
    })(),
    (async () => {
      try { files = (await db.collection('file_texts').get()).docs.map((d) => d.data() as FileTextRow) } catch (e) { warnings.push(`קבצים: ${e instanceof Error ? e.message : String(e)}`) }
    })(),
  ])

  const excerpts = fileExcerpts(files, question, history)
  const catalog = catalogBlock(files)
  const recordsBudget = Math.max(20_000, TOTAL_BUDGET - usedElsewhere - excerpts.used - catalog.length)
  const rec = recordsContext(records, question, history, recordsBudget)

  const notices: string[] = []
  if (files.length === 0) notices.push('אינדקס הקבצים עדיין ריק — תוכן הקבצים עוד לא נקרא. אם המשתמש שואל על תוכן של קובץ, אמור לו ללחוץ על הכפתור "עדכן קבצים לבוט" בראש הדף.')
  if (excerpts.omitted > 0 || rec.omitted > 0) notices.push('חלק מהנתונים הושמט מטעמי גודל — אם התשובה חלקית, בקש מהמשתמש לשאול שאלה ממוקדת יותר.')
  return { catalog, files: excerpts.text, records: [rec.coreText, rec.recordsText].filter(Boolean).join('\n'), filesIndexed: files.length, notices, warnings }
}

/**
 * Picks the pieces of text most relevant to a question. Pure — no Firebase, no network.
 * Used for both the text of uploaded files and the live system records.
 */

export interface RetrievalDoc {
  id: string
  /** Shown to the model, e.g. a file name or a record title. */
  title: string
  /** Where it comes from, e.g. 'משימה' or 'דוחות כספיים'. */
  label: string
  text: string
}

export interface Chunk {
  docId: string
  title: string
  label: string
  index: number
  text: string
}

export interface RankedChunk extends Chunk {
  score: number
}

const STOPWORDS = new Set([
  'של', 'את', 'על', 'עם', 'או', 'אם', 'כי', 'גם', 'לא', 'כל', 'זה', 'זו', 'זאת', 'הוא', 'היא', 'הם', 'הן', 'יש', 'אין',
  'מה', 'מי', 'איך', 'כמה', 'מתי', 'איפה', 'למה', 'אל', 'מן', 'אבל', 'רק', 'כך', 'עוד', 'בין', 'לפי', 'אני', 'אנחנו',
  'אתה', 'אתם', 'היה', 'היו', 'להיות', 'שלי', 'שלו', 'שלה', 'שלנו', 'כמו', 'בו', 'בה', 'בהם', 'לו', 'לה', 'להם', 'אותו',
  'אותה', 'אלה', 'אלו', 'הזה', 'הזו', 'הזאת', 'כן', 'נא', 'בבקשה', 'תוכל', 'תוכלי', 'אפשר', 'רוצה', 'צריך', 'צריכה',
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'what', 'how', 'many', 'much',
])

const PREFIXES = new Set(['ה', 'ו', 'ב', 'ל', 'מ', 'כ', 'ש'])
const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }

function stem(word: string): string {
  let w = word
  if (w.length >= 4 && PREFIXES.has(w[0])) w = w.slice(1)
  if (w.length >= 5 && (w.endsWith('ים') || w.endsWith('ות'))) w = w.slice(0, -2)
  else if (w.length >= 5 && w.endsWith('ת')) w = w.slice(0, -1)
  else if (w.length >= 4 && w.endsWith('י')) w = w.slice(0, -1)
  return w.replace(/[ךםןףץ]/g, (c) => FINALS[c])
}

/** Lower-cased words without niqqud, stop words or common Hebrew prefixes and endings. */
export function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  const out: string[] = []
  for (const w of words) {
    if (STOPWORDS.has(w)) continue
    const s = /\p{Script=Hebrew}/u.test(w) ? stem(w) : w
    if (s.length >= 2 || /\d/.test(s)) out.push(s)
  }
  return out
}

/** Splits text into pieces of about `size` characters, overlapping, cutting at line or word breaks. */
export function chunkText(text: string, size = 1500, overlap = 200): string[] {
  const t = text.trim()
  if (t.length <= size) return t ? [t] : []
  const chunks: string[] = []
  let start = 0
  while (start < t.length) {
    let end = Math.min(start + size, t.length)
    if (end < t.length) {
      const window = t.slice(start + Math.floor(size * 0.6), end)
      const nl = window.lastIndexOf('\n')
      const sp = window.lastIndexOf(' ')
      const cut = nl >= 0 ? nl : sp
      if (cut > 0) end = start + Math.floor(size * 0.6) + cut
    }
    chunks.push(t.slice(start, end).trim())
    if (end >= t.length) break
    start = Math.max(end - overlap, start + 1)
  }
  return chunks.filter(Boolean)
}

/** Query word weights: the question counts fully, earlier user messages less. */
export function queryTokens(question: string, history: string[] = []): Map<string, number> {
  const q = new Map<string, number>()
  for (const t of tokenize(question)) q.set(t, 1)
  for (const h of history) for (const t of tokenize(h)) if (!q.has(t)) q.set(t, 0.4)
  return q
}

const K1 = 1.5
const B = 0.75
const TITLE_BONUS = 2.5

export function rankChunks(docs: RetrievalDoc[], query: Map<string, number>, chunkSize = 1500): RankedChunk[] {
  if (query.size === 0) return []
  const chunks: (Chunk & { tokens: string[]; boost: number })[] = []
  for (const d of docs) {
    const nameTokens = new Set(tokenize(`${d.title} ${d.label}`))
    let boost = 0
    for (const [t, w] of query) if (nameTokens.has(t)) boost += TITLE_BONUS * w
    chunkText(d.text, chunkSize).forEach((text, index) => {
      chunks.push({ docId: d.id, title: d.title, label: d.label, index, text, tokens: tokenize(text), boost })
    })
  }
  if (chunks.length === 0) return []

  const df = new Map<string, number>()
  let totalLen = 0
  for (const c of chunks) {
    totalLen += c.tokens.length
    for (const t of new Set(c.tokens)) df.set(t, (df.get(t) ?? 0) + 1)
  }
  const avg = totalLen / chunks.length || 1
  const N = chunks.length

  const ranked: RankedChunk[] = []
  for (const c of chunks) {
    const tf = new Map<string, number>()
    for (const t of c.tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
    let score = 0
    for (const [t, w] of query) {
      const f = tf.get(t)
      if (!f) continue
      const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5))
      score += w * idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * c.tokens.length) / avg)))
    }
    if (score > 0 || c.boost > 0) {
      ranked.push({ docId: c.docId, title: c.title, label: c.label, index: c.index, text: c.text, score: score + c.boost })
    }
  }
  return ranked.sort((a, b) => b.score - a.score || a.index - b.index)
}

export interface Selection {
  chosen: RankedChunk[]
  used: number
  /** Relevant pieces that did not fit the budget. */
  omitted: number
}

/** The best chunks that fit in `budget` characters, at most `perDocMax` from one document. */
export function selectWithinBudget(ranked: RankedChunk[], budget: number, perDocMax = 12): Selection {
  const chosen: RankedChunk[] = []
  const perDoc = new Map<string, number>()
  let used = 0
  let omitted = 0
  for (const c of ranked) {
    const n = perDoc.get(c.docId) ?? 0
    if (n >= perDocMax || used + c.text.length > budget) { omitted++; continue }
    chosen.push(c)
    perDoc.set(c.docId, n + 1)
    used += c.text.length
  }
  return { chosen, used, omitted }
}

/** Chosen chunks grouped by document (best document first), each document's pieces in reading order. */
export function groupByDoc(chosen: RankedChunk[]): { docId: string; title: string; label: string; chunks: RankedChunk[] }[] {
  const groups = new Map<string, { docId: string; title: string; label: string; chunks: RankedChunk[] }>()
  for (const c of chosen) {
    const g = groups.get(c.docId) ?? { docId: c.docId, title: c.title, label: c.label, chunks: [] }
    g.chunks.push(c)
    groups.set(c.docId, g)
  }
  return [...groups.values()].map((g) => ({ ...g, chunks: g.chunks.sort((a, b) => a.index - b.index) }))
}

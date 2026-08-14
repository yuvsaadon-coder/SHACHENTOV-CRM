/**
 * HQ chatbot — queries configurable knowledge sources.
 * Auth: any Firebase authenticated user with role != 'coordinator'.
 */
import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function initFirebase() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT')
  initializeApp({ credential: cert(JSON.parse(raw) as Record<string, string>) })
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

type ScopeKey = 'hq' | 'research' | 'global' | 'branch'

interface RequestBody {
  scopes: ScopeKey[]
  domainFilter: string | null
  messages: ChatMessage[]
  question: string
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }
const fail = (statusCode: number, error: string) => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify({ error }),
})

export const handler: Handler = async (event) => {
  try {
    return await chat(event)
  } catch (e: unknown) {
    // Any uncaught throw would otherwise become a bodyless 500 that the UI
    // reports as a bare status code, which is what "the bot doesn't answer" looks like.
    const detail = e instanceof Error ? e.message : String(e)
    return fail(500, `שגיאה בשרת הצ׳אטבוט: ${detail}`)
  }
}

async function chat(event: HandlerEvent): Promise<HandlerResponse> {
  if (event.httpMethod !== 'POST') return fail(405, 'Method Not Allowed')

  const authHeader = event.headers['authorization'] ?? ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!idToken) return fail(401, 'לא מחובר — התחבר מחדש ונסה שוב.')

  try { initFirebase() } catch {
    return fail(500, 'משתנה הסביבה FIREBASE_SERVICE_ACCOUNT חסר או שגוי ב-Netlify.')
  }

  let uid: string
  try {
    const decoded = await getAuth().verifyIdToken(idToken)
    uid = decoded.uid
  } catch {
    return fail(401, 'ההתחברות פגה — רענן את הדף והתחבר מחדש.')
  }

  const db = getFirestore()
  const userDoc = await db.collection('users').doc(uid).get()
  if (userDoc.exists && (userDoc.data() as { role?: string }).role === 'coordinator') {
    return fail(403, 'רכזים משתמשים בצ׳אטבוט של הפורטל.')
  }

  const body = JSON.parse(event.body ?? '{}') as Partial<RequestBody>
  const messages = body.messages ?? []
  const domainFilter = body.domainFilter ?? null

  // Support both new `scopes` array and legacy `scope` string
  let scopes: ScopeKey[]
  if (Array.isArray(body.scopes) && body.scopes.length > 0) {
    scopes = body.scopes
  } else {
    scopes = ['hq', 'research', 'global']
  }

  const sections: string[] = []
  const sourceWarnings: string[] = []

  /** One unavailable source must not take the whole answer down with it. */
  async function collect(label: string, fn: () => Promise<void>) {
    try {
      await fn()
    } catch (e: unknown) {
      sourceWarnings.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 1. HQ knowledge
  if (scopes.includes('hq')) await collect('מאגר מטה', async () => {
    let hqQuery = db.collection('hq_knowledge').limit(50)
    if (domainFilter) {
      hqQuery = db.collection('hq_knowledge').where('domain', 'in', [domainFilter, 'all']).limit(50)
    }
    const hqSnap = await hqQuery.get()
    if (!hqSnap.empty) {
      const lines = hqSnap.docs.map((d) => {
        const data = d.data() as { title?: string; content?: string; category?: string }
        return `— [${data.category ?? ''}] **${data.title ?? ''}**: ${data.content ?? ''}`
      })
      sections.push(`מאגר ידע מטה:\n${lines.join('\n')}`)
    }
  })

  // 2. Research / professional articles
  if (scopes.includes('research')) await collect('מחקר מקצועי', async () => {
    const researchSnap = await db.collection('knowledge_articles').limit(40).get()
    if (!researchSnap.empty) {
      const lines = researchSnap.docs.map((d) => {
        const data = d.data() as {
          titleHe?: string; summary?: string; lang?: string
          type?: string; checklistItems?: string[]
        }
        if (data.type === 'checklist' && data.checklistItems?.length) {
          return `— **${data.titleHe ?? ''}** (צ׳קליסט): ${data.checklistItems.join(' | ')}`
        }
        return `— **${data.titleHe ?? ''}** (${data.lang ?? ''}): ${data.summary ?? ''}`
      })
      sections.push(`ספריית מחקר ומידע מקצועי:\n${lines.join('\n')}`)
    }
  })

  // 3. Global coordinator-platform knowledge (branchId == 'global')
  if (scopes.includes('global')) await collect('ידע כלל-ארגוני', async () => {
    const globalSnap = await db
      .collection('knowledgeItems')
      .where('branchId', '==', 'global')
      .limit(30)
      .get()
    if (!globalSnap.empty) {
      const lines = globalSnap.docs.map((d) => {
        const data = d.data() as {
          title?: string; content?: string
          type?: string; checklistItems?: string[]
        }
        if (data.type === 'checklist' && data.checklistItems?.length) {
          return `— **${data.title ?? ''}** (צ׳קליסט): ${data.checklistItems.join(' | ')}`
        }
        return `— **${data.title ?? ''}**: ${data.content ?? ''}`
      })
      sections.push(`ידע כלל-ארגוני (פלטפורמת רכזים):\n${lines.join('\n')}`)
    }
  })

  // 4. Branch-specific knowledge. A Firestore `!=` filter skips documents that
  // have no branchId at all, so read the collection and filter in memory instead.
  if (scopes.includes('branch')) await collect('ידע סניפי', async () => {
    const allSnap = await db.collection('knowledgeItems').limit(200).get()
    const branchDocs = allSnap.docs.filter(
      (d) => (d.data() as { branchId?: string }).branchId !== 'global'
    ).slice(0, 30)
    if (branchDocs.length > 0) {
      const lines = branchDocs.map((d) => {
        const data = d.data() as {
          title?: string; content?: string; branchId?: string
          type?: string; checklistItems?: string[]
        }
        const branchNote = data.branchId ? ` [סניף: ${data.branchId}]` : ''
        if (data.type === 'checklist' && data.checklistItems?.length) {
          return `— **${data.title ?? ''}**${branchNote} (צ׳קליסט): ${data.checklistItems.join(' | ')}`
        }
        return `— **${data.title ?? ''}**${branchNote}: ${data.content ?? ''}`
      })
      sections.push(`ידע סניפי (רמת סניף):\n${lines.join('\n')}`)
    }
  })

  const knowledgeBlock = sections.length > 0
    ? sections.join('\n\n')
    : 'אין פריטי ידע במקורות שנבחרו עדיין.'

  const scopeNote = scopes.map((s) => ({
    hq: 'מאגר מטה', research: 'מחקר מקצועי', global: 'ידע כלל-ארגוני', branch: 'ידע סניפי',
  }[s])).join(', ')

  const domainNote = domainFilter ? ` תעדף מידע הקשור לתחום: ${domainFilter}.` : ''

  const systemPrompt = `אתה עוזר AI של מטה עמותת שכן טוב, מסייע לצוות המטה.
ענה בעברית בלבד. היה ישיר, מקצועי ומעשי.${domainNote}
מקורות הידע הפעילים בשיחה זו: ${scopeNote}.

${knowledgeBlock}

כשתשובה נסמכת על פריט ספציפי — ציין את שמו.
אם אין מידע רלוונטי במאגר הידע — אמור זאת בכנות: "אין לי מידע על זה במקורות שנבחרו." אל תנסה לספק מידע כללי שאינו מבוסס על המסמכים לעיל.`

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return fail(500, 'משתנה הסביבה ANTHROPIC_API_KEY חסר ב-Netlify.')

  const turns = messages
    .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content }))
  if (turns.length === 0) return fail(400, 'לא נשלחה שאלה.')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 2000,
      system: systemPrompt,
      messages: turns,
    }),
  })

  if (!response.ok) {
    const raw = await response.text()
    let detail = raw
    try {
      detail = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? raw
    } catch { /* keep raw text */ }
    return fail(502, `שגיאת Anthropic API (${response.status}): ${detail}`)
  }

  const result = await response.json() as {
    stop_reason?: string
    content: { type: string; text?: string }[]
  }
  if (result.stop_reason === 'refusal') {
    return fail(502, 'המודל סירב לענות על השאלה הזו. נסח אותה מחדש.')
  }
  const text = result.content.find((c) => c.type === 'text')?.text
  const reply = text?.trim()
    ? text + (sourceWarnings.length ? `\n\n⚠️ מקורות שלא נטענו: ${sourceWarnings.join(' | ')}` : '')
    : 'לא התקבלה תשובה מהמודל.'

  return {
    statusCode: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({ reply }),
  }
}

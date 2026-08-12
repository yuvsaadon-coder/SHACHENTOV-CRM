/**
 * HQ chatbot — queries hq_knowledge, knowledge_articles (research),
 * and global knowledgeItems (coordinator platform).
 * Auth: any Firebase authenticated user with role != 'coordinator'.
 */
import type { Handler } from '@netlify/functions'
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

interface RequestBody {
  scope: 'hq' | 'all'
  domainFilter: string | null
  messages: ChatMessage[]
  question: string
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  const authHeader = event.headers['authorization'] ?? ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!idToken) return { statusCode: 401, body: JSON.stringify({ error: 'Missing token' }) }

  try { initFirebase() } catch {
    return { statusCode: 500, body: JSON.stringify({ error: 'Firebase not configured' }) }
  }

  let uid: string
  try {
    const decoded = await getAuth().verifyIdToken(idToken)
    uid = decoded.uid
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) }
  }

  // Check user is not a coordinator
  const db = getFirestore()
  const userDoc = await db.collection('users').doc(uid).get()
  if (userDoc.exists && (userDoc.data() as { role?: string }).role === 'coordinator') {
    return { statusCode: 403, body: JSON.stringify({ error: 'Coordinators use the portal chat' }) }
  }

  const { scope, domainFilter, messages } = JSON.parse(event.body ?? '{}') as RequestBody

  const sections: string[] = []

  // 1. HQ knowledge
  let hqQuery = db.collection('hq_knowledge').limit(50)
  if (domainFilter) {
    hqQuery = db.collection('hq_knowledge').where('domain', 'in', [domainFilter, 'all']).limit(50)
  }
  const hqSnap = await hqQuery.get()
  if (!hqSnap.empty) {
    const hqLines = hqSnap.docs.map((d) => {
      const data = d.data() as { title?: string; content?: string; category?: string; domain?: string }
      return `— [${data.category ?? ''}] **${data.title ?? ''}**: ${data.content ?? ''}`
    })
    sections.push(`מאגר ידע מטה:\n${hqLines.join('\n')}`)
  }

  // 2. Research articles
  if (scope === 'all') {
    const researchSnap = await db.collection('knowledge_articles').limit(30).get()
    if (!researchSnap.empty) {
      const researchLines = researchSnap.docs.map((d) => {
        const data = d.data() as { titleHe?: string; summary?: string; lang?: string }
        return `— **${data.titleHe ?? ''}** (${data.lang ?? ''}): ${data.summary ?? ''}`
      })
      sections.push(`ספריית מחקר ומידע מקצועי:\n${researchLines.join('\n')}`)
    }

    // 3. Global coordinator platform knowledge
    const globalKnSnap = await db
      .collection('knowledgeItems')
      .where('branchId', '==', 'global')
      .limit(30)
      .get()
    if (!globalKnSnap.empty) {
      const globalLines = globalKnSnap.docs.map((d) => {
        const data = d.data() as { title?: string; content?: string }
        return `— **${data.title ?? ''}**: ${data.content ?? ''}`
      })
      sections.push(`ידע כלל-ארגוני (פלטפורמת רכזים):\n${globalLines.join('\n')}`)
    }
  }

  const knowledgeBlock = sections.length > 0
    ? sections.join('\n\n')
    : 'אין פריטי ידע במאגר עדיין.'

  const domainNote = domainFilter ? ` תעדף מידע הקשור לתחום: ${domainFilter}.` : ''

  const systemPrompt = `אתה עוזר AI של מטה עמותת שכן טוב, מסייע לצוות המטה.
ענה בעברית בלבד. היה ישיר, מקצועי ומעשי.${domainNote}

${knowledgeBlock}

כשתשובה נסמכת על פריט ספציפי — ציין את שמו.
אם אין מידע רלוונטי במאגר הידע — אמור זאת בכנות: "אין לי מידע על זה במאגר הידע שלי." אל תנסה לספק מידע כללי שאינו מבוסס על המסמכים לעיל.`

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'Missing API key' }) }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    return { statusCode: 502, body: JSON.stringify({ error: `Anthropic API error: ${err}` }) }
  }

  const result = await response.json() as { content: { type: string; text: string }[] }
  const reply = result.content.find((c) => c.type === 'text')?.text ?? 'לא התקבלה תשובה.'

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reply }),
  }
}

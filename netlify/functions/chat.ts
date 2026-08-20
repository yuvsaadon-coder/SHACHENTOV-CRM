import type { Handler } from '@netlify/functions'
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function initFirebase() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT')
  const serviceAccount = JSON.parse(raw) as Record<string, string>
  initializeApp({ credential: cert(serviceAccount) })
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface RequestBody {
  branchId: string
  mode: 'branch' | 'all'
  messages: ChatMessage[]
  question: string
}

interface KnowledgeDoc {
  branchId: string
  title: string
  content: string
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  // Auth: verify Firebase ID token
  const authHeader = event.headers['authorization'] ?? ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!idToken) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing token' }) }
  }

  try {
    initFirebase()
  } catch {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) }
  }

  let uid: string
  try {
    const decoded = await getAuth().verifyIdToken(idToken)
    uid = decoded.uid
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) }
  }

  const body = JSON.parse(event.body ?? '{}') as RequestBody
  const { branchId, mode, messages } = body

  if (!branchId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing branchId' }) }
  }

  // Authorize: uid must be in branches/{branchId}.coordinatorUids
  const db = getFirestore()
  const branchDoc = await db.collection('branches').doc(branchId).get()
  if (!branchDoc.exists) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Branch not found' }) }
  }
  const branchData = branchDoc.data() as { coordinatorUids?: string[] }
  if (!(branchData.coordinatorUids ?? []).includes(uid)) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Not authorized for this branch' }) }
  }

  // Fetch knowledge items
  const branchIds = mode === 'all' ? [branchId, 'global'] : [branchId]
  const knowledgeSnap = await db
    .collection('knowledgeItems')
    .where('branchId', 'in', branchIds)
    .get()

  const localItems: KnowledgeDoc[] = []
  const globalItems: KnowledgeDoc[] = []
  knowledgeSnap.forEach((d) => {
    const data = d.data() as KnowledgeDoc
    if (data.branchId === 'global') {
      globalItems.push(data)
    } else {
      localItems.push(data)
    }
  })

  const formatItems = (items: KnowledgeDoc[]) =>
    items.map((item) => `— **${item.title}**: ${item.content}`).join('\n')

  // Fetch research articles catalog for 'all' mode
  let researchSection = ''
  if (mode === 'all') {
    const researchSnap = await db.collection('knowledge_articles').limit(30).get()
    if (!researchSnap.empty) {
      const researchItems = researchSnap.docs.map((d) => {
        const data = d.data() as { titleHe?: string; summary?: string; lang?: string }
        return `— **${data.titleHe ?? ''}** (${data.lang ?? ''}): ${data.summary ?? ''}`
      })
      researchSection = `\n\nספריית מחקר ומידע מקצועי:\n${researchItems.join('\n')}`
    }
  }

  const localSection = localItems.length > 0
    ? `ידע הסניף הספציפי (תעדף זאת ראשון):\n${formatItems(localItems)}`
    : 'אין ידע ספציפי לסניף זה.'

  const globalSection = mode === 'all' && globalItems.length > 0
    ? `\n\nידע כלל-ארגוני:\n${formatItems(globalItems)}`
    : ''

  const systemPrompt = `אתה עוזר AI של עמותת שכן טוב, מסייע לרכזי סניפים.
ענה בעברית בלבד. היה ישיר ומעשי.

${localSection}${globalSection}${researchSection}

אם התשובה מגיעה ממסמך ספציפי — ציין את שמו.
אם אין מידע רלוונטי במאגר הידע — אמור זאת בכנות: "אין לי מידע על זה במאגר הידע של הסניף." אל תנסה לספק מידע כללי שאינו מבוסס על המסמכים לעיל.`

  // Call Anthropic API
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing API key' }) }
  }

  const anthropicMessages = messages.map((m) => ({ role: m.role, content: m.content }))

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1000,
      system: systemPrompt,
      messages: anthropicMessages,
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

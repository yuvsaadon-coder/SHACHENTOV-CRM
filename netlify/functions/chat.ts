import { corsHeaders, handleOptions } from './_cors'
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
  const origin = event.headers['origin']
  const cors = corsHeaders(origin)
  if (event.httpMethod === 'OPTIONS') return handleOptions(origin)
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: 'Method Not Allowed' }
  }

  // Auth: verify Firebase ID token
  const authHeader = event.headers['authorization'] ?? ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!idToken) {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Missing token' }) }
  }

  try {
    initFirebase()
  } catch {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Server configuration error' }) }
  }

  let uid: string
  try {
    const decoded = await getAuth().verifyIdToken(idToken)
    uid = decoded.uid
  } catch {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Invalid token' }) }
  }

  const body = JSON.parse(event.body ?? '{}') as RequestBody
  const { branchId, mode, messages } = body

  if (!branchId) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing branchId' }) }
  }

  // Authorize: the branch must be one of the caller's portal branches — those of
  // the positions they hold, kept on their person record.
  const db = getFirestore()
  const callerDoc = await db.collection('users').doc(uid).get()
  const caller = (callerDoc.data() ?? {}) as { active?: boolean; branchIds?: string[] }
  if (!callerDoc.exists || caller.active === false || !(caller.branchIds ?? []).includes(branchId)) {
    return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Not authorized for this branch' }) }
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

כללי מבנה תשובה — חובה לקיים:
• תשובתך חייבת להיות שלמה ומסוכמת תוך 3000 תווים לכל היותר.
• תכנן את תשובתך מראש כך שתסיים אותה בצורה מלאה ועגולה — אף פעם אל תיקטע באמצע משפט או רעיון.
• אם הנושא רחב ויש עוד מה לומר — כתוב תשובה ממוקדת על הנקודה המרכזית, ובסוף הוסף שורה אחת: "רוצה שאפרט על [נושא ספציפי]?" כך המשתמש יוכל לבקש המשך.
• אם אין מידע רלוונטי — אמור זאת בכנות: "אין לי מידע על זה במאגר הידע של הסניף."
• אם התשובה מגיעה ממסמך ספציפי — ציין את שמו.
• אל תספק מידע כללי שאינו מבוסס על המסמכים לעיל.`

  // Call Anthropic API
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Missing API key' }) }
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
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: systemPrompt,
      messages: anthropicMessages,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: `Anthropic API error: ${err}` }) }
  }

  const result = await response.json() as { stop_reason?: string; content: { type: string; text: string }[] }
  const text = result.content.find((c) => c.type === 'text')?.text ?? ''
  const reply = text || 'לא התקבלה תשובה.'

  return {
    statusCode: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reply }),
  }
}

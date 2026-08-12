/**
 * HQ chatbot — queries configurable knowledge sources.
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

type ScopeKey = 'hq' | 'research' | 'global' | 'branch'

interface RequestBody {
  scopes: ScopeKey[]
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

  const db = getFirestore()
  const userDoc = await db.collection('users').doc(uid).get()
  if (userDoc.exists && (userDoc.data() as { role?: string }).role === 'coordinator') {
    return { statusCode: 403, body: JSON.stringify({ error: 'Coordinators use the portal chat' }) }
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

  // 1. HQ knowledge
  if (scopes.includes('hq')) {
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
  }

  // 2. Research / professional articles
  if (scopes.includes('research')) {
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
  }

  // 3. Global coordinator-platform knowledge (branchId == 'global')
  if (scopes.includes('global')) {
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
  }

  // 4. Branch-specific knowledge (branchId != 'global')
  if (scopes.includes('branch')) {
    const branchSnap = await db
      .collection('knowledgeItems')
      .where('branchId', '!=', 'global')
      .limit(30)
      .get()
    if (!branchSnap.empty) {
      const lines = branchSnap.docs.map((d) => {
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
  }

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

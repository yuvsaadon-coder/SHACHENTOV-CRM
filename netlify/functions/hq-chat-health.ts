/**
 * Diagnostic for the HQ chatbot. Open in a browser while logged out:
 *   https://<site>/.netlify/functions/hq-chat-health
 *
 * Reports which of the chatbot's three dependencies are actually configured on
 * Netlify, so "the bot doesn't answer" resolves to a specific cause instead of
 * a guess. It never returns secret values — only whether each one works.
 */
import type { Handler } from '@netlify/functions'
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

type Check = { name: string; ok: boolean; detail: string }

export const handler: Handler = async () => {
  const checks: Check[] = []

  // 1. Firebase service account
  const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!rawSa) {
    checks.push({ name: 'FIREBASE_SERVICE_ACCOUNT', ok: false, detail: 'המשתנה לא מוגדר ב-Netlify' })
  } else {
    try {
      const parsed = JSON.parse(rawSa) as { project_id?: string }
      if (getApps().length === 0) initializeApp({ credential: cert(parsed as Record<string, string>) })
      checks.push({ name: 'FIREBASE_SERVICE_ACCOUNT', ok: true, detail: `פרויקט ${parsed.project_id ?? '?'}` })
    } catch (e) {
      checks.push({
        name: 'FIREBASE_SERVICE_ACCOUNT',
        ok: false,
        detail: `לא ניתן לפענח כ-JSON: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  // 2. Firestore reachability + how much knowledge the bot can actually see
  if (getApps().length > 0) {
    for (const col of ['hq_knowledge', 'knowledge_articles', 'knowledgeItems']) {
      try {
        const snap = await getFirestore().collection(col).limit(50).get()
        checks.push({ name: `Firestore: ${col}`, ok: true, detail: `${snap.size} מסמכים` })
      } catch (e) {
        checks.push({
          name: `Firestore: ${col}`,
          ok: false,
          detail: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }

  // 3. Anthropic key — a 1-token call proves the key works and the model is allowed
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    checks.push({ name: 'ANTHROPIC_API_KEY', ok: false, detail: 'המשתנה לא מוגדר ב-Netlify' })
  } else {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      })
      if (res.ok) {
        checks.push({ name: 'ANTHROPIC_API_KEY', ok: true, detail: 'המפתח תקין ו-claude-sonnet-5 זמין' })
      } else {
        const body = await res.text()
        let detail = body
        try { detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? body } catch { /* raw */ }
        checks.push({ name: 'ANTHROPIC_API_KEY', ok: false, detail: `HTTP ${res.status}: ${detail}` })
      }
    } catch (e) {
      checks.push({
        name: 'ANTHROPIC_API_KEY',
        ok: false,
        detail: `הקריאה נכשלה: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  const failed = checks.filter((c) => !c.ok)
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      ok: failed.length === 0,
      summary: failed.length === 0
        ? 'כל הבדיקות עברו — הצ׳אטבוט אמור לעבוד.'
        : `${failed.length} בדיקות נכשלו: ${failed.map((c) => c.name).join(', ')}`,
      checks,
    }, null, 2),
  }
}

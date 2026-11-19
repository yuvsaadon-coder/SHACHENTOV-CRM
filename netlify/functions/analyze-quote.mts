// Supplier price-quote analysis for the basket survey module (voting). Reads one quote (or one chunk of it) with
// Claude and returns priced lines matched to the catalog. Only signed-in HQ staff may call it (Firebase ID token),
// so the Anthropic key (ANTHROPIC_API_KEY) cannot be used by anyone else.
import Anthropic from '@anthropic-ai/sdk'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { analyzeQuote, parseRequest, RequestError } from '../../src/voting/lib/quotes/analyzeServer'

function initFirebase() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT')
  initializeApp({ credential: cert(JSON.parse(raw) as Record<string, string>) })
}

/** HQ staff = an active person whose role is neither coordinator nor none (same rule as firestore.rules isHQ). */
async function isHqStaff(uid: string): Promise<boolean> {
  const snap = await getFirestore().collection('users').doc(uid).get()
  const u = snap.data() as { role?: string; active?: boolean } | undefined
  return !!u && u.active !== false && !!u.role && !['coordinator', 'none'].includes(u.role)
}

export default async (req: Request): Promise<Response> => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'no_api_key' })

  const authz = req.headers.get('authorization') ?? ''
  const idToken = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  if (!idToken) return json(401, { error: 'missing_token' })
  try { initFirebase() } catch { return json(500, { error: 'server_config' }) }
  let uid: string
  try { uid = (await getAuth().verifyIdToken(idToken)).uid } catch { return json(401, { error: 'invalid_token' }) }
  if (!(await isHqStaff(uid))) return json(403, { error: 'not_authorized' })

  try {
    const input = parseRequest(await req.text())
    const lines = await analyzeQuote(new Anthropic(), input)
    return json(200, { lines })
  } catch (e) {
    if (e instanceof RequestError) return json(e.status, { error: e.code })
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: 'rate_limited' })
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return json(503, { error: 'bad_api_key' })
    if (e instanceof Anthropic.BadRequestError) return json(400, { error: 'bad_request', detail: e.message })
    if (e instanceof Anthropic.APIError) return json(502, { error: 'api_error', detail: e.message })
    console.error('analyze-quote failed', e)
    return json(500, { error: 'internal' })
  }
}

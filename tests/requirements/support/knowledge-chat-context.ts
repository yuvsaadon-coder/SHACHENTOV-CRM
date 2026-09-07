import { handler } from '../../../netlify/functions/chat'
import { realIdTokenForUid } from './knowledge-admin'
import { invoke, makeEvent } from './knowledge-netlify-handler'

/** Invoke the real coordinator handler; record only the provider boundary. */
export async function coordinatorContext(uid: string, branchId: string) {
  const token = await realIdTokenForUid(uid)
  const original = globalThis.fetch
  const previousKey = process.env.ANTHROPIC_API_KEY
  let context: string | undefined
  process.env.ANTHROPIC_API_KEY = 'SYNTHETIC_KNOWLEDGE_PROVIDER_KEY'
  globalThis.fetch = (async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url === 'https://api.anthropic.com/v1/messages') {
      context = (JSON.parse(String(init?.body)) as { system: string }).system
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'תשובת בדיקה בלבד' }] }))
    }
    if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('External request blocked')
    return original(input, init)
  }) as typeof fetch
  try {
    const result = await invoke(handler, makeEvent({
      httpMethod: 'POST', headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ branchId, mode: 'all', messages: [{ role: 'user', content: 'מהו הידע המעודכן?' }] }),
    }))
    if (result.statusCode !== 200 || context === undefined) throw new Error(`Context request failed: ${result.statusCode}`)
    return context
  } finally {
    globalThis.fetch = original
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = previousKey
  }
}

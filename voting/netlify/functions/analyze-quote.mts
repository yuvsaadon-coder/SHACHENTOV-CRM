// Netlify function: reads one supplier quote (or one chunk of it) with Claude and returns priced lines
// matched to the catalog. The API key stays here (Netlify env var ANTHROPIC_API_KEY), never in the browser.
import Anthropic from '@anthropic-ai/sdk'
import { analyzeQuote, parseRequest, RequestError } from '../../src/lib/quotes/analyzeServer'

export default async (req: Request): Promise<Response> => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'no_api_key' })
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

/**
 * Reads the text out of every uploaded file so the HQ chatbot can use it. HQ staff only.
 *   POST {mode:'status'}                 -> {total, indexed, pending, failed, ocrPending, links}
 *   POST {mode:'run', force?: boolean}   -> {done, failed, remaining, total}
 * Scanned PDFs are transcribed by index-files-background (it needs minutes, not seconds).
 */
import type { Handler } from '@netlify/functions'
import { corsHeaders, handleOptions } from './_cors'
import { siteOriginOf } from './_fileSources'
import { indexStatus, runIndex } from './_indexRunner'
import { requireHq } from './_indexAuth'
import staticFiles from './_staticFiles.json'

export const handler: Handler = async (event) => {
  const origin = event.headers['origin']
  const cors = corsHeaders(origin)
  if (event.httpMethod === 'OPTIONS') return handleOptions(origin)
  const reply = (statusCode: number, body: unknown) => ({
    statusCode, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body),
  })
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' })

  const auth = await requireHq(event)
  if (!auth.ok) return reply(auth.status, { error: auth.error })

  const body = JSON.parse(event.body ?? '{}') as { mode?: string; force?: boolean }
  const siteOrigin = siteOriginOf(event.headers)
  try {
    if (body.mode !== 'run') return reply(200, await indexStatus(auth.db, siteOrigin, staticFiles as string[]))
    return reply(200, await runIndex(auth.db, siteOrigin, staticFiles as string[], {
      ocr: false, onlyScanned: false, force: !!body.force, budgetMs: 18_000, concurrency: 3,
    }))
  } catch (err) {
    return reply(500, { error: `אינדוקס הקבצים נכשל: ${err instanceof Error ? err.message : String(err)}` })
  }
}

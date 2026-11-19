/**
 * Background function (Netlify answers 202 at once and lets this run for up to 15 minutes):
 * transcribes the scanned PDFs with Claude and stores their text. HQ staff only.
 * Progress is visible through index-files {mode:'status'} -> ocrPending.
 */
import type { Handler } from '@netlify/functions'
import { siteOriginOf } from './_fileSources'
import { runIndex } from './_indexRunner'
import { requireHq } from './_indexAuth'
import staticFiles from './_staticFiles.json'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }
  const auth = await requireHq(event)
  if (!auth.ok) return { statusCode: auth.status, body: JSON.stringify({ error: auth.error }) }
  try {
    await runIndex(auth.db, siteOriginOf(event.headers), staticFiles as string[], {
      ocr: true, onlyScanned: true, force: false, budgetMs: 13 * 60_000, concurrency: 2,
    })
  } catch (err) {
    console.error('index-files-background failed', err)
  }
  return { statusCode: 200, body: '{}' }
}

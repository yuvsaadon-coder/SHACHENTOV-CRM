/**
 * ai-proxy — Netlify serverless function for AI agent support (Phase 2)
 * --------------------------------------------------------------------
 * Holds ANTHROPIC_API_KEY server-side. Frontend calls only this endpoint.
 * All writes require user confirmation (human-in-the-loop).
 *
 * TODO (Phase 2): implement tool-calling with:
 *   - queryTasks(filters)      → read-only Firestore query
 *   - createTaskDraft(data)    → returns draft for user approval
 *   - updateTaskStatus(id, s)  → requires user approval + audit log
 *   - generateFormat(type, ...) → produces format instance draft
 */

import { corsHeaders, handleOptions } from './_cors'
import type { Handler } from '@netlify/functions'

export const handler: Handler = async (event) => {
  const origin = event.headers['origin']
  if (event.httpMethod === 'OPTIONS') return handleOptions(origin)
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(origin), body: 'Method Not Allowed' }
  }

  // TODO: implement Anthropic Messages API call here
  return {
    statusCode: 501,
    headers: corsHeaders(origin),
    body: JSON.stringify({ error: 'AI proxy not yet implemented (Phase 2)' }),
  }
}

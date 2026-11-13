/**
 * CORS helper for Netlify functions.
 *
 * Allowed origins: the site's own Netlify URLs (set automatically by Netlify
 * as URL and DEPLOY_URL) plus localhost variants for local development.
 * Anything else gets an empty string, which the browser treats as "no match"
 * and blocks cross-origin access.
 */

const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000']

function allowedOrigins(): string[] {
  const origins = [...DEV_ORIGINS]
  if (process.env.URL) origins.push(process.env.URL.replace(/\/$/, ''))
  if (process.env.DEPLOY_URL) origins.push(process.env.DEPLOY_URL.replace(/\/$/, ''))
  return origins
}

export function corsHeaders(requestOrigin: string | undefined): Record<string, string> {
  const origin = requestOrigin ?? ''
  const matched = allowedOrigins().find((o) => o === origin) ?? ''
  return {
    'Access-Control-Allow-Origin': matched,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

export function handleOptions(requestOrigin: string | undefined): { statusCode: number; headers: Record<string, string>; body: string } {
  return { statusCode: 204, headers: corsHeaders(requestOrigin), body: '' }
}

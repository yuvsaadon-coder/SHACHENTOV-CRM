import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { assertEmulatorEnvironment, PROJECT_ID } from './support/emulator-env'

assertEmulatorEnvironment()

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const browserFirebase = path.resolve(root, 'tests', 'requirements', 'support', 'browser-firebase.ts')
const productionFirebase = path.resolve(root, 'src', 'lib', 'firebase.ts')
const productionFirebaseNoExt = path.resolve(root, 'src', 'lib', 'firebase')

function resolvesToProductionFirebase(source: string, importer?: string) {
  if (source === '/src/lib/firebase.ts' || source === '/src/lib/firebase') return true
  if (source === '../lib/firebase' || source === '../../lib/firebase' || source === './lib/firebase') return true
  if (!importer || source.startsWith('\0')) return false
  const resolved = path.resolve(path.dirname(importer), source)
  return resolved === productionFirebase || resolved === productionFirebaseNoExt
}

type HandlerResult = {
  statusCode: number
  headers?: Record<string, string | number | boolean>
  body?: string
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('error', reject)
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

async function toNetlifyEvent(req: IncomingMessage, functionPath: string) {
  const host = req.headers.host ?? '127.0.0.1:5187'
  const rawUrl = `http://${host}${req.url ?? functionPath}`
  const url = new URL(rawUrl)
  return {
    httpMethod: req.method ?? 'GET',
    headers: Object.fromEntries(
      Object.entries(req.headers).map(([key, value]) => [
        key.toLowerCase(),
        Array.isArray(value) ? value.join(',') : String(value ?? ''),
      ])
    ),
    multiValueHeaders: {},
    body: await readBody(req),
    rawUrl,
    rawQuery: url.searchParams.toString(),
    path: functionPath,
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    multiValueQueryStringParameters: Object.fromEntries(
      [...url.searchParams.keys()].map((key) => [key, url.searchParams.getAll(key)])
    ),
    isBase64Encoded: false,
  }
}

async function ensureDemoAdminApp() {
  const { initializeApp, getApps } = await import('firebase-admin/app')
  return getApps()[0] ?? initializeApp({ projectId: PROJECT_ID })
}

function isLocalUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]'
  } catch {
    return false
  }
}

function installAnthropicStub() {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === 'https://api.anthropic.com/v1/messages') {
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: 'תשובת בדיקה ממודל מקומי' }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (isLocalUrl(url)) {
      return originalFetch(input, init)
    }
    return new Response('External network blocked in requirements browser adapter', { status: 599 })
  }) as typeof fetch
}

export default defineConfig({
  root,
  plugins: [
    {
      name: 'requirements-firebase-emulator-alias',
      enforce: 'pre',
      resolveId(source, importer) {
        if (resolvesToProductionFirebase(source, importer)) return browserFirebase
        return null
      },
    },
    react(),
    tailwindcss(),
    {
      name: 'requirements-netlify-handler-adapter',
      configureServer(server) {
        installAnthropicStub()

        const invokeActualHandler = async (modulePath: string, functionPath: string, req: IncomingMessage, res: ServerResponse) => {
          await ensureDemoAdminApp()
          process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'SYNTHETIC_REQUIREMENTS_BROWSER_KEY'
          const mod = await server.ssrLoadModule(modulePath) as {
            handler: (event: unknown, context: unknown) => Promise<HandlerResult>
          }
          const result = await mod.handler(await toNetlifyEvent(req, functionPath), {})
          res.statusCode = result.statusCode
          for (const [key, value] of Object.entries(result.headers ?? {})) {
            res.setHeader(key, String(value))
          }
          res.end(result.body ?? '')
        }

        server.middlewares.use('/.netlify/functions/portal-login', async (req, res) => {
          try {
            await invokeActualHandler('/netlify/functions/portal-login.ts', '/.netlify/functions/portal-login', req, res)
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
          }
        })

        server.middlewares.use('/.netlify/functions/chat', async (req, res) => {
          try {
            await invokeActualHandler('/netlify/functions/chat.ts', '/.netlify/functions/chat', req, res)
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
          }
        })
      },
    },
  ],
  resolve: {
    alias: [
      { find: productionFirebase, replacement: browserFirebase },
      { find: productionFirebaseNoExt, replacement: browserFirebase },
      { find: '../lib/firebase', replacement: browserFirebase },
      { find: '../../lib/firebase', replacement: browserFirebase },
      { find: './lib/firebase', replacement: browserFirebase },
      { find: '/src/lib/firebase.ts', replacement: browserFirebase },
      { find: '/src/lib/firebase', replacement: browserFirebase },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5187,
    strictPort: true,
  },
})

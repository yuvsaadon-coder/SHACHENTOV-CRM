import { vi } from 'vitest'

/**
 * Stubs only the Anthropic provider transport (`api.anthropic.com`), leaving
 * every other (loopback) fetch call — Firestore/Auth/Storage emulator
 * traffic — untouched and still subject to `support/network.ts`'s guard.
 * This is the one place tests are permitted to fake a network boundary: the
 * real AI provider is never called from this offline suite.
 */
export function stubAnthropic(responder: (body: unknown) => { status: number; json?: unknown; text?: string }) {
  const previous = globalThis.fetch
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url === 'https://api.anthropic.com/v1/messages') {
      const parsedBody = init?.body ? JSON.parse(init.body as string) : undefined
      const result = responder(parsedBody)
      return new Response(
        result.json !== undefined ? JSON.stringify(result.json) : (result.text ?? ''),
        { status: result.status, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return previous(input as RequestInfo, init)
  })
}

export function anthropicTextReply(text: string) {
  return { status: 200, json: { content: [{ type: 'text', text }] } }
}

import { afterEach, beforeEach, vi } from 'vitest'

const nativeFetch = globalThis.fetch
const NativeXMLHttpRequest = globalThis.XMLHttpRequest

function loopbackUrl(input: string | URL) {
  const url = new URL(String(input), globalThis.location?.href ?? 'http://localhost')
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error(`Test blocked external request: ${url.origin}`)
  }
  return url
}

function guardTransports() {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = loopbackUrl(input instanceof Request ? input.url : input)
    return nativeFetch(input instanceof Request ? input : url, init)
  })
  if (NativeXMLHttpRequest) {
    vi.stubGlobal('XMLHttpRequest', class extends NativeXMLHttpRequest {
      override open(method: string, url: string | URL, async = true, username?: string | null, password?: string | null) {
        super.open(method, loopbackUrl(url).href, async, username, password)
      }
    })
  }
}

guardTransports()
beforeEach(guardTransports)

afterEach(() => {
  vi.unstubAllGlobals()
  guardTransports()
})

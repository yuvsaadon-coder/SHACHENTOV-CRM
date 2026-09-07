import type { Handler, HandlerEvent } from '@netlify/functions'

/**
 * Minimal `HandlerEvent` builder. Only the fields the six Netlify functions
 * under test (`portal-login`, `chat`, `hq-chat`, `hq-chat-health`,
 * `summarize-article`, `ai-proxy`) actually read: `httpMethod`, `headers`,
 * `body`. Everything else is present only because the `HandlerEvent` type
 * requires it.
 */
export function makeEvent(input: {
  httpMethod: string
  body?: string | null
  headers?: Record<string, string>
  contentType?: string | null
}): HandlerEvent {
  const headers: Record<string, string> = { ...input.headers }
  if (input.contentType !== undefined) {
    if (input.contentType !== null) headers['content-type'] = input.contentType
  } else if (input.body !== undefined && input.body !== null) {
    headers['content-type'] = 'application/json'
  }
  return {
    httpMethod: input.httpMethod,
    headers,
    multiValueHeaders: {},
    body: input.body ?? null,
    isBase64Encoded: false,
    path: '/',
    rawUrl: 'http://localhost/',
    rawQuery: '',
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
  } as unknown as HandlerEvent
}

/** Invokes a Netlify `Handler` export and normalizes its response for assertions. */
export async function invoke(handler: Handler, event: HandlerEvent) {
  const response = await handler(event, {} as never, undefined as never)
  if (!response) throw new Error('Handler returned no response')
  const headers = (response.headers ?? {}) as Record<string, string>
  let json: unknown
  try {
    json = typeof response.body === 'string' ? JSON.parse(response.body) : undefined
  } catch {
    json = undefined
  }
  return {
    statusCode: response.statusCode,
    headers,
    body: response.body as string | undefined,
    json,
  }
}

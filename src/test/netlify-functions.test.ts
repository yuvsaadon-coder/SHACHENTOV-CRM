import { describe, expect, it } from 'vitest'
import type { HandlerCallback, HandlerContext, HandlerEvent } from '@netlify/functions'
import { handler as aiProxy } from '../../netlify/functions/ai-proxy'
import { handler as chat } from '../../netlify/functions/chat'
import { handler as hqChat } from '../../netlify/functions/hq-chat'
import { handler as hqChatHealth } from '../../netlify/functions/hq-chat-health'
import { handler as portalLogin } from '../../netlify/functions/portal-login'
import { handler as summarizeArticle } from '../../netlify/functions/summarize-article'

const event = { httpMethod: 'GET', headers: {}, body: null } as HandlerEvent
const context = {} as HandlerContext
const callback: HandlerCallback = () => undefined

describe('Netlify functions', () => {
  it.each([
    ['ai-proxy', aiProxy],
    ['chat', chat],
    ['hq-chat', hqChat],
    ['portal-login', portalLogin],
    ['summarize-article', summarizeArticle],
  ])('loads %s and rejects unsupported methods', async (_name, handler) => {
    const response = await handler(event, context, callback)
    expect(response).toMatchObject({ statusCode: 405 })
  })

  it('loads the health function without requiring deployment secrets', () => {
    expect(hqChatHealth).toBeTypeOf('function')
  })
})

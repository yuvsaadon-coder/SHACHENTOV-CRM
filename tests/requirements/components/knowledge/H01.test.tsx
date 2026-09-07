/**
 * TEST-H01 — HQ chat controls / request characterization.
 *
 * Concrete subcases from TEST-PLAN.md §6.1:
 *   - TEST-H01.actual-controls-request (A)
 *   - TEST-H01.current-default-scopes (C)
 *   - TEST-H01.reply-rendering (A)
 *
 * This is a UI-only component lane. We fully mock the app Firebase boundary and
 * the chat-related hooks so no real Firebase initialization, listeners, Auth, or
 * Firestore traffic can execute from jsdom.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const h = vi.hoisted(() => ({
  firebaseUser: { getIdToken: vi.fn() },
  appUser: { uid: 'coord-test', name: 'בודק' },
  sessions: [] as unknown[],
  saveSession: vi.fn(),
  startNewSession: vi.fn(),
  loadSession: vi.fn(() => []),
  branches: [{ id: 'branch-a', name: 'סניף א' }],
}))

vi.mock('../../../../src/lib/firebase', () => ({
  auth: {},
  db: {},
  storage: {},
}))

vi.mock('../../../../src/context/AuthContext', () => ({
  useAuth: () => ({
    firebaseUser: h.firebaseUser,
    appUser: h.appUser,
  }),
}))

vi.mock('../../../../src/hooks/useChatHistory', () => ({
  useChatHistory: () => ({
    sessions: h.sessions,
    saveSession: h.saveSession,
    startNewSession: h.startNewSession,
    loadSession: h.loadSession,
  }),
}))

vi.mock('../../../../src/hooks/useBranch', () => ({
  useAllBranches: () => ({
    branches: h.branches,
  }),
}))

import { HQChatPage } from '../../../../src/pages/HQChatPage'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function getInput() {
  return screen.getByPlaceholderText('שאל שאלה על נהלים, ידע מקצועי, חפיפה...') as HTMLTextAreaElement
}

function getScopeButton(label: string) {
  return screen.getByRole('button', { name: new RegExp(label) })
}

function expectScopeActive(label: string, active: boolean) {
  const indicator = within(getScopeButton(label)).queryByText('✓')
  if (active) {
    expect(indicator).toBeInTheDocument()
  } else {
    expect(indicator).not.toBeInTheDocument()
  }
}

describe('TEST-H01 HQChatPage (component V+F lane)', () => {
  let fetchStub: ReturnType<typeof vi.fn>

  beforeEach(() => {
    h.firebaseUser.getIdToken.mockReset().mockResolvedValue('demo-id-token-abc')
    h.saveSession.mockReset()
    h.startNewSession.mockReset()
    h.loadSession.mockReset().mockReturnValue([])
    h.sessions = []
    h.branches = [{ id: 'branch-a', name: 'סניף א' }]

    fetchStub = vi.fn()
    vi.stubGlobal('fetch', fetchStub)
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('TEST-H01.actual-controls-request (A): real scope/domain/report controls drive one token-bearing request, keep the last scope selected, and persist one successful reply', async () => {
    const pending = deferred<Response>()
    fetchStub.mockImplementation(() => pending.promise)

    render(<HQChatPage />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /מקורות \(4\/5\)/ }))
    await user.click(getScopeButton('מחקר מקצועי'))
    await user.click(getScopeButton('ידע כלל-ארגוני'))
    await user.click(getScopeButton('ידע סניפי'))

    expect(screen.getByRole('button', { name: /מקורות \(1\/5\)/ })).toBeInTheDocument()
    expectScopeActive('מאגר מטה', true)
    expectScopeActive('מחקר מקצועי', false)
    expectScopeActive('ידע כלל-ארגוני', false)
    expectScopeActive('ידע סניפי', false)

    await user.click(getScopeButton('מאגר מטה'))
    expect(screen.getByRole('button', { name: /מקורות \(1\/5\)/ })).toBeInTheDocument()
    expectScopeActive('מאגר מטה', true)

    await user.click(getScopeButton('דיווחי רכזים'))
    expect(screen.getByRole('button', { name: /מקורות \(2\/5\)/ })).toBeInTheDocument()
    expectScopeActive('דיווחי רכזים', true)

    await user.click(screen.getByRole('button', { name: 'תחום ▾' }))
    await user.click(screen.getByRole('button', { name: 'כספים' }))
    expect(screen.getByRole('button', { name: 'כספים' })).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox'), 'branch-a')

    const input = getInput()
    await user.type(input, '   מה הנהל לסיכום רבעוני?   ')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1))
    expect(screen.getByText('מקליד...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'שלח' })).toBeDisabled()

    await user.type(input, 'טיוטה')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(fetchStub).toHaveBeenCalledTimes(1)

    await user.clear(input)
    await user.type(input, 'ניסיון שליחה כפולה')
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(fetchStub).toHaveBeenCalledTimes(1)

    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    const body = JSON.parse(String(init.body))

    expect(url).toBe('/.netlify/functions/hq-chat')
    expect(init.method).toBe('POST')
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers.Authorization).toMatch(/^Bearer\s+\S+/)
    expect(headers.Authorization).toContain('demo-id-token-abc')
    expect(body).toEqual({
      scopes: ['hq', 'reports'],
      domainFilter: 'FIN',
      branchFilter: 'branch-a',
      messages: [{ role: 'user', content: 'מה הנהל לסיכום רבעוני?' }],
      question: 'מה הנהל לסיכום רבעוני?',
    })

    pending.resolve(
      new Response(JSON.stringify({ reply: 'תשובה לדוגמה' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    expect(await screen.findByText('תשובה לדוגמה')).toBeInTheDocument()
    await waitFor(() => {
      expect(h.saveSession).toHaveBeenCalledTimes(1)
    })
    expect(h.saveSession).toHaveBeenCalledWith([
      { role: 'user', content: 'מה הנהל לסיכום רבעוני?' },
      { role: 'assistant', content: 'תשובה לדוגמה' },
    ])
  })

  it('TEST-H01.current-default-scopes (C): the live UI starts with exactly hq+research+global+branch active, not reports', async () => {
    render(<HQChatPage />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /מקורות \(4\/5\)/ }))

    // Characterization only: the UI bootstraps with four active scopes, while the
    // server handler has its own separate fallback when `scopes` is omitted.
    expectScopeActive('מאגר מטה', true)
    expectScopeActive('מחקר מקצועי', true)
    expectScopeActive('ידע כלל-ארגוני', true)
    expectScopeActive('ידע סניפי', true)
    expectScopeActive('דיווחי רכזים', false)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('TEST-H01.reply-rendering (A): renders the exact returned assistant text verbatim in the transcript', async () => {
    fetchStub.mockResolvedValueOnce(
      new Response(JSON.stringify({ reply: 'תשובת הדגמה קבועה 42' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    render(<HQChatPage />)
    const user = userEvent.setup()

    await user.type(getInput(), 'בדיקת תצוגת תשובה')
    await user.keyboard('{Enter}')

    // This proves verbatim UI rendering only, not semantic correctness/grounding.
    expect(await screen.findByText('תשובת הדגמה קבועה 42')).toBeInTheDocument()
  })
})

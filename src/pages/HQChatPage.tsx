import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { DOMAIN_LABELS, DOMAINS, type Domain } from '../types'
import { useChatHistory } from '../hooks/useChatHistory'
import type { ChatMessage } from '../hooks/useChatHistory'

export type ScopeKey = 'hq' | 'research' | 'global' | 'branch'

const SCOPE_OPTIONS: { key: ScopeKey; label: string; description: string }[] = [
  { key: 'hq',       label: 'מאגר מטה',       description: 'ידע ונהלים שנכתבו על ידי צוות המטה' },
  { key: 'research', label: 'מחקר מקצועי',    description: 'מאמרים ומסמכי ידע מהספרייה' },
  { key: 'global',   label: 'ידע כלל-ארגוני', description: 'פריטים משותפים שהוזנו על ידי הרכזים' },
  { key: 'branch',   label: 'ידע סניפי',      description: 'ידע שהוזן ברמת הסניפים הספציפיים' },
]

const DEFAULT_SCOPES: ScopeKey[] = ['hq', 'research', 'global']

export function HQChatPage() {
  const { firebaseUser, appUser } = useAuth()
  const [scopes, setScopes] = useState<ScopeKey[]>(DEFAULT_SCOPES)
  const [domainFilter, setDomainFilter] = useState<Domain | ''>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showDomainFilter, setShowDomainFilter] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showScopePanel, setShowScopePanel] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { sessions, saveSession, startNewSession, loadSession } =
    useChatHistory(appUser?.uid, 'hq')

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const toggleScope = (key: ScopeKey) => {
    setScopes((prev) =>
      prev.includes(key)
        ? prev.length > 1 ? prev.filter((s) => s !== key) : prev // keep at least one
        : [...prev, key]
    )
  }

  const send = async () => {
    const question = input.trim()
    if (!question || loading) return

    const userMsg: ChatMessage = { role: 'user', content: question }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    try {
      const token = await firebaseUser?.getIdToken()
      const res = await fetch('/.netlify/functions/hq-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({
          scopes,
          domainFilter: domainFilter || null,
          messages: updatedMessages,
          question,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `שגיאה: ${(err as { error?: string }).error ?? res.statusText}` },
        ])
        return
      }

      const { reply } = (await res.json()) as { reply: string }
      const withReply: ChatMessage[] = [...updatedMessages, { role: 'assistant', content: reply }]
      setMessages(withReply)
      void saveSession(withReply)
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'אירעה שגיאה בחיבור. אנא נסה שוב.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
  }

  const handleNewChat = () => {
    startNewSession()
    setMessages([])
    setShowHistory(false)
  }

  const handleLoadSession = (session: Parameters<typeof loadSession>[0]) => {
    const msgs = loadSession(session)
    setMessages(msgs)
    setShowHistory(false)
  }

  const activeScopeLabels = SCOPE_OPTIONS
    .filter((o) => scopes.includes(o.key))
    .map((o) => o.label)
    .join(' · ')

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]" dir="rtl">
      {/* Top bar */}
      <div className="px-4 py-3 bg-white border-b border-gray-100 shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-bold text-sm" style={{ color: '#141348' }}>צ׳אטבוט AI — מטה שכן טוב</h1>
            <p className="text-xs text-gray-400">שלום {appUser?.name}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Scope selector button */}
            <button
              onClick={() => setShowScopePanel((v) => !v)}
              className="text-xs px-2.5 py-1.5 border rounded-lg transition-colors flex items-center gap-1.5"
              style={{
                borderColor: showScopePanel ? '#189A9F' : '#E5E7EB',
                color: showScopePanel ? '#189A9F' : '#6B7280',
              }}
            >
              <span>📚</span>
              <span>מקורות ({scopes.length}/{SCOPE_OPTIONS.length})</span>
              <span>{showScopePanel ? '▲' : '▼'}</span>
            </button>

            <button
              onClick={() => setShowDomainFilter((v) => !v)}
              className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg transition-colors"
              style={domainFilter ? { backgroundColor: '#189A9F', color: 'white', borderColor: '#189A9F' } : { color: '#6B7280' }}
            >
              {domainFilter ? DOMAIN_LABELS[domainFilter] : 'תחום ▾'}
            </button>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="text-xs border border-gray-200 rounded px-2 py-1 transition-colors"
              style={{ color: showHistory ? '#189A9F' : '#6B7280', borderColor: showHistory ? '#189A9F' : '#E5E7EB' }}
            >
              📋 {sessions.length > 0 ? `היסטוריה (${sessions.length})` : 'היסטוריה'}
            </button>
            <button
              onClick={handleNewChat}
              className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded px-2 py-1 transition-colors"
            >
              שיחה חדשה
            </button>
          </div>
        </div>

        {/* Scope panel */}
        {showScopePanel && (
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2">
            <p className="text-xs text-gray-500 font-medium mb-2">בחר מאילו מקורות הצ׳אטבוט ישאב מידע:</p>
            <div className="grid grid-cols-2 gap-2">
              {SCOPE_OPTIONS.map((opt) => {
                const active = scopes.includes(opt.key)
                return (
                  <button
                    key={opt.key}
                    onClick={() => toggleScope(opt.key)}
                    className="flex items-start gap-2 p-2.5 rounded-lg border text-right transition-all"
                    style={{
                      backgroundColor: active ? '#EBF8F9' : 'white',
                      borderColor: active ? '#189A9F' : '#E5E7EB',
                    }}
                  >
                    <span
                      className="w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5"
                      style={{
                        backgroundColor: active ? '#189A9F' : 'white',
                        borderColor: active ? '#189A9F' : '#D1D5DB',
                      }}
                    >
                      {active && <span className="text-white text-xs leading-none">✓</span>}
                    </span>
                    <div>
                      <div className="text-xs font-medium" style={{ color: active ? '#141348' : '#374151' }}>{opt.label}</div>
                      <div className="text-xs text-gray-400 leading-snug mt-0.5">{opt.description}</div>
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-gray-400 text-left">
              {activeScopeLabels}
            </p>
          </div>
        )}

        {/* Domain filter dropdown */}
        {showDomainFilter && (
          <div className="flex flex-wrap gap-1.5 pb-1">
            <button
              onClick={() => { setDomainFilter(''); setShowDomainFilter(false) }}
              className="text-xs px-2.5 py-1 rounded-full border transition-colors"
              style={!domainFilter ? { backgroundColor: '#141348', color: 'white', borderColor: '#141348' } : { borderColor: '#E5E7EB', color: '#374151' }}
            >
              הכל
            </button>
            {DOMAINS.map((d) => (
              <button
                key={d}
                onClick={() => { setDomainFilter(d); setShowDomainFilter(false) }}
                className="text-xs px-2.5 py-1 rounded-full border transition-colors"
                style={domainFilter === d
                  ? { backgroundColor: '#141348', color: 'white', borderColor: '#141348' }
                  : { borderColor: '#E5E7EB', color: '#374151' }
                }
              >
                {DOMAIN_LABELS[d]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 max-h-48 overflow-y-auto shrink-0">
          {sessions.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">אין שיחות שמורות עדיין</p>
          ) : (
            <div className="space-y-1">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleLoadSession(s)}
                  className="w-full text-right text-xs px-3 py-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 transition-colors flex items-center justify-between gap-2"
                >
                  <span className="truncate text-gray-700">{s.title}</span>
                  <span className="text-gray-400 shrink-0">
                    {s.updatedAt.toLocaleDateString('he-IL')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-gray-400 mt-12">
            <div className="text-4xl mb-3">🤖</div>
            <p className="font-medium text-gray-600">שלום! אני הצ׳אטבוט של מטה שכן טוב.</p>
            <p className="mt-1.5 text-xs max-w-xs mx-auto leading-relaxed">
              כרגע מחובר אל: <span className="font-medium text-gray-600">{activeScopeLabels}</span>
            </p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-sm mx-auto">
              {[
                'מה תהליך גיוס מתנדבים חדשים?',
                'מה ידוע על ניהול מתנדבים בגיל מאוחר?',
                'מה תכולת קובץ החפיפה?',
                'מה ניהול סניפים בזמן מלחמה?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q) }}
                  className="text-xs text-right px-3 py-2 rounded-lg border border-gray-200 hover:border-teal-300 hover:bg-teal-50 transition-colors text-gray-600"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div
              className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed"
              style={
                msg.role === 'user'
                  ? { backgroundColor: '#141348', color: 'white', borderRadius: '18px 18px 6px 18px' }
                  : { backgroundColor: 'white', color: '#141348', borderRadius: '18px 18px 18px 6px', border: '1px solid #E5E7EB' }
              }
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-end">
            <div
              className="bg-white border border-gray-200 text-sm text-gray-400 px-4 py-2.5"
              style={{ borderRadius: '18px 18px 18px 6px' }}
            >
              מקליד...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 py-3 bg-white border-t border-gray-100 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          placeholder="שאל שאלה על נהלים, ידע מקצועי, חפיפה..."
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
          style={{ minHeight: 40 }}
        />
        <button
          onClick={() => void send()}
          disabled={loading || !input.trim()}
          className="px-4 rounded-xl text-white text-sm font-medium disabled:opacity-40 transition-opacity shrink-0"
          style={{ backgroundColor: '#189A9F' }}
        >
          שלח
        </button>
      </div>
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { DOMAIN_LABELS, DOMAINS, type Domain } from '../types'

type KnowledgeScope = 'hq' | 'all'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SCOPE_LABELS: Record<KnowledgeScope, string> = {
  hq:  'מאגר מטה',
  all: 'כל הידע',
}

export function HQChatPage() {
  const { firebaseUser, appUser } = useAuth()
  const [scope, setScope] = useState<KnowledgeScope>('all')
  const [domainFilter, setDomainFilter] = useState<Domain | ''>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showDomainFilter, setShowDomainFilter] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async () => {
    const question = input.trim()
    if (!question || loading) return

    const userMsg: Message = { role: 'user', content: question }
    setMessages((prev) => [...prev, userMsg])
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
          scope,
          domainFilter: domainFilter || null,
          messages: [...messages, userMsg],
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
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
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

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]" dir="rtl">
      {/* Top bar */}
      <div className="px-4 py-3 bg-white border-b border-gray-100 shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-bold text-sm" style={{ color: '#141348' }}>צ׳אטבוט AI — מטה שכן טוב</h1>
            <p className="text-xs text-gray-400">שלום {appUser?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Scope toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {(Object.keys(SCOPE_LABELS) as KnowledgeScope[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className="px-2.5 py-1.5 transition-colors"
                  style={{
                    backgroundColor: scope === s ? '#141348' : 'transparent',
                    color: scope === s ? 'white' : '#6B7280',
                  }}
                >
                  {SCOPE_LABELS[s]}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowDomainFilter((v) => !v)}
              className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg transition-colors"
              style={domainFilter ? { backgroundColor: '#189A9F', color: 'white', borderColor: '#189A9F' } : { color: '#6B7280' }}
            >
              {domainFilter ? DOMAIN_LABELS[domainFilter] : 'תחום ▾'}
            </button>
            <button
              onClick={() => setMessages([])}
              className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded px-2 py-1 transition-colors"
            >
              שיחה חדשה
            </button>
          </div>
        </div>

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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-gray-400 mt-12">
            <div className="text-4xl mb-3">🤖</div>
            <p className="font-medium text-gray-600">שלום! אני הצ׳אטבוט של מטה שכן טוב.</p>
            <p className="mt-1.5 text-xs max-w-xs mx-auto leading-relaxed">
              אני מחובר למאגר הידע של המטה, לספריית המחקר ולידע הרכזים.
              שאל אותי כל שאלה על תהליכים, נהלים, קבצי חפיפה או מידע מקצועי.
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

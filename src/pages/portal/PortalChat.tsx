import { useState, useRef, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import type { PortalOutletContext } from './CoordinatorPortal'

type Mode = 'branch' | 'all'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function PortalChat() {
  const { branch } = useOutletContext<PortalOutletContext>()
  const { firebaseUser } = useAuth()
  const [mode, setMode] = useState<Mode>('branch')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
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
      const res = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({
          branchId: branch.id,
          mode,
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]" dir="rtl">
      {/* Top bar */}
      <div className="px-4 py-3 bg-white border-b border-gray-100 flex items-center justify-between gap-3 shrink-0">
        <h1 className="font-bold text-sm" style={{ color: '#141348' }}>צ'אטבוט AI — שכן טוב</h1>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            <button
              onClick={() => setMode('branch')}
              className="px-2.5 py-1.5 transition-colors"
              style={{
                backgroundColor: mode === 'branch' ? '#141348' : 'transparent',
                color: mode === 'branch' ? 'white' : '#6B7280',
              }}
            >
              סניף שלי
            </button>
            <button
              onClick={() => setMode('all')}
              className="px-2.5 py-1.5 transition-colors"
              style={{
                backgroundColor: mode === 'all' ? '#141348' : 'transparent',
                color: mode === 'all' ? 'white' : '#6B7280',
              }}
            >
              כל הידע
            </button>
          </div>
          <button
            onClick={() => setMessages([])}
            className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded px-2 py-1 transition-colors"
          >
            שיחה חדשה
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-gray-400 mt-12">
            <div className="text-4xl mb-3">🤖</div>
            <p>שלום! אני כאן לעזור לך בשאלות על הסניף.</p>
            <p className="mt-1 text-xs">מצב: {mode === 'branch' ? 'ידע הסניף בלבד' : 'כל הידע הארגוני'}</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap"
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
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-2.5 text-sm text-gray-400"
              style={{ borderRadius: '18px 18px 18px 6px' }}>
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
          placeholder="שאל שאלה..."
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

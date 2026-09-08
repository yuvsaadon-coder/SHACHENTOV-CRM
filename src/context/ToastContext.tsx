import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
}

const COLORS: Record<ToastType, { bg: string; border: string; text: string }> = {
  success: { bg: '#F0FAF4', border: '#0A6B2E', text: '#0A6B2E' },
  error:   { bg: '#FEF2F2', border: '#DC2626', text: '#991B1B' },
  info:    { bg: '#EFF6FF', border: '#2563EB', text: '#1D4ED8' },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++counter.current
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {createPortal(
        <div
          role="region"
          aria-label="הודעות מערכת"
          className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
          dir="rtl"
        >
          {toasts.map((t) => {
            const c = COLORS[t.type]
            return (
              <div
                key={t.id}
                role="alert"
                aria-live="polite"
                className="flex items-start gap-2 rounded-xl px-4 py-3 shadow-lg pointer-events-auto text-sm"
                style={{ backgroundColor: c.bg, border: `1px solid ${c.border}`, color: c.text }}
              >
                <span className="font-bold shrink-0 mt-px">{ICONS[t.type]}</span>
                <span className="flex-1">{t.message}</span>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="סגור הודעה"
                  className="shrink-0 opacity-60 hover:opacity-100 transition-opacity font-bold"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

import { useState } from 'react'

export function TemplateEditor({ value, onChange, onReset, placeholders }: {
  value: string
  onChange: (v: string) => void
  onReset: () => void
  placeholders: string[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-600">
        <span>✏️ נוסח ההודעה</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2">
          <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-400">משתנים: {placeholders.map((p) => `{${p}}`).join(' ')}</span>
            <button onClick={onReset} className="text-xs text-gray-500 underline shrink-0">איפוס לברירת מחדל</button>
          </div>
        </div>
      )}
    </div>
  )
}

import { useRef, useState } from 'react'
import { uploadFile, storagePath, MAX_UPLOAD_BYTES } from '../../lib/uploadFile'
import type { HQFileRef } from '../../types'

/** A list of files where each item is either uploaded to Storage or just a link. */
export function FileLinkList({ value, onChange, folder, uid, label = 'קבצים וקישורים' }: {
  value: HQFileRef[]
  onChange: (files: HQFileRef[]) => void
  folder: string
  uid: string
  label?: string
}) {
  const [link, setLink] = useState('')
  const [pct, setPct] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const addLink = () => {
    const url = link.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) { setErr('הקישור חייב להתחיל ב-https://'); return }
    setErr('')
    onChange([...value, { name: url.replace(/^https?:\/\//i, '').slice(0, 40), url }])
    setLink('')
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > MAX_UPLOAD_BYTES) { setErr('הקובץ גדול מדי (מקסימום 25MB)'); return }
    setErr('')
    setPct(0)
    uploadFile(
      storagePath(folder, uid, f.name),
      f,
      (p) => {
        if (!p.done) { setPct(p.progress); return }
        setPct(null)
        onChange([...value, { name: p.fileName, url: p.url, uploaded: true }])
      },
      () => { setPct(null); setErr('ההעלאה נכשלה. נסה שוב.') },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {value.length > 0 && (
        <div className="flex flex-col gap-1">
          {value.map((f, i) => (
            <div key={`${f.url}-${i}`} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-2.5 py-1.5">
              <span>{f.uploaded ? '📎' : '🔗'}</span>
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="truncate text-indigo-700 hover:underline flex-1" dir="auto">{f.name}</a>
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 font-bold">×</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="url"
          dir="ltr"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
          placeholder="הדבק קישור https://..."
          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <button type="button" onClick={addLink} className="px-3 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">הוסף</button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={pct !== null} className="px-3 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
          {pct !== null ? `${pct}%` : '⬆ העלה'}
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}

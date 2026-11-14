import { useState } from 'react'
import { errMsg, go, useApp } from '../context.ts'
import { createDocument, findDuplicate, sha256Hex } from '../lib/db.ts'
import { normalizeTitle } from '../lib/card.ts'
import { ALLOWED_CONTENT_TYPES, LIMITS, contentTypeFor, emptyInput, pickInput, type ArchiveDoc, type DocInput } from '../lib/model.ts'
import DocForm from '../components/DocForm.tsx'

export default function UploadPage({ versionOfId }: { versionOfId: string | null }) {
  const { docs, user } = useApp()
  const versionOf = versionOfId ? docs.find((d) => d.id === versionOfId) ?? null : null
  const [file, setFile] = useState<File | null>(null)
  const [hash, setHash] = useState('')
  const [dup, setDup] = useState<ArchiveDoc | null>(null)
  const [fileError, setFileError] = useState('')
  const [cardName, setCardName] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [formKey, setFormKey] = useState(0)

  // גרסה חדשה: הטופס מתחיל מהתיוק של הגרסה הקודמת
  const initial: DocInput = versionOf ? { ...pickInput(versionOf), versionLabel: '', links: versionOf.links } : emptyInput()

  async function pick(f: File | undefined) {
    setFileError('')
    setDup(null)
    setFile(null)
    if (!f) return
    const ct = contentTypeFor(f.name)
    if (!ct || !(ALLOWED_CONTENT_TYPES as readonly string[]).includes(ct)) return setFileError('סוג קובץ לא נתמך. מותר: PDF, Word, PowerPoint, Excel, CSV, טקסט ותמונות.')
    if (f.size > LIMITS.fileBytes) return setFileError('הקובץ גדול מ-100MB.')
    if (f.size === 0) return setFileError('הקובץ ריק.')
    setFile(f)
    const h = await sha256Hex(f)
    setHash(h)
    setDup(findDuplicate(docs, h) ?? null)
  }

  async function submit(input: DocInput, vOf: ArchiveDoc | null) {
    if (!file || !hash) return setError('יש לבחור קובץ')
    setBusy(true)
    setError('')
    try {
      const id = await createDocument({ input, file, sha256: hash, versionOf: vOf, byEmail: user.email, onProgress: setProgress })
      go(`#/doc/${id}`)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const nameMismatch = file && cardName && normalizeTitle(cardName) !== normalizeTitle(file.name)

  return (
    <div style={{ maxWidth: 980 }}>
      <h1>{versionOf ? `גרסה חדשה: ${versionOf.title}` : 'העלאת מסמך'}</h1>
      <div className="card">
        <h2>1. הקובץ</h2>
        <div
          className={`dropzone${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]) }}
        >
          {file ? <b>{file.name}</b> : 'גררו לכאן קובץ, או'}{' '}
          <label className="btn" style={{ display: 'inline-flex', fontWeight: 400 }}>
            {file ? 'החלפה' : 'בחירת קובץ'}
            <input type="file" hidden onChange={(e) => pick(e.target.files?.[0])} accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg" />
          </label>
          {file && <div className="hint">{(file.size / 1024 / 1024).toFixed(1)}MB</div>}
        </div>
        {fileError && <div className="alert error" style={{ marginTop: '.7em' }}>{fileError}</div>}
        {dup && (
          <div className="alert warn" style={{ marginTop: '.7em' }}>
            קובץ זהה בדיוק כבר קיים בארכיון: <a href={`#/doc/${dup.id}`}>{dup.title}</a>. אין צורך להעלות אותו שוב.
          </div>
        )}
        {nameMismatch && (
          <div className="alert warn" style={{ marginTop: '.7em' }}>
            הכרטיס נוצר עבור הקובץ "{cardName}", אבל נבחר הקובץ "{file?.name}". ודאו שזה הקובץ הנכון.
          </div>
        )}
        <p className="hint">
          טיפ: שלחו את המסמך לסקיל "תיוק אשכולות" ב-Claude, אשרו את ההצעה, והדביקו את הכרטיס למטה.
        </p>
      </div>

      <h2 style={{ marginTop: '1em' }}>2. התיוק</h2>
      <DocForm
        key={formKey}
        initial={initial}
        withVersionOf
        initialVersionOf={versionOf}
        submitLabel={dup ? 'שמירה בכל זאת' : 'שמירה בארכיון'}
        busy={busy}
        onSubmit={submit}
        onCardOriginalName={setCardName}
      />
      {busy && progress > 0 && progress < 100 && (
        <div className="progress" style={{ marginTop: '.7em' }}><div style={{ width: `${progress}%` }} /></div>
      )}
      {error && <div className="alert error" style={{ marginTop: '.7em' }}>{error}</div>}
      {!busy && error && <button className="link" onClick={() => setFormKey(formKey + 1)}>איפוס הטופס</button>}
    </div>
  )
}

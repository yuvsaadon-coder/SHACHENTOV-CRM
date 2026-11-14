import { useState } from 'react'
import { errMsg, go, useApp } from '../context.ts'
import { updateDocument } from '../lib/db.ts'
import { pickInput, type DocInput } from '../lib/model.ts'
import DocForm from '../components/DocForm.tsx'

export default function EditPage({ id }: { id: string }) {
  const { docs, user } = useApp()
  const d = docs.find((x) => x.id === id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!d) return <div className="alert warn">המסמך לא נמצא.</div>

  async function submit(input: DocInput) {
    if (!d) return
    setBusy(true)
    setError('')
    try {
      await updateDocument(d, input, user.email)
      go(`#/doc/${d.id}`)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <div className="row" style={{ marginBottom: '.8em' }}>
        <a href={`#/doc/${d.id}`}>→ חזרה למסמך</a>
      </div>
      <h1>עריכה / תיוק מחדש: {d.title}</h1>
      <p className="muted">כל שינוי נשמר ביומן ההיסטוריה של המסמך, עם שם המשנה והשעה. הקובץ עצמו לא משתנה. לקובץ מעודכן העלו "גרסה חדשה".</p>
      {error && <div className="alert error">{error}</div>}
      <DocForm initial={pickInput(d)} excludeId={d.id} submitLabel="שמירת השינויים" busy={busy} onSubmit={submit} />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { errMsg, fmtDate, fmtDateTime, go, useApp } from '../context.ts'
import { deleteDocumentForever, downloadFile, loadHistory, makeCurrent, setArchived } from '../lib/db.ts'
import { canEdit, type HistoryEntry } from '../lib/model.ts'
import { backlinks, familyOf } from '../lib/search.ts'
import { MULTI_DIMS, folderLabel, linkTypeLabel, valueLabel } from '../lib/taxonomy.ts'

const ACTION_LABELS: Record<string, string> = {
  create: 'נוצר',
  update: 'עודכן / תויק מחדש',
  archive: 'הועבר לארכיון',
  restore: 'שוחזר',
  'new-version': 'הועלה כגרסה חדשה',
  superseded: 'הוחלף בגרסה חדשה',
}

export default function DocPage({ id }: { id: string }) {
  const { tax, docs, user } = useApp()
  const d = docs.find((x) => x.id === id)
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setHistory(null)
    loadHistory(id).then(setHistory).catch((e) => setError(errMsg(e)))
  }, [id, d?.rev])

  if (!d) return <div className="alert warn">המסמך לא נמצא, או שאין לך הרשאה לצפות בו.</div>

  const family = familyOf(docs, d.familyId)
  const incoming = backlinks(docs, d.id)
  const title = (tid: string) => docs.find((x) => x.id === tid)?.title ?? '(מסמך לא זמין)'
  const editor = canEdit(user.role)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const download = () => run(() => downloadFile(d))

  const fmtVal = (field: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—'
    if (field === 'folder') return folderLabel(tax, String(v))
    if (Array.isArray(v)) {
      if (field === 'links') return (v as { type: string; to: string }[]).map((l) => `${linkTypeLabel(tax, l.type)} ${title(l.to)}`).join('; ') || '—'
      return v.map((k) => valueLabel(tax, field, String(k))).join(', ') || '—'
    }
    if (typeof v === 'boolean') return v ? 'כן' : 'לא'
    if (tax.dimensions[field]) return valueLabel(tax, field, String(v))
    return String(v)
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: '.8em' }}>
        <a href="#/">→ חזרה לארכיון</a>
      </div>
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div className="row">
          <h1 style={{ margin: 0 }}>{d.title}</h1>
          {d.versionLabel && <span className="tag">{d.versionLabel}</span>}
          {!d.isCurrent && <span className="tag old">גרסה קודמת</span>}
          {d.archived && <span className="tag old">בארכיון</span>}
          {d.restricted && <span className="tag restricted">לא להפצה</span>}
        </div>
        {d.summary && <p>{d.summary}</p>}
        <div className="row">
          {d.file && <button className="primary" onClick={download} disabled={busy}>הורדת הקובץ</button>}
          {editor && <button onClick={() => go(`#/edit/${d.id}`)}>עריכה / תיוק מחדש</button>}
          {editor && d.isCurrent && <button onClick={() => go(`#/upload?versionOf=${d.id}`)}>העלאת גרסה חדשה</button>}
          {editor && !d.isCurrent && (
            <button onClick={() => run(() => makeCurrent(d, family, user.email))} disabled={busy}>הפוך לגרסה הנוכחית</button>
          )}
          {editor && (
            <button onClick={() => run(() => setArchived(d, !d.archived, user.email))} disabled={busy}>
              {d.archived ? 'שחזור מהארכיון' : 'העברה לארכיון'}
            </button>
          )}
          {user.role === 'admin' && (
            <button
              className="danger"
              disabled={busy}
              onClick={() => {
                if (confirm(`למחוק לצמיתות את "${d.title}" ואת הקובץ שלו? הפעולה לא ניתנת לביטול.`))
                  run(async () => { await deleteDocumentForever(d); go('#/') })
              }}
            >
              מחיקה לצמיתות
            </button>
          )}
        </div>
      </div>

      <div className="grid2" style={{ marginTop: '1em', alignItems: 'start' }}>
        <div className="card">
          <h2>תיוק</h2>
          <dl className="meta">
            <dt>תיקייה</dt><dd>{folderLabel(tax, d.folder)}</dd>
            <dt>סוג</dt><dd>{valueLabel(tax, 'docType', d.docType)}</dd>
            <dt>סטטוס</dt><dd>{valueLabel(tax, 'status', d.status)}</dd>
            <dt>גוף מפרסם</dt><dd>{valueLabel(tax, 'publisher', d.publisher)}</dd>
            {MULTI_DIMS.filter((dim) => d[dim].length).map((dim) => (
              <FragmentRow key={dim} label={tax.dimensions[dim].label}>
                {d[dim].map((k) => <span className="tag" key={k}>{valueLabel(tax, dim, k)}</span>)}
              </FragmentRow>
            ))}
            {d.meetingDate && <><dt>תאריך מפגש</dt><dd>{d.meetingDate}</dd></>}
            {d.year && <><dt>שנה</dt><dd>{d.year}</dd></>}
            <dt>קובץ</dt><dd>{d.file ? `${d.file.name} (${(d.file.size / 1024 / 1024).toFixed(1)}MB)` : '—'}</dd>
            {d.originalName && d.originalName !== d.file?.name && <><dt>שם מקורי</dt><dd>{d.originalName}</dd></>}
            <dt>הועלה</dt><dd>{d.createdBy} · {fmtDate(d.createdAt)}</dd>
            <dt>עודכן</dt><dd>{d.updatedBy} · {fmtDate(d.updatedAt)}</dd>
          </dl>
        </div>

        <div>
          <div className="card">
            <h2>קישורים</h2>
            {d.links.length === 0 && incoming.length === 0 && <p className="muted">אין קישורים.</p>}
            <ul>
              {d.links.map((l) => (
                <li key={`${l.type}-${l.to}`}>{linkTypeLabel(tax, l.type)}: <a href={`#/doc/${l.to}`}>{title(l.to)}</a></li>
              ))}
              {incoming.map((b) => (
                <li key={`in-${b.doc.id}-${b.type}`}>{linkTypeLabel(tax, b.type, true)}: <a href={`#/doc/${b.doc.id}`}>{b.doc.title}</a></li>
              ))}
            </ul>
          </div>

          {family.length > 1 && (
            <div className="card">
              <h2>גרסאות</h2>
              <ul>
                {family.map((v) => (
                  <li key={v.id}>
                    {v.id === d.id ? <b>{v.title}</b> : <a href={`#/doc/${v.id}`}>{v.title}</a>}{' '}
                    {v.versionLabel && <span className="tag">{v.versionLabel}</span>}
                    {v.isCurrent && <span className="tag">נוכחית</span>}{' '}
                    <span className="muted">{fmtDate(v.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <h2>היסטוריית שינויים</h2>
            {!history && <p className="muted">טוען…</p>}
            <ul className="history">
              {history?.map((h) => (
                <li key={h.rev}>
                  <b>{ACTION_LABELS[h.action] ?? h.action}</b> · {h.by} · <span className="muted">{fmtDateTime(h.at)}</span>
                  {h.action !== 'create' && h.action !== 'new-version' && Object.keys(h.changes).length > 0 && (
                    <ul>
                      {Object.entries(h.changes).map(([field, c]) => (
                        <li key={field}>
                          <code>{tax.dimensions[field]?.label ?? FIELD_LABELS[field] ?? field}</code>: {fmtVal(field, c.from)} ← {fmtVal(field, c.to)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

const FIELD_LABELS: Record<string, string> = {
  title: 'כותרת', folder: 'תיקייה', meetingDate: 'תאריך מפגש', year: 'שנה', summary: 'תקציר',
  restricted: 'לא להפצה', versionLabel: 'תווית גרסה', links: 'קישורים', isCurrent: 'גרסה נוכחית',
  archived: 'בארכיון', supersededBy: 'הוחלף ע"י',
}

function FragmentRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

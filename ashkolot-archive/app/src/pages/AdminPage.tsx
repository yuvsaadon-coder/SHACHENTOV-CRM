import { useEffect, useState } from 'react'
import skillMd from '../../../skill/ashkolot-filing/SKILL.md?raw'
import mappingMd from '../../../skill/ashkolot-filing/references/mapping-rules.md?raw'
import seedCatalog from '../../../seed/catalog.json'
import { errMsg, fmtDateTime, useApp } from '../context.ts'
import { listUsers, loadRecentActivity, removeUser, saveTaxonomy, upsertUser } from '../lib/db.ts'
import type { AppUser, HistoryEntry, Role } from '../lib/model.ts'
import { toCsv } from '../lib/search.ts'
import { buildSkillZip } from '../lib/skillgen.ts'
import { isValidKey, type TaxValue, type Taxonomy } from '../lib/taxonomy.ts'

function downloadBlob(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export default function AdminPage() {
  const [tab, setTab] = useState<'users' | 'taxonomy' | 'tools' | 'activity'>('users')
  return (
    <div>
      <h1>ניהול</h1>
      <div className="row" style={{ marginBottom: '1em' }}>
        {([['users', 'משתמשים והרשאות'], ['taxonomy', 'מבנה התיוק'], ['tools', 'סקיל וייצוא'], ['activity', 'פעילות אחרונה']] as const).map(([k, l]) => (
          <button key={k} className={tab === k ? 'primary' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'users' && <Users />}
      {tab === 'taxonomy' && <TaxonomyEditor />}
      {tab === 'tools' && <Tools />}
      {tab === 'activity' && <Activity />}
    </div>
  )
}

function Users() {
  const { user } = useApp()
  const [users, setUsers] = useState<AppUser[] | null>(null)
  const [draft, setDraft] = useState<AppUser>({ email: '', role: 'editor', active: true, name: '' })
  const [error, setError] = useState('')
  const reload = () => listUsers().then(setUsers).catch((e) => setError(errMsg(e)))
  useEffect(() => { reload() }, [])

  const save = async (u: AppUser) => {
    setError('')
    try {
      await upsertUser(u, user.email)
      await reload()
      return true
    } catch (e) {
      setError(errMsg(e))
      return false
    }
  }

  return (
    <div className="card">
      <h2>משתמשים</h2>
      <p className="hint">
        רק מי שמופיע כאן ומסומן כפעיל יכול להיכנס. <b>צפייה</b>: עיון והורדה (בלי מסמכים "לא להפצה"). <b>עורך/ת</b>: העלאה, עריכה ותיוק מחדש.
        <b> מנהל/ת</b>: גם משתמשים, מבנה תיוק ומחיקה.
      </p>
      {error && <div className="alert error">{error}</div>}
      <table className="docs">
        <thead><tr><th>מייל</th><th>שם</th><th>תפקיד</th><th>פעיל</th><th /></tr></thead>
        <tbody>
          {users?.map((u) => (
            <tr key={u.email}>
              <td dir="ltr" style={{ textAlign: 'right' }}>{u.email}</td>
              <td>{u.name}</td>
              <td>
                <select value={u.role} disabled={u.email === user.email} onChange={(e) => save({ ...u, role: e.target.value as Role })} style={{ width: 'auto' }}>
                  <option value="viewer">צפייה</option>
                  <option value="editor">עורך/ת</option>
                  <option value="admin">מנהל/ת</option>
                </select>
              </td>
              <td><input type="checkbox" style={{ width: 'auto' }} checked={u.active} disabled={u.email === user.email} onChange={(e) => save({ ...u, active: e.target.checked })} /></td>
              <td>
                {u.email !== user.email && (
                  <button className="link" onClick={() => confirm(`להסיר את ${u.email}?`) && removeUser(u.email).then(reload).catch((e) => setError(errMsg(e)))}>הסרה</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 style={{ marginTop: '1em' }}>הוספת משתמש</h3>
      <div className="row">
        <input dir="ltr" placeholder="email@example.org" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} style={{ maxWidth: 280 }} />
        <input placeholder="שם" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ maxWidth: 200 }} />
        <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })} style={{ width: 'auto' }}>
          <option value="viewer">צפייה</option>
          <option value="editor">עורך/ת</option>
          <option value="admin">מנהל/ת</option>
        </select>
        <button className="primary" disabled={!draft.email} onClick={async () => { if (await save(draft)) setDraft({ email: '', role: 'editor', active: true, name: '' }) }}>הוספה</button>
      </div>
    </div>
  )
}

type Section = { id: string; label: string; get: (t: Taxonomy) => TaxValue[]; set: (t: Taxonomy, v: TaxValue[]) => Taxonomy }

function TaxonomyEditor() {
  const { tax, user } = useApp()
  const [draft, setDraft] = useState<Taxonomy>(() => structuredClone(tax))
  const [sectionId, setSectionId] = useState('folders')
  const [newKey, setNewKey] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const sections: Section[] = [
    { id: 'folders', label: 'תיקיות', get: (t) => t.folders, set: (t, v) => ({ ...t, folders: v }) },
    ...Object.entries(tax.dimensions).map(([dim, def]) => ({
      id: dim,
      label: def.label,
      get: (t: Taxonomy) => t.dimensions[dim].values,
      set: (t: Taxonomy, v: TaxValue[]) => ({ ...t, dimensions: { ...t.dimensions, [dim]: { ...t.dimensions[dim], values: v } } }),
    })),
    {
      id: 'linkTypes',
      label: 'סוגי קישור',
      get: (t) => t.linkTypes.map((l) => ({ key: l.key, label: l.label, hint: l.inverse, active: (l as TaxValue).active })),
      set: (t, v) => ({ ...t, linkTypes: v.map((x) => ({ key: x.key, label: x.label, inverse: x.hint ?? x.label, ...(x.active === false ? { active: false } : {}) })) }),
    },
  ]
  const section = sections.find((s) => s.id === sectionId)!
  const values = section.get(draft)
  const existingKeys = new Set(section.get(tax).map((v) => v.key))
  const dirty = JSON.stringify(draft) !== JSON.stringify(tax)

  const patch = (i: number, p: Partial<TaxValue>) => setDraft(section.set(draft, values.map((v, j) => (j === i ? { ...v, ...p } : v))))

  const add = () => {
    const key = newKey.trim().toLowerCase()
    if (!isValidKey(key)) return setMsg({ kind: 'error', text: 'מפתח: אותיות לטיניות קטנות, ספרות ומקף בלבד (למשל housing)' })
    if (values.some((v) => v.key === key)) return setMsg({ kind: 'error', text: 'המפתח כבר קיים' })
    if (!newLabel.trim()) return setMsg({ kind: 'error', text: 'חסרה תווית' })
    setDraft(section.set(draft, [...values, { key, label: newLabel.trim() }]))
    setNewKey('')
    setNewLabel('')
    setMsg(null)
  }

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await saveTaxonomy(tax, draft, user.email)
      setMsg({ kind: 'ok', text: 'מבנה התיוק נשמר. זכרו להוריד סקיל מעודכן ולהפיץ לצוות (לשונית "סקיל וייצוא").' })
    } catch (e) {
      setMsg({ kind: 'error', text: errMsg(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h2>מבנה התיוק</h2>
      <p className="hint">
        אפשר לשנות תוויות, להוסיף ערכים ולהשבית ערכים. אי אפשר למחוק ערך שכבר קיים, כי מסמכים ישנים עלולים להשתמש בו. ערך מושבת לא יוצע יותר, אבל יישאר על מסמכים קיימים.
        המפתח (באנגלית) קבוע לתמיד, ורק התווית משתנה.
      </p>
      <div className="row" style={{ marginBottom: '1em' }}>
        <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} style={{ width: 'auto' }}>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <span className="spacer" />
        {dirty && <button onClick={() => setDraft(structuredClone(tax))}>ביטול שינויים</button>}
        <button className="primary" onClick={save} disabled={!dirty || busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
      <table className="docs">
        <thead><tr><th>מפתח</th><th>תווית</th><th>{sectionId === 'linkTypes' ? 'שם בכיוון ההפוך' : 'הסבר / הערה'}</th><th>פעיל</th></tr></thead>
        <tbody>
          {values.map((v, i) => (
            <tr key={v.key}>
              <td dir="ltr" style={{ textAlign: 'right' }}><code>{v.key}</code>{!existingKeys.has(v.key) && <span className="tag">חדש</span>}</td>
              <td><input value={v.label} onChange={(e) => patch(i, { label: e.target.value })} /></td>
              <td><input value={(sectionId === 'folders' || sectionId === 'linkTypes' ? v.hint : v.note) ?? ''} onChange={(e) => patch(i, sectionId === 'folders' || sectionId === 'linkTypes' ? { hint: e.target.value } : { note: e.target.value })} /></td>
              <td><input type="checkbox" style={{ width: 'auto' }} checked={v.active !== false} onChange={(e) => patch(i, { active: e.target.checked })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 style={{ marginTop: '1em' }}>הוספת ערך ל"{section.label}"</h3>
      <div className="row">
        <input dir="ltr" placeholder="key" value={newKey} onChange={(e) => setNewKey(e.target.value)} style={{ maxWidth: 180 }} />
        <input placeholder="תווית בעברית" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} style={{ maxWidth: 280 }} />
        <button onClick={add}>הוספה לטיוטה</button>
      </div>
    </div>
  )
}

function Tools() {
  const { tax, docs } = useApp()
  const visible = docs.filter((d) => d.isCurrent && !d.archived && !d.restricted)
  const skill = () => {
    const zip = buildSkillZip({ skillMd, mappingMd, precedents: seedCatalog.entries }, tax, visible.map((d) => ({ seq: d.seq, title: d.title, folder: d.folder, docType: d.docType, year: d.year, versionLabel: d.versionLabel, forum: d.forum })))
    downloadBlob(zip as BlobPart, 'ashkolot-filing.zip', 'application/zip')
  }
  return (
    <div className="card">
      <h2>סקיל התיוק</h2>
      <p>
        הסקיל נבנה מתוך מבנה התיוק הנוכחי ורשימת המסמכים בארכיון ({visible.length} מסמכים). מסמכים שמסומנים "לא להפצה" לא נכללים בו.
        מומלץ להוריד גרסה חדשה ולהפיץ אותה לצוות אחרי כל שינוי במבנה התיוק, ומדי פעם כדי לעדכן את רשימת המסמכים.
      </p>
      <button className="primary" onClick={skill}>הורדת סקיל מעודכן (zip)</button>
      <p className="hint">התקנה: Claude ← Settings ← Capabilities ← Skills ← Upload skill ← בחירת קובץ ה-zip.</p>
      <h2 style={{ marginTop: '1.5em' }}>ייצוא קטלוג</h2>
      <p>קובץ CSV עם כל הרשומות (כולל גרסאות קודמות ומסמכים בארכיון), לגיבוי או לעבודה באקסל.</p>
      <button onClick={() => downloadBlob(toCsv(docs, tax), `ashkolot-catalog-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8')}>הורדת CSV</button>
    </div>
  )
}

function Activity() {
  const { docs } = useApp()
  const [items, setItems] = useState<(HistoryEntry & { docId: string })[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { loadRecentActivity().then(setItems).catch((e) => setError(errMsg(e))) }, [])
  const title = (id: string) => docs.find((d) => d.id === id)?.title ?? id
  return (
    <div className="card">
      <h2>100 הפעולות האחרונות</h2>
      {error && <div className="alert error">{error}</div>}
      {!items && !error && <p className="muted">טוען…</p>}
      <table className="docs">
        <thead><tr><th>מתי</th><th>מי</th><th>פעולה</th><th>מסמך</th><th>שדות</th></tr></thead>
        <tbody>
          {items?.map((h) => (
            <tr key={`${h.docId}-${h.rev}`}>
              <td className="muted">{fmtDateTime(h.at)}</td>
              <td>{h.by}</td>
              <td>{h.action}</td>
              <td><a href={`#/doc/${h.docId}`}>{title(h.docId)}</a></td>
              <td className="muted">{Object.keys(h.changes).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

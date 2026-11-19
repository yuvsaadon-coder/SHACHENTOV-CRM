import { useState } from 'react'
import seedCatalog from '../../../seed/catalog.json'
import { errMsg, useApp } from '../context.ts'
import { existingIds, importEntry } from '../lib/db.ts'
import { entryToInput, planImport, stableDocId, type CatalogEntry, type ImportPlan } from '../lib/importer.ts'
import { docCode } from '../lib/model.ts'
import { folderLabel } from '../lib/taxonomy.ts'

const ENTRIES = seedCatalog.entries as unknown as CatalogEntry[]

/**
 * ייבוא החומר הקיים: בוחרים את התיקייה (או את הקבצים), רואים מה ייובא ולאן, מאשרים - והאתר מייבא.
 * כל קובץ נשמר בדיוק כפי שהוא. מה שכבר בארכיון מדולג, כך שאפשר להריץ שוב בבטחה.
 */
export default function ImportPanel() {
  const { tax, user } = useApp()
  const [plan, setPlan] = useState<ImportPlan<File> | null>(null)
  const [ids, setIds] = useState<Map<string, string>>(new Map())
  const [already, setAlready] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState<string[]>([])
  const [errors, setErrors] = useState<string[]>([])

  async function pick(list: FileList | null) {
    if (!list) return
    setDone([])
    setErrors([])
    const p = planImport(ENTRIES, [...list])
    const map = new Map<string, string>()
    for (const e of ENTRIES) map.set(e.file, await stableDocId(e.file))
    setIds(map)
    setAlready(await existingIds(p.matched.map((m) => map.get(m.entry.file)!)))
    setPlan(p)
  }

  async function run() {
    if (!plan) return
    setRunning(true)
    const present = new Set(already)
    const familyHead = new Map<string, string>()
    // ראש משפחת גרסאות: חבר משפחה שכבר בארכיון, אחרת הראשון שמיובא עכשיו
    for (const e of ENTRIES) {
      const id = ids.get(e.file)!
      if (e.family && !familyHead.has(e.family) && present.has(id)) familyHead.set(e.family, id)
    }
    for (const { entry: e, file } of plan.matched) {
      const id = ids.get(e.file)!
      if (present.has(id)) continue
      if (e.family && !familyHead.has(e.family)) familyHead.set(e.family, id)
      try {
        await importEntry({
          id,
          seq: e.seq,
          input: entryToInput(e, (f) => ids.get(f)),
          familyId: e.family ? familyHead.get(e.family)! : id,
          isCurrent: e.current !== false,
          file,
          rationale: e.rationale,
          byEmail: user.email,
        })
        present.add(id)
        setDone((d) => [...d, `${docCode(e.seq)} ${e.title}`])
      } catch (err) {
        setErrors((x) => [...x, `${docCode(e.seq)} ${e.title}: ${errMsg(err)}`])
      }
    }
    setAlready(present)
    setRunning(false)
  }

  const toImport = plan ? plan.matched.filter((m) => !already.has(ids.get(m.entry.file)!)) : []

  return (
    <div className="card">
      <h2>ייבוא החומר הקיים</h2>
      <p>
        בחרו את התיקייה עם הקבצים (למשל תיקיית ה-Drive שהורדתם כ-zip ופרסתם). האתר יתאים כל קובץ לקטלוג ({ENTRIES.length} מסמכים
        מסווגים, כל אחד עם מזהה ונימוק), יציג מה ייובא ולאן, ורק אחרי אישור ייבא.
      </p>
      <p className="hint">הקבצים נשמרים בדיוק כפי שהם, בלי שינוי תוכן, עיצוב או שם. מה שכבר בארכיון מדולג, אז אפשר להריץ שוב בבטחה.</p>
      <div className="row">
        <label className="btn">
          בחירת תיקייה
          <input type="file" hidden multiple {...({ webkitdirectory: '' } as Record<string, string>)} onChange={(e) => pick(e.target.files)} />
        </label>
        <label className="btn">
          או בחירת קבצים
          <input type="file" hidden multiple onChange={(e) => pick(e.target.files)} />
        </label>
      </div>

      {plan && (
        <>
          <div className="alert ok" style={{ marginTop: '1em' }}>
            נמצאו {plan.matched.length} מסמכים מהקטלוג · {already.size} כבר בארכיון · <b>{toImport.length} לייבוא</b>
            {plan.notFound.length > 0 && ` · ${plan.notFound.length} מהקטלוג לא נמצאו בתיקייה`}
            {plan.unknown.length > 0 && ` · ${plan.unknown.length} קבצים שלא בקטלוג (לתייק דרך הסקיל)`}
          </div>
          {toImport.length > 0 && (
            <details open>
              <summary>מה ייובא ולאן ({toImport.length})</summary>
              <table className="docs">
                <thead><tr><th>מזהה</th><th>כותרת</th><th>תיקייה</th><th>קובץ (ללא שינוי)</th></tr></thead>
                <tbody>
                  {toImport.map(({ entry: e, file }) => (
                    <tr key={e.seq}>
                      <td><span className="code">{docCode(e.seq)}</span></td>
                      <td>{e.title}{e.restricted && <span className="tag restricted">לא להפצה</span>}</td>
                      <td>{folderLabel(tax, e.folder)}</td>
                      <td className="muted">{file.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          {plan.notFound.length > 0 && (
            <details>
              <summary>מהקטלוג ולא נמצאו בתיקייה ({plan.notFound.length})</summary>
              <ul>{plan.notFound.map((e) => <li key={e.seq}>{docCode(e.seq)} {e.title} <span className="muted">({e.file.split('#')[0]})</span></li>)}</ul>
            </details>
          )}
          {plan.unknown.length > 0 && (
            <details>
              <summary>קבצים שלא בקטלוג ({plan.unknown.length})</summary>
              <ul>{plan.unknown.map((f) => <li key={f.name + f.size}>{f.name}</li>)}</ul>
            </details>
          )}
          <div className="row" style={{ marginTop: '1em' }}>
            <button className="primary" disabled={running || toImport.length === 0} onClick={run}>
              {running ? `מייבא… ${done.length}/${toImport.length + done.length}` : `אישור וייבוא ${toImport.length} מסמכים`}
            </button>
          </div>
        </>
      )}
      {!running && done.length > 0 && <div className="alert ok" style={{ marginTop: '1em' }} role="status">{`הייבוא הסתיים: יובאו ${done.length} מסמכים${errors.length ? `, ${errors.length} נכשלו` : ''}.`}</div>}
      {errors.length > 0 && <div className="alert error">{'לא יובאו:\n' + errors.join('\n')}</div>}
    </div>
  )
}

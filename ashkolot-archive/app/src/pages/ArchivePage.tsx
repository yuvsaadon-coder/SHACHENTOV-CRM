import { useMemo, useState } from 'react'
import { fmtDate, useApp, useRoute } from '../context.ts'
import { docCode } from '../lib/model.ts'
import { emptyFilters, filterDocs, filtersFromParams, filtersToParams, folderCounts, type Filters } from '../lib/search.ts'
import { MULTI_DIMS, SINGLE_DIMS, folderLabel, valueLabel } from '../lib/taxonomy.ts'
import TagPicker from '../components/TagPicker.tsx'

const FILTER_KEY = 'ashkolot.filters'

function loadFilters(): Filters {
  try {
    const raw = sessionStorage.getItem(FILTER_KEY)
    return raw ? { ...emptyFilters(), ...JSON.parse(raw) } : emptyFilters()
  } catch {
    return emptyFilters()
  }
}

/** תצוגות מוכנות: הדרך שבה הצוות מחפש בפועל - קודם לפי צוות, אחר כך לפי שלב */
const VIEWS: { label: string; params: string }[] = [
  { label: 'צוות שירותים חברתיים', params: 'forum=social' },
  { label: 'צוות תכנון אזורי', params: 'forum=planning' },
  { label: 'צוות מבני', params: 'forum=structural' },
  { label: 'ועדת מדיניות', params: 'forum=policy-committee' },
  { label: 'כל המפגשים', params: 'f=09' },
  { label: 'כל החומרים החיצוניים', params: 'f=02' },
  { label: 'מתחים והכרעות', params: 'f=06' },
  { label: 'דורש אימות', params: 'q=לאימות' },
]

export default function ArchivePage() {
  const { tax, docs } = useApp()
  const route = useRoute()
  // סינון מהכתובת (קישור משותף) גובר על הסינון האחרון שנשמר
  const [f, setF] = useState<Filters>(() => ([...route.params.keys()].length ? filtersFromParams(route.params, tax) : loadFilters()))
  const [openDims, setOpenDims] = useState(false)
  const [copied, setCopied] = useState(false)

  const update = (next: Filters) => {
    setF(next)
    sessionStorage.setItem(FILTER_KEY, JSON.stringify(next))
    const qs = filtersToParams(next).toString()
    window.history.replaceState(null, '', qs ? `#/?${qs}` : '#/')
  }
  const applyView = (params: string) => update(filtersFromParams(new URLSearchParams(params), tax))
  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const results = useMemo(() => filterDocs(docs, f, tax), [docs, f, tax])
  const counts = useMemo(() => folderCounts(docs), [docs])
  const activeTagCount = Object.values(f.tags).reduce((n, v) => n + v.length, 0)

  // עץ תיקיות בשני אזורים נפרדים: תוצרי הצוות / חומרים חיצוניים
  const areas = tax.areas ?? [{ key: 'team' as const, label: 'תוצרי הצוות' }, { key: 'external' as const, label: 'חומרים חיצוניים' }]
  const active = tax.folders.filter((x) => x.active !== false)
  const areaFolders = (area: string) => active.filter((fo) => (fo.area ?? (fo.key.startsWith('02') ? 'external' : 'team')) === area)
  const shortLabel = (label: string) => label.split(' / ').slice(-1)[0]

  return (
    <div className="layout">
      <aside className="card">
        <h3>תיקיות</h3>
        <ul className="folders">
          <li>
            <button className={!f.folder ? 'active' : ''} onClick={() => update({ ...f, folder: null })}>
              <span>כל הארכיון</span>
              <span className="count">{docs.filter((d) => d.isCurrent && !d.archived).length}</span>
            </button>
          </li>
          {areas.map((a) => (
            <li key={a.key}>
              <div className="area-title" title={a.hint}>{a.label}</div>
              <ul className="folders">
                {areaFolders(a.key).map((fo) => (
                  <li key={fo.key}>
                    <button className={f.folder === fo.key ? 'active' : ''} onClick={() => update({ ...f, folder: fo.key })} title={fo.hint}>
                      <span>{fo.key.replace('-', '.')} {shortLabel(fo.label)}</span>
                      <span className="count">{counts[fo.key] ?? 0}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </aside>

      <section>
        <div className="views" aria-label="תצוגות מוכנות">
          {VIEWS.map((v) => (
            <a key={v.label} href={`#/?${v.params}`} onClick={(e) => { e.preventDefault(); applyView(v.params) }}>{v.label}</a>
          ))}
        </div>
        <div className="toolbar">
          <input type="search" placeholder="חיפוש בכותרת, בתקציר, בתגיות או במזהה (AK-012)…" value={f.text} onChange={(e) => update({ ...f, text: e.target.value })} />
          <button onClick={() => setOpenDims(!openDims)}>סינון לפי תגיות{activeTagCount ? ` (${activeTagCount})` : ''}</button>
          <label className="row" style={{ fontWeight: 400, margin: 0 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={f.showOldVersions} onChange={(e) => update({ ...f, showOldVersions: e.target.checked })} /> גרסאות קודמות
          </label>
          <label className="row" style={{ fontWeight: 400, margin: 0 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={f.showArchived} onChange={(e) => update({ ...f, showArchived: e.target.checked })} /> בארכיון
          </label>
          {(activeTagCount > 0 || f.text || f.folder) && <button className="link" onClick={() => update(emptyFilters())}>ניקוי</button>}
          {(activeTagCount > 0 || f.text || f.folder) && <button onClick={copyLink} title="העתקת קישור לתצוגה הזו">{copied ? 'הקישור הועתק ✓' : 'שיתוף התצוגה'}</button>}
        </div>

        {openDims && (
          <div className="card" style={{ marginBottom: '1em' }}>
            {[...SINGLE_DIMS, ...MULTI_DIMS].map((dim) => (
              <div className="field" key={dim}>
                <label>{tax.dimensions[dim].label}</label>
                <TagPicker values={tax.dimensions[dim].values} selected={f.tags[dim] ?? []} onChange={(v) => update({ ...f, tags: { ...f.tags, [dim]: v } })} />
              </div>
            ))}
          </div>
        )}

        <p className="muted">{results.length} מסמכים{f.folder ? ` ב"${folderLabel(tax, f.folder)}"` : ''}</p>
        <table className="docs">
          <thead>
            <tr>
              <th>מזהה</th>
              <th>כותרת</th>
              <th>תיקייה</th>
              <th>סוג</th>
              <th>פורום / מקור</th>
              <th>עודכן</th>
            </tr>
          </thead>
          <tbody>
            {results.map((d) => (
              <tr key={d.id}>
                <td><span className="code">{docCode(d.seq)}</span></td>
                <td className="title">
                  <a href={`#/doc/${d.id}`}>{d.title}</a>{' '}
                  {d.versionLabel && <span className="tag">{d.versionLabel}</span>}
                  {!d.isCurrent && <span className="tag old">גרסה קודמת</span>}
                  {d.archived && <span className="tag old">בארכיון</span>}
                  {d.restricted && <span className="tag restricted">לא להפצה</span>}
                  {d.summary && <div className="muted" style={{ fontSize: '.85rem' }}>{d.summary.length > 160 ? d.summary.slice(0, 160) + '…' : d.summary}</div>}
                </td>
                <td>{folderLabel(tax, d.folder)}</td>
                <td>{valueLabel(tax, 'docType', d.docType)}</td>
                <td>
                  {d.publisher !== 'program' ? valueLabel(tax, 'publisher', d.publisher) : d.forum.map((k) => valueLabel(tax, 'forum', k)).join(', ')}
                  {d.year ? ` · ${d.year}` : ''}
                </td>
                <td className="muted">{fmtDate(d.updatedAt)}</td>
              </tr>
            ))}
            {results.length === 0 && (
              <tr><td colSpan={6} className="muted">לא נמצאו מסמכים.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

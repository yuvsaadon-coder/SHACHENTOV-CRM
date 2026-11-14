import { useMemo, useState } from 'react'
import { fmtDate, useApp } from '../context.ts'
import { emptyFilters, filterDocs, folderCounts, type Filters } from '../lib/search.ts'
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

export default function ArchivePage() {
  const { tax, docs } = useApp()
  const [f, setF] = useState<Filters>(loadFilters)
  const [openDims, setOpenDims] = useState(false)

  const update = (next: Filters) => {
    setF(next)
    sessionStorage.setItem(FILTER_KEY, JSON.stringify(next))
  }
  const results = useMemo(() => filterDocs(docs, f, tax), [docs, f, tax])
  const counts = useMemo(() => folderCounts(docs), [docs])
  const activeTagCount = Object.values(f.tags).reduce((n, v) => n + v.length, 0)

  // עץ תיקיות: "02-1".."02-4" מקובצות תחת "02 ספריית ידע"
  const tree: { key: string; label: string; sub: boolean }[] = []
  for (const fo of tax.folders.filter((x) => x.active !== false)) {
    if (fo.key.includes('-')) {
      const parent = fo.key.split('-')[0]
      if (!tree.some((t) => t.key === parent)) tree.push({ key: parent, label: fo.label.split(' / ')[0], sub: false })
      tree.push({ key: fo.key, label: fo.label.split(' / ').slice(1).join(' / ') || fo.label, sub: true })
    } else tree.push({ key: fo.key, label: fo.label, sub: false })
  }

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
          {tree.map((t) => (
            <li key={t.key} className={t.sub ? 'sub' : ''}>
              <button className={f.folder === t.key ? 'active' : ''} onClick={() => update({ ...f, folder: t.key })}>
                <span>{t.sub ? '' : t.key + ' '}{t.label}</span>
                <span className="count">{counts[t.key] ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section>
        <div className="toolbar">
          <input type="search" placeholder="חיפוש בכותרת, בתקציר ובתגיות…" value={f.text} onChange={(e) => update({ ...f, text: e.target.value })} />
          <button onClick={() => setOpenDims(!openDims)}>סינון לפי תגיות{activeTagCount ? ` (${activeTagCount})` : ''}</button>
          <label className="row" style={{ fontWeight: 400, margin: 0 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={f.showOldVersions} onChange={(e) => update({ ...f, showOldVersions: e.target.checked })} /> גרסאות קודמות
          </label>
          <label className="row" style={{ fontWeight: 400, margin: 0 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={f.showArchived} onChange={(e) => update({ ...f, showArchived: e.target.checked })} /> בארכיון
          </label>
          {(activeTagCount > 0 || f.text || f.folder) && <button className="link" onClick={() => update(emptyFilters())}>ניקוי</button>}
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
              <tr><td colSpan={5} className="muted">לא נמצאו מסמכים.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

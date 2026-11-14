import { useMemo, useState } from 'react'
import { useApp } from '../context.ts'
import { bestMatches, parseCard, type PendingLink } from '../lib/card.ts'
import { docCode, validateInput, type ArchiveDoc, type DocInput, type DocLink } from '../lib/model.ts'
import { MULTI_DIMS, SINGLE_DIMS, folderLabel, linkTypeLabel } from '../lib/taxonomy.ts'
import TagPicker from './TagPicker.tsx'

interface Props {
  initial: DocInput
  excludeId?: string
  /** במסך העלאה: מאפשר לבחור "גרסה חדשה של..." */
  withVersionOf?: boolean
  initialVersionOf?: ArchiveDoc | null
  submitLabel: string
  busy?: boolean
  onSubmit: (input: DocInput, versionOf: ArchiveDoc | null, rationale: string) => void
  /** נקרא כשמודבק כרטיס שמכיל שם קובץ מקורי (לבדיקת התאמה לקובץ שנבחר) */
  onCardOriginalName?: (name: string | null) => void
}

interface Unresolved extends PendingLink {
  options: { doc: ArchiveDoc; score: number }[]
  chosen: string
}

export default function DocForm(p: Props) {
  const { tax, docs } = useApp()
  const [input, setInput] = useState<DocInput>(p.initial)
  const [versionOf, setVersionOf] = useState<ArchiveDoc | null>(p.initialVersionOf ?? null)
  const [cardText, setCardText] = useState('')
  const [cardMsg, setCardMsg] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null)
  const [unresolved, setUnresolved] = useState<Unresolved[]>([])
  const [versionQuery, setVersionQuery] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [rationale, setRationale] = useState('')

  const candidates = useMemo(() => docs.filter((d) => d.id !== p.excludeId && !d.archived), [docs, p.excludeId])
  const set = <K extends keyof DocInput>(k: K, v: DocInput[K]) => setInput((s) => ({ ...s, [k]: v }))

  function applyCard() {
    try {
      const parsed = parseCard(cardText, tax)
      setInput((s) => ({ ...parsed.input, links: s.links }))
      setRationale(parsed.rationale)
      p.onCardOriginalName?.(parsed.originalName)
      // התאמת קישורים לפי כותרת
      const auto: DocLink[] = []
      const pending: Unresolved[] = []
      for (const pl of parsed.pendingLinks) {
        const options = bestMatches(pl.target, candidates)
        if (options[0] && options[0].score >= 0.85) auto.push({ type: pl.type, to: options[0].doc.id })
        else pending.push({ ...pl, options, chosen: options[0]?.doc.id ?? '' })
      }
      setInput((s) => ({ ...s, links: [...s.links, ...auto.filter((a) => !s.links.some((l) => l.to === a.to && l.type === a.type))] }))
      setUnresolved(pending)
      const warnings = [...parsed.warnings]
      if (parsed.versionOf && p.withVersionOf) {
        const m = bestMatches(parsed.versionOf, candidates.filter((d) => d.isCurrent))
        if (m[0] && m[0].score >= 0.85) setVersionOf(m[0].doc)
        else {
          setVersionQuery(parsed.versionOf)
          warnings.push(`לא נמצאה התאמה ודאית לגרסה הקודמת "${parsed.versionOf}" - בחרו ידנית למטה`)
        }
      }
      if (pending.length) warnings.push(`${pending.length} קישורים דורשים אישור התאמה`)
      setCardMsg(warnings.length ? { kind: 'warn', text: 'הטופס מולא. שימו לב:\n• ' + warnings.join('\n• ') } : { kind: 'ok', text: 'הטופס מולא מהכרטיס. בדקו ושמרו.' })
    } catch (e) {
      setCardMsg({ kind: 'error', text: (e as Error).message })
    }
  }

  function confirmUnresolved(i: number) {
    const u = unresolved[i]
    if (u.chosen) set('links', [...input.links, { type: u.type, to: u.chosen }])
    setUnresolved(unresolved.filter((_, j) => j !== i))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validateInput(input, tax)
    if (unresolved.length) errs.push('יש קישורים מהכרטיס שעדיין לא אושרו או נדחו')
    setErrors(errs)
    if (!errs.length) p.onSubmit(input, versionOf, rationale.trim())
  }

  const docTitle = (id: string) => {
    const d = docs.find((x) => x.id === id)
    return d ? `${docCode(d.seq)} ${d.title}` : '(מסמך לא זמין)'
  }
  const versionOptions = versionQuery ? bestMatches(versionQuery, candidates.filter((d) => d.isCurrent), 8, 0.1) : []

  return (
    <form onSubmit={submit}>
      <div className="card">
        <h2>הדבקת כרטיס תיוק</h2>
        <p className="hint">הדביקו כאן את הכרטיס שסקיל התיוק הפיק, ולחצו "מילוי". אפשר גם למלא את הטופס ידנית.</p>
        <textarea value={cardText} onChange={(e) => setCardText(e.target.value)} placeholder='```json { "ashkolot_card": 1, ... } ```' rows={4} dir="ltr" />
        <div className="row" style={{ marginTop: '.5em' }}>
          <button type="button" onClick={applyCard} disabled={!cardText.trim()}>מילוי</button>
        </div>
        {cardMsg && <div className={`alert ${cardMsg.kind}`} style={{ marginTop: '.7em' }}>{cardMsg.text}</div>}
        {unresolved.map((u, i) => (
          <div key={i} className="alert warn">
            קישור "{linkTypeLabel(tax, u.type)}" אל: <b>{u.target}</b>
            <div className="row" style={{ marginTop: '.4em' }}>
              <select value={u.chosen} onChange={(e) => setUnresolved(unresolved.map((x, j) => (j === i ? { ...x, chosen: e.target.value } : x)))} style={{ maxWidth: 480 }}>
                <option value="">— אין התאמה —</option>
                {u.options.map((o) => <option key={o.doc.id} value={o.doc.id}>{docCode(o.doc.seq)} {o.doc.title} ({Math.round(o.score * 100)}%)</option>)}
              </select>
              <button type="button" onClick={() => confirmUnresolved(i)} disabled={!u.chosen}>אישור</button>
              <button type="button" onClick={() => setUnresolved(unresolved.filter((_, j) => j !== i))}>דילוג</button>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>פרטי התיוק</h2>
        <div className="field">
          <label htmlFor="title">כותרת <span className="hint">— תיאורית, לא שם הקובץ. מבנה מומלץ: נושא – פורום/מקור – שנה</span></label>
          <input id="title" value={input.title} onChange={(e) => set('title', e.target.value)} maxLength={300} required />
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="folder">תיקייה</label>
            <select id="folder" value={input.folder} onChange={(e) => set('folder', e.target.value)} required>
              <option value="">— בחרו —</option>
              {tax.folders.filter((f) => f.active !== false || f.key === input.folder).map((f) => (
                <option key={f.key} value={f.key}>{f.key.replace('-', '.')} {f.label}</option>
              ))}
            </select>
            {input.folder && (() => {
              const fo = tax.folders.find((f) => f.key === input.folder)
              return (
                <div className="hint">
                  <b>כולל:</b> {fo?.hint}
                  {fo?.exclude && <><br /><b>לא כולל:</b> {fo.exclude}</>}
                </div>
              )
            })()}
          </div>
          {SINGLE_DIMS.map((dim) => {
            const def = tax.dimensions[dim]
            return (
              <div className="field" key={dim}>
                <label htmlFor={dim}>{def.label}</label>
                <select id={dim} value={input[dim]} onChange={(e) => set(dim, e.target.value)} required>
                  <option value="">— בחרו —</option>
                  {def.values.filter((v) => v.active !== false || v.key === input[dim]).map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
                </select>
              </div>
            )
          })}
          <div className="field">
            <label htmlFor="meetingDate">תאריך מפגש <span className="hint">{input.folder === '09' ? '(חובה בתיקיית מפגשים)' : '(אם רלוונטי)'}</span></label>
            <input id="meetingDate" type="date" value={input.meetingDate ?? ''} onChange={(e) => set('meetingDate', e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="year">שנה</label>
            <input id="year" type="number" min={1990} max={2100} value={input.year ?? ''} onChange={(e) => set('year', e.target.value ? Number(e.target.value) : null)} />
          </div>
        </div>

        {MULTI_DIMS.map((dim) => (
          <div className="field" key={dim}>
            <label>{tax.dimensions[dim].label}</label>
            <TagPicker values={tax.dimensions[dim].values} selected={input[dim]} onChange={(v) => set(dim, v)} />
          </div>
        ))}

        <div className="field">
          <label htmlFor="summary">תקציר <span className="hint">— 2-3 משפטים: מה המסמך מכיל ולמה הוא שימושי</span></label>
          <textarea id="summary" value={input.summary} onChange={(e) => set('summary', e.target.value)} maxLength={3000} />
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="author">מחבר/ת <span className="hint">(מי כתב את המסמך, לא מי מעלה אותו)</span></label>
            <input id="author" value={input.author} onChange={(e) => set('author', e.target.value)} maxLength={200} />
          </div>
          <div className="field">
            <label htmlFor="versionLabel">תווית גרסה <span className="hint">(למשל V2, טיוטה ב', מתוקן)</span></label>
            <input id="versionLabel" value={input.versionLabel} onChange={(e) => set('versionLabel', e.target.value)} maxLength={40} />
          </div>
          <div className="field">
            <label>הפצה</label>
            <label style={{ fontWeight: 400 }}>
              <input type="checkbox" checked={input.restricted} onChange={(e) => set('restricted', e.target.checked)} style={{ width: 'auto', marginLeft: '.4em' }} />
              לא להפצה: גלוי רק לצוות התוכן (עורכים ומנהלים)
            </label>
          </div>
        </div>
      </div>

      {p.withVersionOf && (
        <div className="card">
          <h2>גרסה חדשה של מסמך קיים?</h2>
          {versionOf ? (
            <div className="row">
              <span>גרסה חדשה של: <b>{versionOf.title}</b> {versionOf.versionLabel && <span className="tag">{versionOf.versionLabel}</span>}</span>
              <button type="button" className="link" onClick={() => setVersionOf(null)}>ביטול</button>
            </div>
          ) : (
            <>
              <input type="search" placeholder="חפשו את המסמך הקודם לפי שם…" value={versionQuery} onChange={(e) => setVersionQuery(e.target.value)} />
              {versionOptions.length > 0 && (
                <ul>
                  {versionOptions.map((o) => (
                    <li key={o.doc.id}>
                      <button type="button" className="link" onClick={() => { setVersionOf(o.doc); setVersionQuery('') }}>{o.doc.title}</button>{' '}
                      <span className="muted">{folderLabel(tax, o.doc.folder)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="hint">הגרסה הקודמת תסומן כלא-נוכחית ותישאר זמינה בהיסטוריית הגרסאות.</p>
            </>
          )}
        </div>
      )}

      <LinksEditor links={input.links} onChange={(l) => set('links', l)} candidates={candidates} docTitle={docTitle} />

      <div className="card">
        <h2>נימוק התיוק</h2>
        <p className="hint">למה המסמך מתויק כך. נשמר ביומן ההיסטוריה של המסמך, כדי שכל אחד יוכל לראות בהמשך על סמך מה הוחלט. כשמדביקים כרטיס, הנימוק של הסקיל מופיע כאן וניתן לתקן אותו.</p>
        <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} maxLength={1000} rows={3} placeholder="למשל: מסמך של משרד הפנים (כתוב בעמוד השער) ← ספריית ידע / ממשלה ורגולציה" />
      </div>

      {errors.length > 0 && <div className="alert error">{'יש לתקן:\n• ' + errors.join('\n• ')}</div>}
      <div className="row">
        <button type="submit" className="primary" disabled={p.busy}>{p.busy ? 'שומר…' : p.submitLabel}</button>
      </div>
    </form>
  )
}

function LinksEditor({ links, onChange, candidates, docTitle }: {
  links: DocLink[]
  onChange: (l: DocLink[]) => void
  candidates: ArchiveDoc[]
  docTitle: (id: string) => string
}) {
  const { tax } = useApp()
  const [type, setType] = useState(tax.linkTypes[0]?.key ?? 'related')
  const [q, setQ] = useState('')
  const options = q.trim() ? bestMatches(q, candidates, 8, 0.1) : []
  return (
    <div className="card">
      <h2>קישורים למסמכים אחרים</h2>
      {links.length === 0 && <p className="muted">אין קישורים.</p>}
      <ul>
        {links.map((l, i) => (
          <li key={`${l.type}-${l.to}`}>
            {linkTypeLabel(tax, l.type)}: <b>{docTitle(l.to)}</b>{' '}
            <button type="button" className="link" onClick={() => onChange(links.filter((_, j) => j !== i))}>הסרה</button>
          </li>
        ))}
      </ul>
      <div className="row">
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 'auto' }}>
          {tax.linkTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <input type="search" placeholder="חיפוש מסמך לקישור…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
      </div>
      {options.length > 0 && (
        <ul>
          {options.map((o) => (
            <li key={o.doc.id}>
              <button type="button" className="link" onClick={() => { onChange([...links, { type, to: o.doc.id }]); setQ('') }}>{o.doc.title}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

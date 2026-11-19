import { useState } from 'react'
import { he } from '../../i18n/he'
import { fmt1 } from '../../lib/format'
import type { LegacyCoordinator } from '../../data/legacy'
import { Card, Field, SectionHeader } from '../../ui/components'
import { useAdmin } from './context'

export function CoordsPanel() {
  const { config, votes, store } = useAdmin()
  const [coords, setCoords] = useState<LegacyCoordinator[]>(() => config.coordinators.map((c) => ({ ...c })))
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<LegacyCoordinator>({ id: '', name: '', branch: '', weight: 1 })
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const branches = [...new Set(config.coordinators.map((c) => c.branch))]

  const startEdit = (c: LegacyCoordinator) => { setEditing(c.id); setDraft({ ...c }); setAdding(false) }
  const saveEdit = () => { setCoords((cs) => cs.map((c) => (c.id === editing ? { ...draft, name: draft.name.trim() } : c))); setEditing(null); setDirty(true) }
  const startAdd = () => { setAdding(true); setEditing(null); setDraft({ id: '', name: '', branch: branches[0] ?? '', weight: 1 }) }
  const saveAdd = () => {
    if (!draft.name.trim() || !draft.branch) { alert(he.fillNameBranch); return }
    setCoords((cs) => [...cs, { ...draft, name: draft.name.trim(), id: `c-${Date.now()}` }])
    setAdding(false); setDirty(true)
  }
  const removeCoord = (id: string) => {
    if (!confirm(he.confirmRemoveCoord)) return
    setCoords((cs) => cs.filter((c) => c.id !== id)); setDirty(true)
  }
  const save = async () => {
    setSaving(true)
    try {
      await store.updateConfigField('coordinators', coords)
      setDirty(false)
      alert(he.coordsSaved)
    } catch (e) {
      alert(he.errorPrefix + (e instanceof Error ? e.message : String(e)))
    } finally { setSaving(false) }
  }
  const branchSelect = (value: string, onChange: (v: string) => void) => (
    <select aria-label={he.branch} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {branches.map((b) => <option key={b} value={b}>{b}</option>)}
    </select>
  )
  const weightSelect = (value: number, onChange: (v: number) => void) => (
    <select aria-label={he.weight} className="input" style={{ width: 80 }} value={String(value)} onChange={(e) => onChange(parseFloat(e.target.value))}>
      <option value="1">1.0</option><option value="0.5">0.5</option>
    </select>
  )

  return (
    <div>
      <SectionHeader title={he.coordsTitle} subtitle={he.coordsSubtitle(coords.length, fmt1(coords.reduce((s, c) => s + c.weight, 0)))} />
      <div className="toolbar">
        <button type="button" className="btn btn-primary" onClick={startAdd}>{he.addCoord}</button>
        {dirty && <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>{saving ? he.saving : `💾 ${he.saveChanges}`}</button>}
        {dirty && <span className="txt-over small" role="status">• {he.unsaved}</span>}
      </div>
      {adding && (
        <div className="form-row">
          <Field label={he.fullName} grow><input className="input" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} autoFocus /></Field>
          <Field label={he.branch}>{branchSelect(draft.branch, (v) => setDraft((d) => ({ ...d, branch: v })))}</Field>
          <Field label={he.weight}>{weightSelect(draft.weight, (v) => setDraft((d) => ({ ...d, weight: v })))}</Field>
          <button type="button" className="btn btn-primary" onClick={saveAdd}>{he.add} ✓</button>
          <button type="button" className="btn btn-small" onClick={() => setAdding(false)}>{he.cancel}</button>
        </div>
      )}
      <Card>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>{he.colName}</th><th>{he.branch}</th><th>{he.weight}</th><th>{he.statusCol}</th><th /></tr></thead>
            <tbody>
              {coords.map((c) => {
                const ed = editing === c.id
                return (
                  <tr key={c.id}>
                    <td className="cell-strong">{ed ? <input aria-label={he.fullName} className="input" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} autoFocus /> : c.name}</td>
                    <td>{ed ? branchSelect(draft.branch, (v) => setDraft((d) => ({ ...d, branch: v }))) : c.branch}</td>
                    <td>{weightSelect(ed ? draft.weight : c.weight, (w) => {
                      if (ed) setDraft((d) => ({ ...d, weight: w }))
                      else { setCoords((cs) => cs.map((x) => (x.id === c.id ? { ...x, weight: w } : x))); setDirty(true) }
                    })}</td>
                    <td>{votes[c.id] ? <span className="txt-ok">{he.votedMark}</span> : <span className="txt-pending">{he.waitingMark}</span>}</td>
                    <td>
                      <div className="row-actions">
                        {ed
                          ? <><button type="button" className="btn btn-small" onClick={saveEdit}>{he.saveDone}</button><button type="button" className="btn btn-small" onClick={() => setEditing(null)}>{he.cancel}</button></>
                          : <><button type="button" className="btn btn-small" onClick={() => startEdit(c)}>{he.edit}</button><button type="button" className="btn btn-small btn-danger" onClick={() => removeCoord(c.id)}>{he.remove}</button></>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

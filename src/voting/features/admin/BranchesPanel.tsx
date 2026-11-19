import { useState } from 'react'
import { he } from '../../i18n/he'
import { fmt2 } from '../../lib/format'
import type { BranchSettings, VotesIn } from '../../data/model'
import { branchWeights } from '../../data/weights'
import { Card, SectionHeader } from '../../ui/components'
import { useAdmin } from './context'

/** CRM branches: who votes, family counts (routine / holiday) and the resulting weights. Coordinators come from the CRM. */
export function BranchesPanel() {
  const { branches, settings, coordinators, store } = useAdmin()
  const [draft, setDraft] = useState<Record<string, BranchSettings>>(() => ({ ...settings }))
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const wr = branchWeights(draft, 'routine')
  const wh = branchWeights(draft, 'holiday')
  const set = (id: string, upd: Partial<BranchSettings>) => {
    setDraft((d) => ({ ...d, [id]: { ...d[id]!, ...upd } }))
    setSaved((s) => { const n = new Set(s); n.delete(id); return n })
  }
  const save = async (id: string) => {
    try { await store.saveBranchSettings(id, draft[id]!); setSaved((s) => new Set(s).add(id)) }
    catch (e) { alert(he.errorPrefix + (e instanceof Error ? e.message : String(e))) }
  }
  const num = (v: string) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null }

  return (
    <div>
      <SectionHeader title={he.crm.branchesTitle} subtitle={he.crm.branchesSubtitle} />
      <Card>
        <div className="table-wrap">
          <table className="data quote-table">
            <thead>
              <tr>
                <th>{he.branch}</th><th>{he.crm.colVotesIn}</th><th>{he.crm.colFamRoutine}</th><th>{he.crm.colFamHoliday}</th>
                <th>{he.crm.colWRoutine}</th><th>{he.crm.colWHoliday}</th><th>{he.crm.colCoords}</th><th />
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => {
                const s = draft[b.id]!
                const coords = coordinators.filter((c) => c.branchIds.includes(b.id))
                return (
                  <tr key={b.id} className={s.votesIn === 'never' ? 'is-ignored' : ''}>
                    <td data-label={he.branch} className="cell-strong">{b.name}</td>
                    <td data-label={he.crm.colVotesIn}>
                      <select aria-label={`${he.crm.colVotesIn}: ${b.name}`} className="input" value={s.votesIn} onChange={(e) => set(b.id, { votesIn: e.target.value as VotesIn })}>
                        <option value="always">{he.crm.votesAlways}</option>
                        <option value="holidays">{he.crm.votesHolidays}</option>
                        <option value="never">{he.crm.votesNever}</option>
                      </select>
                    </td>
                    <td data-label={he.crm.colFamRoutine}>
                      <input aria-label={`${he.crm.colFamRoutine}: ${b.name}`} className="input input-num" type="number" min="0" value={s.familiesRoutine ?? ''} onChange={(e) => set(b.id, { familiesRoutine: num(e.target.value) })} />
                    </td>
                    <td data-label={he.crm.colFamHoliday}>
                      <input aria-label={`${he.crm.colFamHoliday}: ${b.name}`} className="input input-num" type="number" min="0" value={s.familiesHoliday ?? ''} onChange={(e) => set(b.id, { familiesHoliday: num(e.target.value) })} />
                    </td>
                    <td data-label={he.crm.colWRoutine}>{wr[b.id] != null ? <span className="weight-pill">{fmt2(wr[b.id]!)}</span> : he.dash}</td>
                    <td data-label={he.crm.colWHoliday}>{wh[b.id] != null ? <span className="weight-pill">{fmt2(wh[b.id]!)}</span> : he.dash}</td>
                    <td data-label={he.crm.colCoords} className="small">{coords.length ? coords.map((c) => c.name).join(', ') : <span className="txt-warn" style={{ marginInlineStart: 0 }}>{he.crm.noCoords}</span>}</td>
                    <td>
                      {saved.has(b.id) ? <span className="txt-ok small">{he.crm.saved}</span>
                        : <button type="button" className="btn btn-small" onClick={() => void save(b.id)}>{he.crm.saveRow}</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted">{he.crm.weightExplain}</p>
      </Card>
    </div>
  )
}

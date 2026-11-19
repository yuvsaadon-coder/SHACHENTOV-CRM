import { he, relTime } from '../../i18n/he'
import { fmt2 } from '../../lib/format'
import { Card, SectionHeader, Stat } from '../../ui/components'
import { useAdmin, type ExpectedVoter } from './context'

export function StatusPanel() {
  const { expected, voteById, branchWeights, branchName } = useAdmin()
  const done = expected.filter((e) => voteById[e.id])
  const pending = expected.filter((e) => !voteById[e.id])
  const branches = Object.keys(branchWeights)
  const votedBranches = new Set(done.map((e) => e.branchId))
  const weightIn = branches.filter((b) => votedBranches.has(b)).reduce((s, b) => s + branchWeights[b]!, 0)
  const weightAll = branches.reduce((s, b) => s + branchWeights[b]!, 0)
  return (
    <div>
      <SectionHeader title={he.tabs.status} subtitle={he.statusSubtitle(done.length, expected.length)} />
      <div className="grid-stats">
        <Stat label={he.statVoted} value={`${done.length} / ${expected.length}`} accent />
        <Stat label={he.statBranches} value={`${votedBranches.size} / ${branches.length}`} />
        <Stat label={he.statWeight} value={`${fmt2(weightIn)} / ${fmt2(weightAll)}`} />
        <Stat label={he.statPending} value={pending.length} />
      </div>
      <div className="grid-2">
        <Card title={he.votedList(done.length)}><Roster list={done} done /></Card>
        <Card title={he.pendingList(pending.length)} accent><Roster list={pending} /></Card>
      </div>
      <div style={{ marginBlockStart: 24 }}>
        <Card title={he.crm.branchWeightsTitle}>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>{he.branch}</th><th>{he.weight}</th><th>{he.crm.votersInBranch}</th><th>{he.crm.weightPerVoter}</th></tr></thead>
              <tbody>
                {branches.sort((a, b) => branchWeights[b]! - branchWeights[a]!).map((b) => {
                  const n = done.filter((e) => e.branchId === b).length
                  return (
                    <tr key={b}>
                      <td className="cell-strong">{branchName(b)}</td>
                      <td><span className="weight-pill">{fmt2(branchWeights[b]!)}</span></td>
                      <td>{n} / {expected.filter((e) => e.branchId === b).length}</td>
                      <td>{n ? fmt2(branchWeights[b]! / n) : he.dash}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted">{he.crm.weightExplain}</p>
        </Card>
      </div>
    </div>
  )
}

function Roster({ list, done }: { list: ExpectedVoter[]; done?: boolean }) {
  const { voteById, now, branchName } = useAdmin()
  if (!list.length) return <div className="muted small">{he.dash}</div>
  return (
    <div>
      {list.map((e) => {
        const vote = voteById[e.id]
        return (
          <div key={e.id} className="roster-row">
            <div className={`roster-dot ${done ? 'done' : 'pending'}`} aria-hidden>{done ? he.doneMark : he.pendingMark}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="roster-name">{e.name}</div>
              <div className="roster-meta">{branchName(e.branchId)}{vote ? ` · ${relTime(vote.submittedAt, now)}` : ''}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

import { he, relTime } from '../../i18n/he'
import { fmt1 } from '../../lib/format'
import { participants, type LegacyCoordinator } from '../../data/legacy'
import { Card, SectionHeader, Stat } from '../../ui/components'
import { useAdmin } from './context'

export function StatusPanel() {
  const { config, votes } = useAdmin()
  const coordinators = participants(config)
  const submitted = coordinators.filter((c) => votes[c.id])
  const pending = coordinators.filter((c) => !votes[c.id])
  const totalWeight = coordinators.reduce((s, c) => s + c.weight, 0)
  const submittedWeight = submitted.reduce((s, c) => s + c.weight, 0)
  const branches = new Set(coordinators.map((c) => c.branch))
  const surveyUrl = `${window.location.origin}/`
  return (
    <div>
      <SectionHeader title={he.tabs.status} subtitle={he.statusSubtitle(submitted.length, coordinators.length)} />
      <div className="grid-stats">
        <Stat label={he.statVoted} value={`${submitted.length} / ${coordinators.length}`} accent />
        <Stat label={he.statWeight} value={`${fmt1(submittedWeight)} / ${fmt1(totalWeight)}`} />
        <Stat label={he.statPending} value={pending.length} />
        <Stat label={he.statBranches} value={`${new Set(submitted.map((c) => c.branch)).size} / ${branches.size}`} />
      </div>
      <div className="grid-2">
        <Card title={he.votedList(submitted.length)}><Roster list={submitted} done /></Card>
        <Card title={he.pendingList(pending.length)} accent><Roster list={pending} /></Card>
      </div>
      <div style={{ marginBlockStart: 24 }}>
        <Card title={he.surveyLink}>
          <div className="toolbar" style={{ marginBlockEnd: 0 }}>
            <input readOnly value={surveyUrl} className="input" style={{ flex: 1, minWidth: 200 }} aria-label={he.surveyLink} />
            <button type="button" className="btn btn-small" onClick={() => { void navigator.clipboard.writeText(surveyUrl); alert(he.copied) }}>{he.copyLink}</button>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Roster({ list, done }: { list: LegacyCoordinator[]; done?: boolean }) {
  const { votes, now } = useAdmin()
  if (!list.length) return <div className="muted small">{he.dash}</div>
  return (
    <div>
      {list.map((c) => {
        const vote = votes[c.id]
        return (
          <div key={c.id} className="roster-row">
            <div className={`roster-dot ${done ? 'done' : 'pending'}`} aria-hidden>{done ? he.doneMark : he.pendingMark}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="roster-name">{c.name}</div>
              <div className="roster-meta">
                {c.branch} · {he.weightLabel(c.weight)}{vote ? ` · ${relTime(vote.submittedAt, now)}` : ''}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

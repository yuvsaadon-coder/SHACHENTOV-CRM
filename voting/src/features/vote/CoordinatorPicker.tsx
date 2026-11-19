import { he } from '../../i18n/he'
import type { LegacyCoordinator } from '../../data/legacy'

export function CoordinatorPicker({ coordinators, onPick }: { coordinators: LegacyCoordinator[]; onPick: (c: LegacyCoordinator) => void }) {
  const branches = [...new Set(coordinators.map((c) => c.branch))]
  return (
    <div className="picker">
      <a href="/admin" className="btn btn-dark btn-small picker-admin-link">{he.toAdmin} ←</a>
      <div className="picker-inner">
        <div className="picker-head">
          <div className="pill">{he.orgTag}</div>
          <h1>{he.pickTitle}</h1>
          <p className="picker-sub">{he.pickSubtitle}</p>
        </div>
        <div className="picker-branches">
          {branches.map((branch) => (
            <section key={branch} aria-label={he.branchLabel(branch)}>
              <div className="picker-branch-label">{he.branchLabel(branch)}</div>
              <div className="picker-row">
                {coordinators.filter((c) => c.branch === branch).map((c) => (
                  <button type="button" key={c.id} className="coord-btn" onClick={() => onPick(c)}>{c.name}</button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

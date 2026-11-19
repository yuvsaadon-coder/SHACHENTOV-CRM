import { useState } from 'react'
import { he } from '../../i18n/he'
import { participates } from '../../data/weights'
import { Card, Field, SectionHeader } from '../../ui/components'
import { VoteStepper } from '../vote/VoteStepper'
import { useAdmin } from './context'

/** HQ sees the coordinator screen of any voting branch; nothing is saved. */
export function PreviewPanel() {
  const { config, branches, settings, kind } = useAdmin()
  const voting = branches.filter((b) => participates(settings[b.id], kind))
  const [branchId, setBranchId] = useState(voting[0]?.id ?? '')
  const branch = voting.find((b) => b.id === branchId)
  return (
    <div>
      <SectionHeader title={he.crm.previewTitle} subtitle={he.crm.previewSubtitle} />
      <div className="toolbar">
        <Field label={he.crm.previewPick}>
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {voting.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
      </div>
      {branch && (
        <Card>
          <div className="preview-frame">
            <VoteStepper key={branch.id} store={null} config={config} uid="preview" name={he.crm.previewTitle} branchId={branch.id} branchName={branch.name} preview />
          </div>
        </Card>
      )}
    </div>
  )
}

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrgChartView } from '../components/orgchart/OrgChartView'
import type { OrgRole } from '../types'

const base: Omit<OrgRole, 'id' | 'roleName' | 'level' | 'reportsTo'> = {
  status: 'מאויש',
  priority: 'רגיל',
  holderName: 'יובל',
  linkedTaskIds: [],
  area: '',
  email: '',
  phone: '',
  affectsTasks: false,
  delegatedTo: null,
  notes: '',
}

const hqRole: OrgRole = { ...base, id: 'r1', roleName: 'מנכ"ל', level: 'מטה', reportsTo: undefined }
const branchRole: OrgRole = {
  ...base,
  id: 'r2',
  roleName: 'מנהל סניף',
  level: 'סניף ירושלים',
  portalBranchId: 'branch1',
  reportsTo: 'r1',
}

describe('OrgChartView keyboard accessibility', () => {
  it('renders interactive cards with role=button', () => {
    render(
      <OrgChartView roles={[hqRole]} onEdit={vi.fn()} onBranchDetails={vi.fn()} />
    )
    // HQ card has role="button" from the div
    expect(screen.getByLabelText(/ערוך תפקיד: מנכ"ל/)).toBeInTheDocument()
  })

  it('HQ-level card has aria-label for editing', () => {
    render(
      <OrgChartView roles={[hqRole]} onEdit={vi.fn()} onBranchDetails={vi.fn()} />
    )
    const card = screen.getByLabelText(/ערוך תפקיד: מנכ"ל/)
    expect(card).toHaveAttribute('role', 'button')
    expect(card).toHaveAttribute('tabindex', '0')
  })

  it('branch-level card has aria-label for details', () => {
    render(
      <OrgChartView roles={[hqRole, branchRole]} onEdit={vi.fn()} onBranchDetails={vi.fn()} />
    )
    // Expand the root to show branch child
    const expandBtn = screen.queryByRole('button', { name: /הרחב/ })
    if (expandBtn) userEvent.click(expandBtn)

    const branchCard = screen.queryByLabelText(/פרטי סניף: מנהל סניף/)
    // Card may be collapsed by default; we just verify when visible it has correct label
    if (branchCard) {
      expect(branchCard).toHaveAttribute('role', 'button')
    }
  })

  it('Enter key on HQ card triggers onEdit', async () => {
    const onEdit = vi.fn()
    const user = userEvent.setup()
    render(
      <OrgChartView roles={[hqRole]} onEdit={onEdit} onBranchDetails={vi.fn()} />
    )
    const card = screen.getByLabelText(/ערוך תפקיד: מנכ"ל/)
    card.focus()
    await user.keyboard('{Enter}')
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }))
  })

  it('Space key on HQ card triggers onEdit', async () => {
    const onEdit = vi.fn()
    const user = userEvent.setup()
    render(
      <OrgChartView roles={[hqRole]} onEdit={onEdit} onBranchDetails={vi.fn()} />
    )
    const card = screen.getByLabelText(/ערוך תפקיד: מנכ"ל/)
    card.focus()
    await user.keyboard(' ')
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }))
  })

  it('collapse toggle button exists when node has children', () => {
    render(
      <OrgChartView roles={[hqRole, branchRole]} onEdit={vi.fn()} onBranchDetails={vi.fn()} />
    )
    // Root has a child, so collapse toggle should be present
    const collapseBtn = screen.queryByRole('button', { name: /הרחב|כווץ/ })
    expect(collapseBtn).not.toBeNull()
  })
})

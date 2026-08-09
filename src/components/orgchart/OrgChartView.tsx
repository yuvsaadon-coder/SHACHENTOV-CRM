import type { OrgRole, RoleStatus } from '../../types'

type TreeNode = OrgRole & { children: TreeNode[] }

function buildTree(roles: OrgRole[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  for (const r of roles) map.set(r.id, { ...r, children: [] })

  const childIds = new Set<string>()
  for (const r of roles) {
    if (r.reportsTo && map.has(r.reportsTo) && r.reportsTo !== r.id) {
      map.get(r.reportsTo)!.children.push(map.get(r.id)!)
      childIds.add(r.id)
    }
  }

  return [...map.values()].filter((n) => !childIds.has(n.id))
}

const STATUS_CHIP: Record<RoleStatus, { bg: string; text: string }> = {
  'מאויש': { bg: '#C6EFCE', text: '#0A6B2E' },
  'חסר':   { bg: '#FEE2E2', text: '#B91C1C' },
  'חלקי':  { bg: '#FED7AA', text: '#9A3412' },
  'בסיכון':{ bg: '#FDC857', text: '#7A5A00' },
  'אחר':   { bg: '#E4DFEC', text: '#5F497A' },
}

function OrgCard({ role, onClick }: { role: OrgRole; onClick: () => void }) {
  const sc = STATUS_CHIP[role.status] ?? STATUS_CHIP['אחר']
  return (
    <div
      onClick={onClick}
      title="לחץ לעריכה"
      style={{
        border: '1.5px solid #E5E7EB',
        borderRadius: 10,
        padding: '10px 14px',
        backgroundColor: 'white',
        cursor: 'pointer',
        minWidth: 155,
        maxWidth: 205,
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        direction: 'rtl',
        userSelect: 'none',
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.14)'
        e.currentTarget.style.borderColor = '#189A9F'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.07)'
        e.currentTarget.style.borderColor = '#E5E7EB'
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: '#141348', marginBottom: 3, lineHeight: 1.3 }}>
        {role.roleName}
      </div>
      {role.holderName
        ? <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 6 }}>{role.holderName}</div>
        : <div style={{ fontSize: 11, color: '#D1D5DB', marginBottom: 6, fontStyle: 'italic' }}>לא מאויש</div>
      }
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 500, backgroundColor: sc.bg, color: sc.text, padding: '1px 6px', borderRadius: 4 }}>
          {role.status}
        </span>
        <span style={{ fontSize: 10, fontWeight: 500, backgroundColor: '#F3F4F6', color: '#374151', padding: '1px 6px', borderRadius: 4 }}>
          {role.level}
        </span>
      </div>
    </div>
  )
}

const LINE = '#D1D5DB'
const LINE_H = 28

// --- Area grouping ---

type ChildColumn =
  | { type: 'single'; key: string; node: TreeNode }
  | { type: 'group';  key: string; area: string; nodes: TreeNode[] }

function computeColumns(children: TreeNode[]): ChildColumn[] {
  const areaCounts = new Map<string, number>()
  for (const child of children) {
    const a = child.area?.trim()
    if (a) areaCounts.set(a, (areaCounts.get(a) || 0) + 1)
  }

  const result: ChildColumn[] = []
  const seenAreas = new Set<string>()
  const groupNodes = new Map<string, TreeNode[]>()

  for (const child of children) {
    const area = child.area?.trim()
    const isMulti = area && (areaCounts.get(area) || 0) > 1

    if (!isMulti) {
      result.push({ type: 'single', key: child.id, node: child })
    } else {
      if (!seenAreas.has(area!)) {
        seenAreas.add(area!)
        const nodes: TreeNode[] = []
        groupNodes.set(area!, nodes)
        result.push({ type: 'group', key: area!, area: area!, nodes })
      }
      groupNodes.get(area!)!.push(child)
    }
  }

  return result
}

function AreaGroupBox({ area, nodes, onEdit }: { area: string; nodes: TreeNode[]; onEdit: (r: OrgRole) => void }) {
  return (
    <div style={{
      border: '1.5px dashed #CBD5E1',
      borderRadius: 10,
      padding: '18px 12px 12px',
      backgroundColor: '#F8FAFC',
      position: 'relative',
      minWidth: 180,
    }}>
      <div style={{
        position: 'absolute',
        top: -8,
        right: 10,
        backgroundColor: '#F8FAFC',
        padding: '0 6px',
        fontSize: 10,
        color: '#64748B',
        fontWeight: 700,
        letterSpacing: '0.05em',
      }}>
        {area}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center' }}>
        {nodes.map(node => (
          <OrgNode key={node.id} node={node} onEdit={onEdit} />
        ))}
      </div>
    </div>
  )
}

function OrgNode({ node, onEdit }: { node: TreeNode; onEdit: (r: OrgRole) => void }) {
  const hasChildren = node.children.length > 0
  const columns = hasChildren ? computeColumns(node.children) : []
  const isOnly = columns.length === 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <OrgCard role={node} onClick={() => onEdit(node)} />

      {hasChildren && (
        <>
          <div style={{ width: 1, height: LINE_H, backgroundColor: LINE, flexShrink: 0 }} />

          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            {columns.map((col, i) => {
              const isFirst = i === 0
              const isLast = i === columns.length - 1
              return (
                <div
                  key={col.key}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    paddingLeft: 20,
                    paddingRight: 20,
                    paddingTop: LINE_H,
                    position: 'relative',
                  }}
                >
                  {!isOnly && !isFirst && (
                    <div style={{ position: 'absolute', top: 0, right: '50%', left: 0, height: 1, backgroundColor: LINE }} />
                  )}
                  {!isOnly && !isLast && (
                    <div style={{ position: 'absolute', top: 0, left: '50%', right: 0, height: 1, backgroundColor: LINE }} />
                  )}
                  <div style={{ position: 'absolute', top: 0, left: '50%', width: 1, height: LINE_H, backgroundColor: LINE }} />

                  {col.type === 'single'
                    ? <OrgNode node={col.node} onEdit={onEdit} />
                    : <AreaGroupBox area={col.area} nodes={col.nodes} onEdit={onEdit} />
                  }
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

interface Props {
  roles: OrgRole[]
  onEdit: (role: OrgRole) => void
}

export function OrgChartView({ roles, onEdit }: Props) {
  const roots = buildTree(roles)
  const allUnlinked = roles.every((r) => !r.reportsTo)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto">
      {allUnlinked && roles.length > 0 && (
        <div className="px-5 py-3 border-b border-gray-100 bg-amber-50 text-amber-700 text-xs">
          💡 לחץ על כל תפקיד ובחר "כפוף ל-" כדי לבנות את עץ הכפיפויות. תפקידים עם אותו שדה "אזור" יקובצו אוטומטית תחת כותרת אחת.
        </div>
      )}
      <div dir="ltr" style={{ padding: 32, minWidth: 'max-content' }}>
        {roots.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm" dir="rtl">
            אין תפקידים להצגה
          </div>
        )}

        <div style={{ display: 'flex', gap: 48, alignItems: 'flex-start', justifyContent: 'center', flexWrap: 'wrap' }}>
          {roots.map((root) => (
            <OrgNode key={root.id} node={root} onEdit={onEdit} />
          ))}
        </div>
      </div>
    </div>
  )
}

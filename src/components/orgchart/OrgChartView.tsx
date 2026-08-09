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
        minWidth: 160,
        maxWidth: 210,
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
      {role.holderName && (
        <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 6 }}>{role.holderName}</div>
      )}
      {!role.holderName && (
        <div style={{ fontSize: 11, color: '#D1D5DB', marginBottom: 6, fontStyle: 'italic' }}>לא מאויש</div>
      )}
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

function OrgNode({ node, onEdit }: { node: TreeNode; onEdit: (r: OrgRole) => void }) {
  const hasChildren = node.children.length > 0
  const isOnly = node.children.length === 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <OrgCard role={node} onClick={() => onEdit(node)} />

      {hasChildren && (
        <>
          {/* Vertical from card down to horizontal bar */}
          <div style={{ width: 1, height: LINE_H, backgroundColor: LINE, flexShrink: 0 }} />

          {/* Children row */}
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            {node.children.map((child, i) => {
              const isFirst = i === 0
              const isLast = i === node.children.length - 1
              return (
                <div
                  key={child.id}
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
                  {/* Left horizontal arm */}
                  {!isOnly && !isFirst && (
                    <div style={{ position: 'absolute', top: 0, right: '50%', left: 0, height: 1, backgroundColor: LINE }} />
                  )}
                  {/* Right horizontal arm */}
                  {!isOnly && !isLast && (
                    <div style={{ position: 'absolute', top: 0, left: '50%', right: 0, height: 1, backgroundColor: LINE }} />
                  )}
                  {/* Vertical drop from bar to child */}
                  <div style={{ position: 'absolute', top: 0, left: '50%', width: 1, height: LINE_H, backgroundColor: LINE }} />

                  <OrgNode node={child} onEdit={onEdit} />
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
          💡 לחץ על כל תפקיד ובחר "כפוף ל-" כדי לבנות את עץ הכפיפויות
        </div>
      )}
      <div
        dir="ltr"
        style={{ padding: 32, minWidth: 'max-content' }}
      >
        {roots.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm" dir="rtl">
            אין תפקידים להצגה
          </div>
        )}

        {/* Multiple roots rendered side by side */}
        <div style={{ display: 'flex', gap: 48, alignItems: 'flex-start', justifyContent: 'center', flexWrap: 'wrap' }}>
          {roots.map((root) => (
            <OrgNode key={root.id} node={root} onEdit={onEdit} />
          ))}
        </div>
      </div>
    </div>
  )
}

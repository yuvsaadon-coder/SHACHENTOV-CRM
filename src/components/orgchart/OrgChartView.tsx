import { useState, useEffect, useRef, useCallback } from 'react'
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

const HQ_LEVEL = 'מטה'

function OrgCard({ role, childCount, collapsed, onToggle, onClick }: {
  role: OrgRole
  childCount: number
  collapsed: boolean
  onToggle: () => void
  onClick: () => void
}) {
  const sc = STATUS_CHIP[role.status] ?? STATUS_CHIP['אחר']
  const isHQ = role.level === HQ_LEVEL
  const label = isHQ ? `ערוך תפקיד: ${role.roleName}` : `פרטי סניף: ${role.roleName}`

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Main card — role="button" because it contains a child <button> (collapse),
          so a real <button> would create invalid nested-button HTML. */}
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
        }}
        style={{
          border: '1.5px solid #E5E7EB',
          borderRadius: 8,
          padding: childCount > 0 ? '4px 8px 20px' : '4px 8px',
          backgroundColor: 'white',
          cursor: 'pointer',
          minWidth: 96,
          maxWidth: 120,
          boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
          direction: 'rtl',
          transition: 'box-shadow 0.15s, border-color 0.15s',
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.14)'
          e.currentTarget.style.borderColor = '#189A9F'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.07)'
          e.currentTarget.style.borderColor = '#E5E7EB'
        }}
        onFocus={(e) => { e.currentTarget.style.boxShadow = '0 0 0 2px #189A9F' }}
        onBlur={(e) => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.07)' }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: '#141348', marginBottom: 1, lineHeight: 1.3 }}>
          {role.roleName}
        </div>
        {role.holderName
          ? <div style={{ fontSize: 9, color: '#6B7280', marginBottom: 3 }}>{role.holderName}</div>
          : <div style={{ fontSize: 9, color: '#D1D5DB', marginBottom: 3, fontStyle: 'italic' }}>לא מאויש</div>
        }
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 8, fontWeight: 500, backgroundColor: sc.bg, color: sc.text, padding: '1px 4px', borderRadius: 4 }}>
            {role.status}
          </span>
          <span style={{ fontSize: 8, fontWeight: 500, backgroundColor: '#F3F4F6', color: '#374151', padding: '1px 4px', borderRadius: 4 }}>
            {role.level}
          </span>
        </div>
      </div>

      {/* Collapse toggle — sibling to the card div to avoid nested interactives */}
      {childCount > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          aria-label={collapsed ? `הרחב ${role.roleName}` : `כווץ ${role.roleName}`}
          aria-expanded={!collapsed}
          style={{
            position: 'absolute',
            bottom: 3,
            left: 4,
            fontSize: 8,
            color: '#189A9F',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '1px 4px',
            borderRadius: 3,
          }}
        >
          {collapsed ? `▶ ${childCount}` : `▼ ${childCount}`}
        </button>
      )}
    </div>
  )
}

const LINE = '#D1D5DB'
const LINE_H = 12

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

function AreaGroupBox({ area, nodes, onEdit, onBranchDetails, collapsedSet, onToggle }: {
  area: string
  nodes: TreeNode[]
  onEdit: (r: OrgRole) => void
  onBranchDetails: (r: OrgRole) => void
  collapsedSet: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <div style={{
      border: '1.5px dashed #CBD5E1',
      borderRadius: 8,
      padding: '12px 8px 8px',
      backgroundColor: '#F8FAFC',
      position: 'relative',
      minWidth: 108,
    }}>
      <div style={{
        position: 'absolute',
        top: -8,
        right: 10,
        backgroundColor: '#F8FAFC',
        padding: '0 6px',
        fontSize: 9,
        color: '#64748B',
        fontWeight: 700,
        letterSpacing: '0.05em',
      }}>
        {area}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        {nodes.map(node => (
          <OrgNode key={node.id} node={node} onEdit={onEdit} onBranchDetails={onBranchDetails} collapsedSet={collapsedSet} onToggle={onToggle} />
        ))}
      </div>
    </div>
  )
}

function OrgNode({ node, onEdit, onBranchDetails, collapsedSet, onToggle }: {
  node: TreeNode
  onEdit: (r: OrgRole) => void
  onBranchDetails: (r: OrgRole) => void
  collapsedSet: Set<string>
  onToggle: (id: string) => void
}) {
  const isCollapsed = collapsedSet.has(node.id)
  const hasChildren = node.children.length > 0
  const columns = hasChildren ? computeColumns(node.children) : []
  const isOnly = columns.length === 1
  const handleClick = node.level === HQ_LEVEL ? () => onEdit(node) : () => onBranchDetails(node)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <OrgCard
        role={node}
        childCount={node.children.length}
        collapsed={isCollapsed}
        onToggle={() => onToggle(node.id)}
        onClick={handleClick}
      />

      {hasChildren && !isCollapsed && (
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
                    paddingLeft: 6,
                    paddingRight: 6,
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
                    ? <OrgNode node={col.node} onEdit={onEdit} onBranchDetails={onBranchDetails} collapsedSet={collapsedSet} onToggle={onToggle} />
                    : <AreaGroupBox area={col.area} nodes={col.nodes} onEdit={onEdit} onBranchDetails={onBranchDetails} collapsedSet={collapsedSet} onToggle={onToggle} />
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
  onBranchDetails: (role: OrgRole) => void
}

export function OrgChartView({ roles, onEdit, onBranchDetails }: Props) {
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(1)
  const hasInitialized = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const measureAndFit = useCallback(() => {
    const content = contentRef.current
    const container = containerRef.current
    if (!content || !container) return
    const prevZoom = content.style.zoom
    content.style.zoom = '1'
    const naturalW = content.scrollWidth
    content.style.zoom = prevZoom || ''
    const containerW = container.clientWidth - 32
    if (naturalW > 0 && containerW > 0) {
      setZoom(Math.max(0.25, +Math.min(1, containerW / naturalW).toFixed(2)))
    }
  }, [])

  const roots = buildTree(roles)
  const allUnlinked = roles.every((r) => !r.reportsTo)

  useEffect(() => {
    if (roles.length > 0 && !hasInitialized.current) {
      hasInitialized.current = true
      const tree = buildTree(roles)
      const collapsed = new Set<string>()
      const collectNonRoot = (nodes: TreeNode[], isRoot: boolean) => {
        for (const node of nodes) {
          if (!isRoot && node.children.length > 0) collapsed.add(node.id)
          collectNonRoot(node.children, false)
        }
      }
      collectNonRoot(tree, true)
      setCollapsedSet(collapsed)
      setTimeout(measureAndFit, 50)
    }
  }, [roles, measureAndFit])

  useEffect(() => {
    window.addEventListener('resize', measureAndFit)
    window.addEventListener('orientationchange', measureAndFit)
    return () => {
      window.removeEventListener('resize', measureAndFit)
      window.removeEventListener('orientationchange', measureAndFit)
    }
  }, [measureAndFit])

  const toggleCollapse = (id: string) => {
    setCollapsedSet(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div ref={containerRef} className="bg-white rounded-xl shadow-sm border border-gray-100">
      {/* Zoom toolbar */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-100">
        <button
          onClick={() => setZoom(z => Math.max(0.25, +(z - 0.1).toFixed(2)))}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 font-bold text-base"
          title="הקטן"
        >−</button>
        <span className="w-10 text-center text-xs font-medium text-gray-600">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(z => Math.min(1.5, +(z + 0.1).toFixed(2)))}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 font-bold text-base"
          title="הגדל"
        >+</button>
        <button
          onClick={measureAndFit}
          className="mr-2 px-2.5 py-1 rounded text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
        >התאם למסך</button>
      </div>

      {allUnlinked && roles.length > 0 && (
        <div className="px-5 py-3 border-b border-gray-100 bg-amber-50 text-amber-700 text-xs">
          💡 לחץ על כל תפקיד ובחר "כפוף ל-" כדי לבנות את עץ הכפיפויות. תפקידים עם אותו שדה "אזור" יקובצו אוטומטית תחת כותרת אחת.
        </div>
      )}

      <div className="overflow-auto">
        <div ref={contentRef} dir="ltr" style={{ padding: 24, minWidth: 'max-content', zoom }}>
          {roots.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm" dir="rtl">
              אין תפקידים להצגה
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'center', flexWrap: 'wrap' }}>
            {roots.map((root) => (
              <OrgNode key={root.id} node={root} onEdit={onEdit} onBranchDetails={onBranchDetails} collapsedSet={collapsedSet} onToggle={toggleCollapse} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

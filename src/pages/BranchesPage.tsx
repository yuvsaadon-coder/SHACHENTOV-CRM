import { useMemo, useState } from 'react'
import { useRoles } from '../hooks/useRoles'
import { Spinner } from '../components/ui/Spinner'
import type { OrgRole, RoleLevel, VolunteerStatus } from '../types'
import { ROLE_LEVELS } from '../types'

const BRANCH_LEVELS: RoleLevel[] = ['סניף חוץ', 'סניף ירושלים', 'בתי קפה נודדים', 'טוסטר', 'סניפים עיתיים', 'יריד']

const LEVEL_COLORS: Record<string, string> = {
  'סניף חוץ':       '#141348',
  'סניף ירושלים':   '#189A9F',
  'בתי קפה נודדים': '#FDC857',
  'טוסטר':           '#3A3A6B',
  'סניפים עיתיים':  '#147F84',
  'יריד':             '#5F497A',
}

const VOL_STATUS_STYLE: Record<VolunteerStatus, React.CSSProperties> = {
  'יציב':         { backgroundColor: '#C6EFCE', color: '#0A6B2E' },
  'חוסר מתמשך':  { backgroundColor: '#FDC857', color: '#7A5A00' },
  'חוסר קריטי':  { backgroundColor: '#FEE2E2', color: '#B91C1C' },
}

const ROLE_STATUS_STYLE: Record<string, React.CSSProperties> = {
  'מאויש': { backgroundColor: '#C6EFCE', color: '#0A6B2E' },
  'חלקי':  { backgroundColor: '#FDC857', color: '#7A5A00' },
  'בסיכון': { backgroundColor: '#FEE2E2', color: '#B91C1C' },
  'חסר':   { backgroundColor: '#FEE2E2', color: '#B91C1C' },
  'אחר':   { backgroundColor: '#E4DFEC', color: '#5F497A' },
}

function VolStatusBadge({ label, status }: { label: string; status?: VolunteerStatus }) {
  if (!status) return null
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-400">{label}:</span>
      <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={VOL_STATUS_STYLE[status]}>
        {status}
      </span>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label?: string; value?: string | number | null }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <span>{icon}</span>
      {label && <span className="text-gray-400">{label}:</span>}
      <span className="font-medium" style={{ color: '#141348' }}>{value}</span>
    </div>
  )
}

function BranchCard({ role }: { role: OrgRole }) {
  const [expanded, setExpanded] = useState(false)
  const vi = role.volunteerInfo
  const levelColor = LEVEL_COLORS[role.level] ?? '#141348'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Card header */}
      <div className="px-4 py-3 flex items-start justify-between gap-2" style={{ borderRight: `4px solid ${levelColor}` }}>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate" style={{ color: '#141348' }}>
            {role.area || role.roleName}
          </div>
          {role.area && role.roleName !== role.area && (
            <div className="text-xs text-gray-400 truncate">{role.roleName}</div>
          )}
          {role.holderName && (
            <div className="text-xs text-gray-500 mt-0.5">👤 {role.holderName}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded"
            style={ROLE_STATUS_STYLE[role.status] ?? { backgroundColor: '#F3F4F6', color: '#4B5563' }}
          >
            {role.status}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `${levelColor}22`, color: levelColor }}
          >
            {role.level}
          </span>
        </div>
      </div>

      {/* Quick stats row */}
      {vi && (
        <div className="px-4 py-2 border-t border-gray-50 bg-gray-50/50 space-y-1.5">
          {/* Distribution info */}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <InfoRow icon="📦" label="תדירות" value={vi.distributionFrequency} />
            <InfoRow icon="📅" label="יום" value={vi.distributionDay} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <InfoRow icon="🧺" label="סלים שבועי" value={vi.weeklyBaskets} />
            <InfoRow icon="🗓" label="סלים חודשי" value={vi.monthlyBaskets} />
          </div>
          {vi.distributionTime && (
            <InfoRow icon="🕐" label="חלוקה" value={vi.distributionTime} />
          )}
          {vi.packagingTime && (
            <InfoRow icon="🕐" label="אריזה" value={vi.packagingTime} />
          )}
          {vi.address && (
            <InfoRow icon="📍" value={vi.address} />
          )}

          {/* Volunteer statuses */}
          {(vi.packagingStatus || vi.distributionStatus || vi.collectionStatus || vi.generalVolunteerStatus) && (
            <div className="pt-1 border-t border-gray-100 flex flex-wrap gap-x-3 gap-y-1">
              <VolStatusBadge label="אריזה" status={vi.packagingStatus} />
              <VolStatusBadge label="חלוקה" status={vi.distributionStatus} />
              <VolStatusBadge label="איסוף" status={vi.collectionStatus} />
              {!vi.packagingStatus && !vi.distributionStatus && !vi.collectionStatus && (
                <VolStatusBadge label="כללי" status={vi.generalVolunteerStatus} />
              )}
            </div>
          )}

          {/* Expanded extras */}
          {expanded && (
            <div className="pt-2 border-t border-gray-100 space-y-1">
              <InfoRow icon="📊" label="יעד מתנדבי אריזה" value={vi.targetPackagingVolunteers} />
              <InfoRow icon="📊" label="יעד מתנדבי חלוקה" value={vi.targetDistributionVolunteers} />
              {vi.acceptsGroups !== undefined && (
                <div className="text-xs text-gray-600">
                  {vi.acceptsGroups ? '✅ מקבל קבוצות' : '❌ לא מקבל קבוצות'}
                </div>
              )}
              {role.email && <InfoRow icon="📧" value={role.email} />}
              {role.phone && <InfoRow icon="📞" value={role.phone} />}
              {role.notes && (
                <div className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{role.notes}</div>
              )}
            </div>
          )}

          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-brand-teal hover:underline mt-1"
          >
            {expanded ? '▲ פחות' : '▼ עוד פרטים'}
          </button>
        </div>
      )}

      {/* No volunteer info */}
      {!vi && (
        <div className="px-4 py-2 border-t border-gray-50 text-xs text-gray-400">
          אין נתוני תפעול
        </div>
      )}
    </div>
  )
}

export function BranchesPage() {
  const { roles, loading, error } = useRoles()
  const [levelFilter, setLevelFilter] = useState<RoleLevel | ''>('')
  const [search, setSearch] = useState('')

  const branchRoles = useMemo(
    () => roles.filter((r) => BRANCH_LEVELS.includes(r.level as RoleLevel)),
    [roles]
  )

  const availableLevels = useMemo(
    () => ROLE_LEVELS.filter((l) => BRANCH_LEVELS.includes(l) && branchRoles.some((r) => r.level === l)),
    [branchRoles]
  )

  const filtered = useMemo(() => {
    return branchRoles.filter((r) => {
      if (levelFilter && r.level !== levelFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          (r.area || '').toLowerCase().includes(q) ||
          (r.roleName || '').toLowerCase().includes(q) ||
          (r.holderName || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [branchRoles, levelFilter, search])

  // Group by level
  const byLevel = useMemo(() => {
    const groups: { level: RoleLevel; roles: OrgRole[] }[] = []
    const levels = levelFilter
      ? [levelFilter as RoleLevel]
      : (availableLevels as RoleLevel[])
    for (const level of levels) {
      const levelRoles = filtered.filter((r) => r.level === level)
      if (levelRoles.length > 0) groups.push({ level, roles: levelRoles })
    }
    return groups
  }, [filtered, levelFilter, availableLevels])

  if (loading) return <Spinner size="lg" />

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
        שגיאה בטעינת נתונים: {error}
        <div className="mt-2 text-xs">יש לעדכן את כללי האבטחה ב-Firebase Console (Firestore → Rules)</div>
      </div>
    )
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-brand-navy">סניפים ({branchRoles.length})</h1>
        <span className="text-sm text-gray-400">{filtered.length} מוצגים</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="חיפוש לפי שם / אחראי..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal w-full sm:w-52"
        />
        <button
          onClick={() => setLevelFilter('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            !levelFilter ? 'bg-brand-navy text-white border-brand-navy' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          כל הרמות
        </button>
        {availableLevels.map((level) => {
          const color = LEVEL_COLORS[level] ?? '#141348'
          const isActive = levelFilter === level
          return (
            <button
              key={level}
              onClick={() => setLevelFilter(isActive ? '' : level)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={{
                backgroundColor: isActive ? color : 'white',
                color: isActive ? 'white' : color,
                borderColor: color,
              }}
            >
              {level} ({branchRoles.filter((r) => r.level === level).length})
            </button>
          )
        })}
      </div>

      {/* Grouped cards */}
      {byLevel.length === 0 && (
        <div className="text-center py-12 text-gray-400">אין סניפים להצגה</div>
      )}

      {byLevel.map(({ level, roles: levelRoles }) => (
        <div key={level}>
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-1 h-5 rounded-full"
              style={{ backgroundColor: LEVEL_COLORS[level] ?? '#141348' }}
            />
            <h2 className="font-bold text-sm" style={{ color: LEVEL_COLORS[level] ?? '#141348' }}>
              {level}
            </h2>
            <span className="text-xs text-gray-400">({levelRoles.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
            {levelRoles.map((role) => (
              <BranchCard key={role.id} role={role} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

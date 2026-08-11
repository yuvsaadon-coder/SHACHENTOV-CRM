import { useState, useEffect } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import type { OrgRole, BranchVolunteerInfo, VolunteerStatus, SeasonalPeriod, QuarterlyReport } from '../../types'
import { FOOD_BRANCH_LEVELS, VOLUNTEER_STATUS_OPTIONS, DIST_FREQ_OPTIONS, QUARTER_LABELS } from '../../types'
import { useQuarterlyReports } from '../../hooks/useQuarterlyReports'

const VOL_COLORS: Record<VolunteerStatus, { bg: string; text: string; border: string }> = {
  'יציב':         { bg: '#C6EFCE', text: '#0A6B2E', border: '#0A6B2E' },
  'חוסר מתמשך':   { bg: '#FED7AA', text: '#9A3412', border: '#C2410C' },
  'חוסר קריטי':   { bg: '#FEE2E2', text: '#B91C1C', border: '#B91C1C' },
}

function VolChip({ value, onChange }: { value?: VolunteerStatus; onChange: (v: VolunteerStatus) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {VOLUNTEER_STATUS_OPTIONS.map(opt => {
        const c = VOL_COLORS[opt]
        const selected = value === opt
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              fontSize: 11,
              padding: '3px 10px',
              borderRadius: 14,
              border: `1.5px solid ${selected ? c.border : '#D1D5DB'}`,
              backgroundColor: selected ? c.bg : 'white',
              color: selected ? c.text : '#6B7280',
              cursor: 'pointer',
              fontWeight: selected ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

type PanelTab = 'volunteer' | 'reports'

function ReportAccordion({ report }: { report: QuarterlyReport }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white hover:bg-gray-50 text-right"
      >
        <div>
          <span className="text-sm font-medium" style={{ color: '#141348' }}>
            {QUARTER_LABELS[report.quarter]} {report.year}
          </span>
          <span className="text-xs text-gray-400 mr-2">
            {report.submittedAt?.toDate?.().toLocaleDateString('he-IL')}
          </span>
        </div>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs space-y-1">
          {Object.entries(report.data).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-gray-500 shrink-0 w-28">{k}:</span>
              <span style={{ color: '#141348' }}>
                {typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '—')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  role: OrgRole
  branchId?: string
  onClose: () => void
  onEditRole: (role: OrgRole) => void
}

export function BranchDetailsPanel({ role, branchId, onClose, onEditRole }: Props) {
  const isFoodBranch = FOOD_BRANCH_LEVELS.includes(role.level)
  const [tab, setTab] = useState<PanelTab>('volunteer')
  const [info, setInfo] = useState<BranchVolunteerInfo>(role.volunteerInfo ?? {})
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const { reports } = useQuarterlyReports(branchId ?? null)

  useEffect(() => {
    setInfo(role.volunteerInfo ?? {})
    setDirty(false)
  }, [role.id, role.volunteerInfo])

  const upd = (patch: Partial<BranchVolunteerInfo>) => {
    setInfo(prev => ({ ...prev, ...patch }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'roles', role.id), { volunteerInfo: info })
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const addSeasonal = () => {
    const periods: SeasonalPeriod[] = [...(info.seasonalPeriods ?? []), { name: '', hasMoreVolunteers: false, description: '' }]
    upd({ seasonalPeriods: periods })
  }

  const updSeasonal = (i: number, patch: Partial<SeasonalPeriod>) => {
    const periods = [...(info.seasonalPeriods ?? [])]
    periods[i] = { ...periods[i], ...patch }
    upd({ seasonalPeriods: periods })
  }

  const removeSeasonal = (i: number) => {
    const periods = [...(info.seasonalPeriods ?? [])]
    periods.splice(i, 1)
    upd({ seasonalPeriods: periods })
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        dir="rtl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold" style={{ color: '#141348' }}>{role.roleName}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {role.level}{role.area ? ` · ${role.area}` : ''}{role.holderName ? ` · ${role.holderName}` : ''}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => { onClose(); onEditRole(role) }}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                ערוך תפקיד
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-1">×</button>
            </div>
          </div>
          {branchId && (
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              <button
                onClick={() => setTab('volunteer')}
                className="flex-1 py-1.5 transition-colors"
                style={{
                  backgroundColor: tab === 'volunteer' ? '#141348' : 'transparent',
                  color: tab === 'volunteer' ? 'white' : '#6B7280',
                }}
              >
                פרטי סניף
              </button>
              <button
                onClick={() => setTab('reports')}
                className="flex-1 py-1.5 transition-colors"
                style={{
                  backgroundColor: tab === 'reports' ? '#141348' : 'transparent',
                  color: tab === 'reports' ? 'white' : '#6B7280',
                }}
              >
                דיווחים רבעוניים ({reports.length})
              </button>
            </div>
          )}
        </div>

        <div className="p-5 space-y-6">
          {tab === 'reports' ? (
            <div className="space-y-2">
              {reports.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">אין דיווחים עדיין</p>
              ) : (
                reports.map((r) => <ReportAccordion key={r.id} report={r} />)
              )}
            </div>
          ) : isFoodBranch ? (
            <>
              {/* Volunteer status by type */}
              <section>
                <h3 className="text-sm font-bold text-gray-700 mb-3">סטטוס מתנדבים</h3>
                <div className="space-y-3">
                  {([
                    ['packagingStatus', 'מתנדבי אריזה'],
                    ['distributionStatus', 'מתנדבי חלוקה'],
                    ['collectionStatus', 'מתנדבי איסוף'],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-3 flex-wrap">
                      <span className="text-sm text-gray-600 w-28 shrink-0">{label}</span>
                      <VolChip value={info[key]} onChange={v => upd({ [key]: v })} />
                    </div>
                  ))}
                </div>
              </section>

              {/* Targets */}
              <section>
                <h3 className="text-sm font-bold text-gray-700 mb-3">יעדי מתנדבים</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">יעד מתנדבי אריזה</label>
                    <input
                      type="number"
                      min={0}
                      value={info.targetPackagingVolunteers ?? ''}
                      onChange={e => upd({ targetPackagingVolunteers: e.target.value ? +e.target.value : null })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                      placeholder="כמות"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">יעד מתנדבי חלוקה</label>
                    <input
                      type="number"
                      min={0}
                      value={info.targetDistributionVolunteers ?? ''}
                      onChange={e => upd({ targetDistributionVolunteers: e.target.value ? +e.target.value : null })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                      placeholder="כמות"
                    />
                  </div>
                </div>
              </section>

              {/* Operations */}
              <section>
                <h3 className="text-sm font-bold text-gray-700 mb-3">פרטי פעילות</h3>

                {/* Address */}
                <div className="mb-3">
                  <label className="block text-xs text-gray-500 mb-1">כתובת סניף</label>
                  <input
                    type="text"
                    value={info.address ?? ''}
                    onChange={e => upd({ address: e.target.value || undefined })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                    placeholder="רחוב, שכונה, ירושלים"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">תדירות חלוקה</label>
                    <select
                      value={info.distributionFrequency ?? ''}
                      onChange={e => upd({ distributionFrequency: e.target.value || undefined })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                    >
                      <option value="">בחר...</option>
                      {DIST_FREQ_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">יום פעילות</label>
                    <select
                      value={info.distributionDay ?? ''}
                      onChange={e => upd({ distributionDay: e.target.value || undefined })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                    >
                      <option value="">בחר...</option>
                      {['ראשון','שני','שלישי','רביעי','חמישי','שישי','משתנה'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">סלים לחלוקה</label>
                    <input
                      type="number"
                      min={0}
                      value={info.weeklyBaskets ?? ''}
                      onChange={e => upd({ weeklyBaskets: e.target.value ? +e.target.value : null })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                      placeholder="כמות"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">סלים חודשי סה"כ</label>
                    <input
                      type="number"
                      min={0}
                      value={info.monthlyBaskets ?? ''}
                      onChange={e => upd({ monthlyBaskets: e.target.value ? +e.target.value : null })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                      placeholder="כמות"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">זמן אריזה</label>
                    <input
                      type="text"
                      value={info.packagingTime ?? ''}
                      onChange={e => upd({ packagingTime: e.target.value || undefined })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                      placeholder="09:00–10:00"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">זמן חלוקה</label>
                    <input
                      type="text"
                      value={info.distributionTime ?? ''}
                      onChange={e => upd({ distributionTime: e.target.value || undefined })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                      placeholder="10:30–12:00"
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="acceptsGroups"
                    checked={info.acceptsGroups ?? false}
                    onChange={e => upd({ acceptsGroups: e.target.checked })}
                    className="w-4 h-4"
                    style={{ accentColor: '#189A9F' }}
                  />
                  <label htmlFor="acceptsGroups" className="text-sm text-gray-700">קולט קבוצות מתנדבים</label>
                </div>
              </section>

              {/* Seasonal periods */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-700">תקופות עונתיות</h3>
                  <button onClick={addSeasonal} className="text-xs text-[#189A9F] hover:underline font-medium">
                    + הוסף תקופה
                  </button>
                </div>
                {(info.seasonalPeriods ?? []).length === 0 && (
                  <p className="text-xs text-gray-400 italic">אין תקופות מוגדרות</p>
                )}
                <div className="space-y-2">
                  {(info.seasonalPeriods ?? []).map((period, i) => (
                    <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
                      <div className="flex gap-2 items-center">
                        <input
                          value={period.name}
                          onChange={e => updSeasonal(i, { name: e.target.value })}
                          className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#189A9F] bg-white"
                          placeholder="שם התקופה (לדוג׳: קיץ)"
                        />
                        <button onClick={() => removeSeasonal(i)} className="text-red-400 hover:text-red-600 text-lg leading-none px-1">✕</button>
                      </div>
                      <input
                        value={period.description}
                        onChange={e => updSeasonal(i, { description: e.target.value })}
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#189A9F] bg-white"
                        placeholder="תיאור (לדוג׳: בתי ספר לא נמצאים)"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`moreVol-${i}`}
                          checked={period.hasMoreVolunteers}
                          onChange={e => updSeasonal(i, { hasMoreVolunteers: e.target.checked })}
                          className="w-3.5 h-3.5"
                          style={{ accentColor: '#189A9F' }}
                        />
                        <label htmlFor={`moreVol-${i}`} className="text-xs text-gray-600">בתקופה זו יש יותר מתנדבים</label>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <section>
              <h3 className="text-sm font-bold text-gray-700 mb-3">סטטוס מתנדבים כללי</h3>
              <VolChip
                value={info.generalVolunteerStatus}
                onChange={v => upd({ generalVolunteerStatus: v })}
              />
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="px-5 py-2 text-sm rounded-lg text-white font-medium transition-opacity disabled:opacity-40"
            style={{ backgroundColor: '#141348' }}
          >
            {saving ? 'שומר...' : 'שמור שינויים'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  )
}

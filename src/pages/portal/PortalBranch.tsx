import { useOutletContext } from 'react-router-dom'
import { OrgLogo } from '../../components/ui/OrgLogo'
import { useBranchSuppliers, type BranchContact } from '../../hooks/useBranchSuppliers'
import { distinctContacts, telHref } from '../../lib/branchContacts'
import type { PortalOutletContext } from './CoordinatorPortal'

const TYPE_LABELS = { food: 'סלי מזון', cafe_youth: 'בית קפה / נוער' } as const
const PARTNER_TYPE_LABELS: Record<string, string> = { payment: 'מערכת סליקה', volunteering: 'פלטפורמת התנדבות', partner: 'שותף' }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-gray-400 w-24 shrink-0">{label}</span>
      <span className="font-medium min-w-0 break-words" style={{ color: '#141348' }}>{children}</span>
    </div>
  )
}

function ContactLine({ name, role, organization, phone, email }: BranchContact) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs">
      <div className="font-medium" style={{ color: '#141348' }}>
        👤 {name}
        {(role || organization) && <span className="text-gray-400 font-normal"> · {[role, organization].filter(Boolean).join(', ')}</span>}
      </div>
      {(phone || email) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
          {phone && <a href={telHref(phone)} className="text-[#189A9F]" dir="ltr">📞 {phone}</a>}
          {email && <a href={`mailto:${email}`} className="text-[#189A9F] break-all" dir="ltr">✉️ {email}</a>}
        </div>
      )}
    </div>
  )
}

function OrgCard({ name, subtitle, logoUrl, websiteUrl, own, contacts }: {
  name: string; subtitle?: string; logoUrl?: string; websiteUrl?: string
  own: { contactName?: string; phone?: string; email?: string }; contacts: BranchContact[]
}) {
  const linked = distinctContacts(own, contacts)
  const hasOwn = own.contactName || own.phone || own.email
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-3">
        <OrgLogo name={name} logoUrl={logoUrl} websiteUrl={websiteUrl} size={44} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm" style={{ color: '#141348' }}>{name}</div>
          {subtitle && <div className="text-xs text-gray-400 truncate">{subtitle}</div>}
        </div>
        {websiteUrl && (
          <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-600 shrink-0">🌐 אתר</a>
        )}
      </div>
      {hasOwn && <ContactLine name={own.contactName ?? name} phone={own.phone} email={own.email} />}
      {linked.map((c, i) => <ContactLine key={`${c.name}-${i}`} {...c} />)}
      {!hasOwn && linked.length === 0 && <p className="text-xs text-gray-400">אין פרטי קשר שמורים</p>}
    </div>
  )
}

export function PortalBranch() {
  const { branch } = useOutletContext<PortalOutletContext>()
  const { suppliers, partners, loading, error } = useBranchSuppliers(branch.id)

  const hasOps = branch.distributionFrequency || branch.distributionDay || branch.packagingTime || branch.distributionTime
    || branch.weeklyBaskets || branch.monthlyBaskets || branch.address || branch.acceptsGroups !== undefined

  return (
    <div className="p-4 space-y-5 max-w-lg mx-auto" dir="rtl">
      <section>
        <h1 className="font-bold mb-3" style={{ color: '#141348' }}>נתוני הסניף</h1>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
          <Row label="סניף">{branch.name}</Row>
          <Row label="עיר">{branch.city}</Row>
          <Row label="סוג">{TYPE_LABELS[branch.type] ?? branch.type}</Row>
          {branch.distributionFrequency && <Row label="תדירות">{branch.distributionFrequency}</Row>}
          {branch.distributionDay && <Row label="יום חלוקה">{branch.distributionDay}</Row>}
          {branch.packagingTime && <Row label="שעת אריזה"><span dir="ltr">{branch.packagingTime}</span></Row>}
          {branch.distributionTime && <Row label="שעת חלוקה"><span dir="ltr">{branch.distributionTime}</span></Row>}
          {!!branch.weeklyBaskets && <Row label="סלים בשבוע">{branch.weeklyBaskets}</Row>}
          {!!branch.monthlyBaskets && <Row label="סלים בחודש">{branch.monthlyBaskets}</Row>}
          {branch.address && <Row label="כתובת">{branch.address}</Row>}
          {branch.acceptsGroups !== undefined && <Row label="קולט קבוצות">{branch.acceptsGroups ? 'כן' : 'לא'}</Row>}
          {!hasOps && <p className="text-xs text-gray-400">נתוני התפעול של הסניף עדיין לא הוזנו. אפשר לבקש ממטה העמותה לעדכן.</p>}
        </div>
        <p className="text-xs text-gray-400 mt-2">הנתונים מתעדכנים על ידי מטה העמותה.</p>
      </section>

      <section>
        <h2 className="font-bold mb-3" style={{ color: '#141348' }}>הספקים והשותפים של הסניף</h2>
        {loading ? (
          <div className="text-sm text-gray-400 text-center py-4">טוען...</div>
        ) : error ? (
          <div className="bg-white rounded-xl p-4 text-center text-sm text-gray-400 border border-gray-100">לא ניתן לטעון את הספקים כרגע. נסה שוב מאוחר יותר.</div>
        ) : suppliers.length === 0 && partners.length === 0 ? (
          <div className="bg-white rounded-xl p-4 text-center text-sm text-gray-400 border border-gray-100">עדיין לא שויכו ספקים או שותפים לסניף</div>
        ) : (
          <div className="space-y-3">
            {suppliers.map((s) => (
              <OrgCard key={s.id} name={s.name} subtitle={s.categories.join(', ') || 'ספק'} logoUrl={s.logoUrl} websiteUrl={s.websiteUrl}
                own={{ contactName: s.contactName, phone: s.phone, email: s.email }} contacts={s.contacts} />
            ))}
            {partners.map((p) => (
              <OrgCard key={p.id} name={p.name} subtitle={PARTNER_TYPE_LABELS[p.partnerType ?? 'partner'] ?? 'שותף'} logoUrl={p.logoUrl} websiteUrl={p.websiteUrl}
                own={{}} contacts={p.contacts} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

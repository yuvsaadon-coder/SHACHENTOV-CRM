import { useState, useMemo } from 'react'
import { useContacts } from '../hooks/useContacts'
import { useTasks } from '../hooks/useTasks'
import { Spinner } from '../components/ui/Spinner'
import { exportContacts } from '../utils/export'
import type { Contact, ContactType } from '../types'
import { DOMAINS, DOMAIN_LABELS } from '../types'

const ROLE_CONTACT_CATEGORY = 'רכזי סניפים ופעילי עמותה'
type Section = 'all' | 'general' | 'roles'

// ── Edit Modal ────────────────────────────────────────────────────────────────

function ContactEditModal({
  contact,
  onSave,
  onClose,
}: {
  contact: Contact
  onSave: (data: Partial<Omit<Contact, 'id'>>) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState({
    name: contact.name,
    type: contact.type as ContactType,
    phone: contact.phone,
    email: contact.email,
    organization: contact.organization ?? '',
    role: contact.role ?? '',
    category: contact.category ?? '',
    ownerInOrg: contact.ownerInOrg ?? '',
    cadence: contact.cadence ?? '',
    notes: contact.notes,
    domainTags: contact.domainTags,
    needsInfo: contact.needsInfo ?? false,
  })
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: val }))

  const toggleDomain = (d: string) => {
    set('domainTags', form.domainTags.includes(d)
      ? form.domainTags.filter((t) => t !== d)
      : [...form.domainTags, d])
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const data: Partial<Omit<Contact, 'id'>> = {
        name: form.name.trim(),
        type: form.type,
        phone: form.phone.trim(),
        email: form.email.trim(),
        notes: form.notes.trim(),
        domainTags: form.domainTags,
        needsInfo: form.needsInfo,
      }
      if (form.organization.trim()) data.organization = form.organization.trim()
      if (form.role.trim()) data.role = form.role.trim()
      if (form.category.trim()) data.category = form.category.trim()
      if (form.ownerInOrg.trim()) data.ownerInOrg = form.ownerInOrg.trim()
      if (form.cadence.trim()) data.cadence = form.cadence.trim()
      await onSave(data)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: '#141348' }}>עריכת איש קשר</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">שם *</label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">סוג</label>
              <select
                value={form.type}
                onChange={(e) => set('type', e.target.value as ContactType)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              >
                <option value="מטה">מטה</option>
                <option value="ספק">ספק</option>
                <option value="תורם">תורם</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">טלפון</label>
              <input
                dir="ltr"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">אימייל</label>
              <input
                dir="ltr"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">תפקיד</label>
              <input
                value={form.role}
                onChange={(e) => set('role', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ארגון / חברה</label>
              <input
                value={form.organization}
                onChange={(e) => set('organization', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">קטגוריה</label>
              <input
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
                placeholder="למשל: רכזי סניפים ופעילי עמותה"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">בעל קשר בארגון</label>
              <input
                value={form.ownerInOrg}
                onChange={(e) => set('ownerInOrg', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">תדירות קשר</label>
            <input
              value={form.cadence}
              onChange={(e) => set('cadence', e.target.value)}
              placeholder="למשל: שבועי, חודשי..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">תחומים</label>
            <div className="flex flex-wrap gap-1.5">
              {DOMAINS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDomain(d)}
                  className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                    form.domainTags.includes(d)
                      ? 'border-[#189A9F] bg-[#E6F4F4] text-[#189A9F]'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {DOMAIN_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">הערות</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F] resize-none"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={form.needsInfo}
              onChange={(e) => set('needsInfo', e.target.checked)}
              className="w-4 h-4"
              style={{ accentColor: '#189A9F' }}
            />
            חסרים פרטי קשר
          </label>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={() => void handleSave()}
            disabled={saving || !form.name.trim()}
            className="px-5 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
            style={{ backgroundColor: '#141348' }}
          >
            {saving ? 'שומר...' : 'שמור'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ContactsPage() {
  const { contacts, loading, updateContact } = useContacts()
  const { tasks } = useTasks()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ContactType | ''>('')
  const [section, setSection] = useState<Section>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<Contact | null>(null)

  const generalCount = useMemo(() => contacts.filter((c) => c.category !== ROLE_CONTACT_CATEGORY).length, [contacts])
  const roleCount = useMemo(() => contacts.filter((c) => c.category === ROLE_CONTACT_CATEGORY).length, [contacts])

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      const isRoleContact = c.category === ROLE_CONTACT_CATEGORY
      if (section === 'general' && isRoleContact) return false
      if (section === 'roles' && !isRoleContact) return false
      if (typeFilter && c.type !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.category ?? '').toLowerCase().includes(q) ||
          (c.organization ?? '').toLowerCase().includes(q) ||
          (c.role ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [contacts, search, typeFilter, section])

  const selectedContact = selected ? contacts.find((c) => c.id === selected) : null
  const contactTasks = selectedContact
    ? tasks.filter((t) => t.contactRefs.includes(selectedContact.id) || t.activator === selectedContact.name)
    : []

  if (loading) return <Spinner size="lg" />

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      {/* List */}
      <div className="flex-1 flex flex-col gap-3 overflow-auto min-w-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold text-brand-navy">אנשי קשר</h1>
          <button
            onClick={() => exportContacts(filtered)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
          >
            ייצוא CSV
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs w-fit">
          {([['all', `הכל (${contacts.length})`], ['general', `אנשי קשר כלליים (${generalCount})`], ['roles', `רכזי סניפים ופעילי עמותה (${roleCount})`]] as [Section, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setSection(val)}
              className="px-3 py-1.5 transition-colors border-r border-gray-200 last:border-r-0"
              style={section === val
                ? { backgroundColor: '#141348', color: 'white' }
                : { color: '#374151' }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="חיפוש..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ContactType | '')}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            <option value="">כל הסוגים</option>
            <option value="מטה">מטה</option>
            <option value="ספק">ספק</option>
            <option value="תורם">תורם</option>
          </select>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-brand-teal050 text-brand-navy border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-right font-medium">שם</th>
                <th className="px-4 py-2.5 text-right font-medium">תפקיד / חברה</th>
                <th className="px-4 py-2.5 text-right font-medium">קטגוריה</th>
                <th className="px-4 py-2.5 text-right font-medium">סוג</th>
                <th className="px-4 py-2.5 text-right font-medium">טלפון</th>
                <th className="px-4 py-2.5 text-right font-medium">אימייל</th>
                <th className="px-3 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelected(c.id === selected ? null : c.id)}
                  className={`border-b border-gray-50 cursor-pointer transition-colors ${
                    selected === c.id ? 'bg-brand-teal050' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-4 py-2.5 font-medium text-brand-navy">{c.name}</td>
                  <td className="px-4 py-2.5 text-gray-500">{c.role || c.organization || '—'}</td>
                  <td className="px-4 py-2.5">
                    {c.category
                      ? <span className="bg-[#E6F4F4] text-[#147F84] text-xs px-2 py-0.5 rounded-full">{c.category}</span>
                      : <span className="text-gray-300 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">{c.type}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600" dir="ltr">{c.phone || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600 max-w-[140px] truncate">{c.email || '—'}</td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditing(c) }}
                      className="text-gray-300 hover:text-[#189A9F] transition-colors p-1 rounded"
                      title="עריכה"
                    >
                      ✏️
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">אין תוצאות</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selectedContact && (
        <div className="w-80 bg-white rounded-xl shadow-sm border border-gray-100 p-5 shrink-0 overflow-auto">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="font-bold text-brand-navy text-lg">{selectedContact.name}</h2>
              <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">{selectedContact.type}</span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setEditing(selectedContact)}
                className="text-gray-400 hover:text-[#189A9F] text-sm p-1"
                title="עריכה"
              >
                ✏️
              </button>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            {selectedContact.category && (
              <div>
                <div className="text-xs text-gray-400">קטגוריה</div>
                <span className="bg-[#E6F4F4] text-[#147F84] text-xs px-2 py-0.5 rounded-full">{selectedContact.category}</span>
              </div>
            )}
            {(selectedContact.role || selectedContact.organization) && (
              <div>
                <div className="text-xs text-gray-400">תפקיד / חברה</div>
                <div>{selectedContact.role || selectedContact.organization}</div>
              </div>
            )}
            {selectedContact.ownerInOrg && (
              <div>
                <div className="text-xs text-gray-400">בעל קשר</div>
                <div>{selectedContact.ownerInOrg}</div>
              </div>
            )}
            {selectedContact.cadence && (
              <div>
                <div className="text-xs text-gray-400">תדירות קשר</div>
                <div>{selectedContact.cadence}</div>
              </div>
            )}
            {selectedContact.phone && (
              <div>
                <div className="text-xs text-gray-400">טלפון</div>
                <div dir="ltr">{selectedContact.phone}</div>
              </div>
            )}
            {selectedContact.email && (
              <div>
                <div className="text-xs text-gray-400">אימייל</div>
                <div>{selectedContact.email}</div>
              </div>
            )}
            {selectedContact.needsInfo && (
              <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                חסרים פרטי קשר
              </div>
            )}
            {selectedContact.notes && (
              <div>
                <div className="text-xs text-gray-400">הערות</div>
                <div className="text-gray-700">{selectedContact.notes}</div>
              </div>
            )}
            {selectedContact.domainTags.length > 0 && (
              <div>
                <div className="text-xs text-gray-400 mb-1">תחומים</div>
                <div className="flex flex-wrap gap-1">
                  {selectedContact.domainTags.map((tag) => (
                    <span key={tag} className="bg-brand-teal050 text-brand-teal text-xs px-2 py-0.5 rounded">{tag}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {contactTasks.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <div className="text-xs text-gray-400 mb-2">משימות מקושרות ({contactTasks.length})</div>
              <ul className="space-y-1">
                {contactTasks.map((t) => (
                  <li key={t.id} className="text-xs text-brand-teal hover:underline">
                    <a href={`/tasks/${t.id}`}>{t.title}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {editing && (
        <ContactEditModal
          contact={editing}
          onSave={(data) => updateContact(editing.id, data)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

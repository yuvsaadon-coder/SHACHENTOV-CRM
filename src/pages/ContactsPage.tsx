import { useState, useMemo } from 'react'
import { useContacts } from '../hooks/useContacts'
import { useTasks } from '../hooks/useTasks'
import { Spinner } from '../components/ui/Spinner'
import { exportContacts } from '../utils/export'
import type { Contact, ContactType } from '../types'
import { DOMAINS, DOMAIN_LABELS } from '../types'

const ROLE_CONTACT_CATEGORY = 'רכזי סניפים ופעילי עמותה'
type Section = 'all' | 'general' | 'roles'

const EMPTY_CONTACT: Omit<Contact, 'id'> = {
  name: '', type: 'מטה', phone: '', email: '', notes: '', domainTags: [],
  organization: '', role: '', category: '', ownerInOrg: '', cadence: '', needsInfo: false,
}

// ── Contact form (shared by Add + Edit modals) ────────────────────────────────

type ContactForm = {
  name: string; type: ContactType; phone: string; email: string
  organization: string; role: string; category: string; ownerInOrg: string
  cadence: string; notes: string; domainTags: string[]; needsInfo: boolean
}

function formFromContact(c: Omit<Contact, 'id'>): ContactForm {
  return {
    name: c.name, type: c.type, phone: c.phone, email: c.email,
    notes: c.notes, domainTags: c.domainTags,
    organization: c.organization ?? '', role: c.role ?? '',
    category: c.category ?? '', ownerInOrg: c.ownerInOrg ?? '',
    cadence: c.cadence ?? '', needsInfo: c.needsInfo ?? false,
  }
}

function formToContact(f: ContactForm): Omit<Contact, 'id'> {
  const base: Omit<Contact, 'id'> = {
    name: f.name.trim(), type: f.type, phone: f.phone.trim(),
    email: f.email.trim(), notes: f.notes.trim(), domainTags: f.domainTags,
    needsInfo: f.needsInfo,
  }
  if (f.organization.trim()) base.organization = f.organization.trim()
  if (f.role.trim()) base.role = f.role.trim()
  if (f.category.trim()) base.category = f.category.trim()
  if (f.ownerInOrg.trim()) base.ownerInOrg = f.ownerInOrg.trim()
  if (f.cadence.trim()) base.cadence = f.cadence.trim()
  return base
}

function ContactFormFields({ form, onChange }: { form: ContactForm; onChange: (f: ContactForm) => void }) {
  const set = <K extends keyof ContactForm>(key: K, val: ContactForm[K]) =>
    onChange({ ...form, [key]: val })

  const toggleDomain = (d: string) =>
    set('domainTags', form.domainTags.includes(d)
      ? form.domainTags.filter((t) => t !== d)
      : [...form.domainTags, d])

  return (
    <div className="space-y-4">
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
          <input dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">אימייל</label>
          <input dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">תפקיד</label>
          <input value={form.role} onChange={(e) => set('role', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ארגון / חברה</label>
          <input value={form.organization} onChange={(e) => set('organization', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">קטגוריה</label>
          <input value={form.category} onChange={(e) => set('category', e.target.value)}
            placeholder="למשל: רכזי סניפים"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">בעל קשר בארגון</label>
          <input value={form.ownerInOrg} onChange={(e) => set('ownerInOrg', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">תדירות קשר</label>
        <input value={form.cadence} onChange={(e) => set('cadence', e.target.value)}
          placeholder="שבועי, חודשי..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">תחומים</label>
        <div className="flex flex-wrap gap-1.5">
          {DOMAINS.map((d) => (
            <button key={d} type="button" onClick={() => toggleDomain(d)}
              className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                form.domainTags.includes(d)
                  ? 'border-[#189A9F] bg-[#E6F4F4] text-[#189A9F]'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {DOMAIN_LABELS[d]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">הערות</label>
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)}
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F] resize-none" />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={form.needsInfo} onChange={(e) => set('needsInfo', e.target.checked)}
          className="w-4 h-4" style={{ accentColor: '#189A9F' }} />
        חסרים פרטי קשר
      </label>
    </div>
  )
}

// ── Add Modal ─────────────────────────────────────────────────────────────────

function ContactAddModal({ onSave, onClose }: {
  onSave: (data: Omit<Contact, 'id'>) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<ContactForm>(formFromContact(EMPTY_CONTACT))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try { await onSave(formToContact(form)); onClose() }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: '#141348' }}>איש קשר חדש</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5">
          <ContactFormFields form={form} onChange={setForm} />
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={() => void handleSave()} disabled={saving || !form.name.trim()}
            className="px-5 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
            style={{ backgroundColor: '#141348' }}>
            {saving ? 'שומר...' : 'הוסף'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">ביטול</button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function ContactEditModal({ contact, onSave, onDelete, onClose }: {
  contact: Contact
  onSave: (data: Partial<Omit<Contact, 'id'>>) => Promise<void>
  onDelete: () => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<ContactForm>(formFromContact(contact))
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try { await onSave(formToContact(form)); onClose() }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try { await onDelete(); onClose() }
    finally { setDeleting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: '#141348' }}>עריכת איש קשר</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5">
          <ContactFormFields form={form} onChange={setForm} />
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 items-center">
          <button onClick={() => void handleSave()} disabled={saving || !form.name.trim()}
            className="px-5 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
            style={{ backgroundColor: '#141348' }}>
            {saving ? 'שומר...' : 'שמור'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">ביטול</button>
          <button onClick={() => void handleDelete()} disabled={deleting || saving}
            className={`mr-auto px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50 transition-colors ${
              confirmDelete ? 'bg-red-600 text-white' : 'border border-red-300 text-red-600 hover:bg-red-50'
            }`}>
            {deleting ? 'מוחק...' : confirmDelete ? 'אשר מחיקה' : 'מחק'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ContactsPage() {
  const { contacts, loading, addContact, updateContact, deleteContact } = useContacts()
  const { tasks } = useTasks()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ContactType | ''>('')
  const [section, setSection] = useState<Section>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [adding, setAdding] = useState(false)

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

  const sections: { key: Section; label: string; count: number }[] = [
    { key: 'all', label: 'הכל', count: contacts.length },
    { key: 'general', label: 'אנשי קשר כלליים', count: generalCount },
    { key: 'roles', label: 'רכזים ופעילים', count: roleCount },
  ]

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">אנשי קשר</h1>
          <p className="text-sm text-gray-400 mt-0.5">{contacts.length} אנשי קשר במערכת</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportContacts(filtered)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
          >
            ייצוא CSV
          </button>
          <button
            onClick={() => setAdding(true)}
            className="px-4 py-1.5 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#141348' }}
          >
            + הוסף איש קשר
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {sections.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={section === key
              ? { backgroundColor: 'white', color: '#141348', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
              : { color: '#6B7280' }}
          >
            {label}
            <span className={`mr-1.5 text-xs px-1.5 py-0.5 rounded-full ${
              section === key ? 'bg-[#E6F4F4] text-[#147F84]' : 'bg-gray-200 text-gray-500'
            }`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Search + type filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="חיפוש לפי שם, טלפון, תפקיד..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal w-64"
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
        {(search || typeFilter) && (
          <button onClick={() => { setSearch(''); setTypeFilter('') }}
            className="text-xs text-gray-400 hover:text-red-500 underline">
            נקה
          </button>
        )}
        <span className="text-xs text-gray-400 mr-1">{filtered.length} תוצאות</span>
      </div>

      {/* Main content */}
      <div className="flex gap-4">
        {/* Table */}
        <div className="flex-1 min-w-0 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">שם</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">תפקיד / ארגון</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">קטגוריה</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">סוג</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">טלפון</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">אימייל</th>
                <th className="px-3 py-2.5 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelected(c.id === selected ? null : c.id)}
                  className={`border-b border-gray-50 cursor-pointer transition-colors ${
                    selected === c.id ? 'bg-[#E6F4F4]' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-brand-navy">{c.name}</div>
                    {c.needsInfo && <span className="text-xs text-amber-500">⚠ חסר מידע</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{c.role || c.organization || '—'}</td>
                  <td className="px-4 py-2.5">
                    {c.category
                      ? <span className="bg-[#E6F4F4] text-[#147F84] text-xs px-2 py-0.5 rounded-full whitespace-nowrap">{c.category}</span>
                      : <span className="text-gray-300 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">{c.type}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs" dir="ltr">{c.phone || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs max-w-[120px] truncate">{c.email || '—'}</td>
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
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    {search || typeFilter ? 'אין תוצאות לחיפוש' : 'אין אנשי קשר בקטגוריה זו'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        {selectedContact && (
          <div className="w-72 bg-white rounded-xl shadow-sm border border-gray-100 p-4 shrink-0 overflow-auto self-start sticky top-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h2 className="font-bold text-brand-navy">{selectedContact.name}</h2>
                <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">{selectedContact.type}</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setEditing(selectedContact)}
                  className="text-gray-400 hover:text-[#189A9F] text-sm p-1" title="עריכה">✏️</button>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              </div>
            </div>

            <div className="space-y-2.5 text-sm">
              {selectedContact.category && (
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">קטגוריה</div>
                  <span className="bg-[#E6F4F4] text-[#147F84] text-xs px-2 py-0.5 rounded-full">{selectedContact.category}</span>
                </div>
              )}
              {(selectedContact.role || selectedContact.organization) && (
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">תפקיד / ארגון</div>
                  <div className="text-gray-700">{selectedContact.role || selectedContact.organization}</div>
                </div>
              )}
              {selectedContact.ownerInOrg && (
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">בעל קשר</div>
                  <div className="text-gray-700">{selectedContact.ownerInOrg}</div>
                </div>
              )}
              {selectedContact.cadence && (
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">תדירות קשר</div>
                  <div className="text-gray-700">{selectedContact.cadence}</div>
                </div>
              )}
              {selectedContact.phone && (
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">טלפון</div>
                  <div dir="ltr" className="text-gray-700">{selectedContact.phone}</div>
                </div>
              )}
              {selectedContact.email && (
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">אימייל</div>
                  <div className="text-gray-700 break-all">{selectedContact.email}</div>
                </div>
              )}
              {selectedContact.needsInfo && (
                <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">חסרים פרטי קשר</div>
              )}
              {selectedContact.notes && (
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">הערות</div>
                  <div className="text-gray-700 text-xs leading-relaxed">{selectedContact.notes}</div>
                </div>
              )}
              {selectedContact.domainTags.length > 0 && (
                <div>
                  <div className="text-xs text-gray-400 mb-1">תחומים</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedContact.domainTags.map((tag) => (
                      <span key={tag} className="bg-[#E6F4F4] text-[#189A9F] text-xs px-2 py-0.5 rounded">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {contactTasks.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <div className="text-xs text-gray-400 mb-1.5">משימות מקושרות ({contactTasks.length})</div>
                <ul className="space-y-1">
                  {contactTasks.map((t) => (
                    <li key={t.id} className="text-xs text-[#189A9F] hover:underline">
                      <a href={`/tasks/${t.id}`}>{t.title}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {adding && (
        <ContactAddModal
          onSave={addContact}
          onClose={() => setAdding(false)}
        />
      )}

      {editing && (
        <ContactEditModal
          contact={editing}
          onSave={(data) => updateContact(editing.id, data)}
          onDelete={() => deleteContact(editing.id)}
          onClose={() => { setEditing(null); if (selected === editing.id) setSelected(null) }}
        />
      )}
    </div>
  )
}

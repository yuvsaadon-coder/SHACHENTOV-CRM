import { useState, useMemo } from 'react'
import { useContacts } from '../hooks/useContacts'
import { useTasks } from '../hooks/useTasks'
import { Spinner } from '../components/ui/Spinner'
import type { ContactType } from '../types'

export function ContactsPage() {
  const { contacts, loading } = useContacts()
  const { tasks } = useTasks()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ContactType | ''>('')
  const [selected, setSelected] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      if (typeFilter && c.type !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.email.toLowerCase().includes(q)
      }
      return true
    })
  }, [contacts, search, typeFilter])

  const selectedContact = selected ? contacts.find((c) => c.id === selected) : null
  const contactTasks = selectedContact
    ? tasks.filter((t) => t.contactRefs.includes(selectedContact.id) || t.activator === selectedContact.name)
    : []

  if (loading) return <Spinner size="lg" />

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      {/* List */}
      <div className="flex-1 flex flex-col gap-3 overflow-auto">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold text-brand-navy">אנשי קשר</h1>
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

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-teal050 text-brand-navy border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-right font-medium">שם</th>
                <th className="px-4 py-3 text-right font-medium">סוג</th>
                <th className="px-4 py-3 text-right font-medium">טלפון</th>
                <th className="px-4 py-3 text-right font-medium">אימייל</th>
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
                  <td className="px-4 py-3 font-medium text-brand-navy">{c.name}</td>
                  <td className="px-4 py-3">
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">{c.type}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600" dir="ltr">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.email || '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">אין תוצאות</td></tr>
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
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>

          <div className="space-y-3 text-sm">
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
    </div>
  )
}

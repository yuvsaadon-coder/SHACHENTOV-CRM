import { useState, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useKnowledge, useAddKnowledge } from '../../hooks/useKnowledge'
import { useAuth } from '../../context/AuthContext'
import type { PortalOutletContext } from './CoordinatorPortal'
import { KNOWLEDGE_TAGS, type KnowledgeItem, type KnowledgeItemType, type KnowledgeTag } from '../../types'

type TabId = 'branch' | 'global'

function ItemCard({ item }: { item: KnowledgeItem }) {
  const [open, setOpen] = useState(false)
  const date = item.createdAt?.toDate?.().toLocaleDateString('he-IL') ?? ''

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-right px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm" style={{ color: '#141348' }}>{item.title}</div>
            <div className="text-xs text-gray-400 mt-0.5">{date}</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {item.tags.map((t) => (
                <span key={t} className="px-1.5 py-0.5 text-xs rounded" style={{ backgroundColor: '#E6F4F4', color: '#189A9F' }}>{t}</span>
              ))}
            </div>
            {!open && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.content}</p>
            )}
          </div>
          <span className="text-gray-400 text-xs shrink-0 mt-0.5">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50">
          <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">{item.content}</p>
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer"
              className="inline-block mt-2 text-sm text-[#189A9F] underline break-all">
              {item.url}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function AddKnowledgeModal({
  branchId,
  onClose,
}: {
  branchId: string
  onClose: () => void
}) {
  const { addItem } = useAddKnowledge()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<KnowledgeItemType>('document')
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [customTag, setCustomTag] = useState('')
  const [scope, setScope] = useState<'branch' | 'global'>('branch')
  const [saving, setSaving] = useState(false)

  const toggleTag = (t: string) =>
    setSelectedTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      const tags = customTag.trim() ? [...selectedTags, customTag.trim()] : selectedTags
      await addItem({
        branchId: scope === 'global' ? 'global' : branchId,
        type,
        title: title.trim(),
        content: content.trim(),
        url: url.trim() || undefined,
        tags,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold" style={{ color: '#141348' }}>הוסף פריט ידע</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">כותרת *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              placeholder="כותרת הפריט" />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">סוג</label>
            <div className="flex gap-2">
              {([['document', 'מסמך'], ['link', 'לינק']] as [KnowledgeItemType, string][]).map(([t, l]) => (
                <button key={t} onClick={() => setType(t)}
                  className="flex-1 py-2 rounded-lg text-sm border transition-all"
                  style={{
                    backgroundColor: type === t ? '#141348' : 'white',
                    color: type === t ? 'white' : '#141348',
                    borderColor: type === t ? '#141348' : '#E5E7EB',
                  }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">{type === 'link' ? 'תיאור / תקציר' : 'תוכן'}</label>
            <textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#189A9F]" />
          </div>

          {type === 'link' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">URL</label>
              <input value={url} onChange={(e) => setUrl(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                placeholder="https://..." dir="ltr" />
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">תגיות</label>
            <div className="flex flex-wrap gap-2">
              {KNOWLEDGE_TAGS.filter((t): t is KnowledgeTag => t !== 'אחר').map((t) => (
                <button key={t} onClick={() => toggleTag(t)}
                  className="px-3 py-1 rounded-full text-xs border transition-all"
                  style={{
                    backgroundColor: selectedTags.includes(t) ? '#189A9F' : 'white',
                    color: selectedTags.includes(t) ? 'white' : '#141348',
                    borderColor: selectedTags.includes(t) ? '#189A9F' : '#E5E7EB',
                  }}>
                  {t}
                </button>
              ))}
              <input value={customTag} onChange={(e) => setCustomTag(e.target.value)}
                className="border border-gray-200 rounded-full px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#189A9F]"
                placeholder="אחר..." />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">היכן לשמור?</label>
            <div className="flex gap-2">
              {([['branch', 'ידע סניפי'], ['global', 'כלל-ארגוני']] as const).map(([s, l]) => (
                <button key={s} onClick={() => setScope(s)}
                  className="flex-1 py-2 rounded-lg text-sm border transition-all"
                  style={{
                    backgroundColor: scope === s ? '#189A9F' : 'white',
                    color: scope === s ? 'white' : '#141348',
                    borderColor: scope === s ? '#189A9F' : '#E5E7EB',
                  }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white px-4 py-3 border-t border-gray-100 flex gap-3">
          <button onClick={handleSave} disabled={saving || !title.trim()}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: '#141348' }}>
            {saving ? 'שומר...' : 'שמור'}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm border border-gray-200 hover:bg-gray-50">
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

export function PortalKnowledge() {
  const { branch } = useOutletContext<PortalOutletContext>()
  const { appUser } = useAuth()
  const { items, loading } = useKnowledge(branch.id)
  const [tab, setTab] = useState<TabId>('branch')
  const [activeTag, setActiveTag] = useState<string>('')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const filtered = useMemo(() => {
    return items
      .filter((item) => tab === 'branch' ? item.branchId === branch.id : item.branchId === 'global')
      .filter((item) => !activeTag || item.tags.includes(activeTag))
      .filter((item) => {
        if (!search) return true
        const q = search.toLowerCase()
        return item.title.toLowerCase().includes(q) || item.content.toLowerCase().includes(q)
      })
  }, [items, tab, activeTag, search, branch.id])

  if (!appUser) return null

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: '#141348' }}>מאגר הידע</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: '#189A9F' }}
        >
          + הוסף ידע
        </button>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm bg-white">
        <button
          onClick={() => setTab('branch')}
          className="flex-1 py-2 transition-colors"
          style={{
            backgroundColor: tab === 'branch' ? '#141348' : 'transparent',
            color: tab === 'branch' ? 'white' : '#6B7280',
          }}
        >
          📁 ידע סניפי
        </button>
        <button
          onClick={() => setTab('global')}
          className="flex-1 py-2 transition-colors"
          style={{
            backgroundColor: tab === 'global' ? '#141348' : 'transparent',
            color: tab === 'global' ? 'white' : '#6B7280',
          }}
        >
          🌐 כלל-ארגוני
        </button>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <input
          type="text"
          placeholder="חיפוש..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTag('')}
            className="px-3 py-1 rounded-full text-xs border transition-all"
            style={{
              backgroundColor: !activeTag ? '#189A9F' : 'white',
              color: !activeTag ? 'white' : '#141348',
              borderColor: !activeTag ? '#189A9F' : '#E5E7EB',
            }}
          >
            הכל
          </button>
          {KNOWLEDGE_TAGS.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTag(activeTag === t ? '' : t)}
              className="px-3 py-1 rounded-full text-xs border transition-all"
              style={{
                backgroundColor: activeTag === t ? '#189A9F' : 'white',
                color: activeTag === t ? 'white' : '#141348',
                borderColor: activeTag === t ? '#189A9F' : '#E5E7EB',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Items list */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">אין פריטים להצגה</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => <ItemCard key={item.id} item={item} />)}
        </div>
      )}

      {showAdd && (
        <AddKnowledgeModal branchId={branch.id} onClose={() => setShowAdd(false)} />
      )}
    </div>
  )
}

import { useState, useMemo, useRef } from 'react'
import { useHQKnowledge, useAddHQKnowledge } from '../hooks/useHQKnowledge'
import { useAuth } from '../context/AuthContext'
import {
  DOMAINS, DOMAIN_LABELS, DOMAIN_COLORS,
  HQ_KNOWLEDGE_CATEGORIES,
  type Domain, type HQKnowledgeItem, type HQKnowledgeCategory,
} from '../types'

// ─── helpers ────────────────────────────────────────────────────────────────

function catLabel(id: HQKnowledgeCategory): string {
  return HQ_KNOWLEDGE_CATEGORIES.find((c) => c.id === id)?.label ?? id
}
function catIcon(id: HQKnowledgeCategory): string {
  return HQ_KNOWLEDGE_CATEGORIES.find((c) => c.id === id)?.icon ?? '📎'
}

// ─── Item Card ───────────────────────────────────────────────────────────────

function HQItemCard({ item }: { item: HQKnowledgeItem }) {
  const [open, setOpen] = useState(false)
  const date = item.createdAt?.toDate?.().toLocaleDateString('he-IL') ?? ''

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-right px-4 py-3.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start gap-3">
          <span className="text-xl shrink-0 mt-0.5">{catIcon(item.category)}</span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: DOMAIN_COLORS[item.domain as Domain] ?? '#6B7280' }}
              >
                {item.domain === 'all' ? 'כללי' : DOMAIN_LABELS[item.domain as Domain]}
              </span>
              <span className="text-xs text-gray-400">{catLabel(item.category)}</span>
              {date && <span className="text-xs text-gray-300">{date}</span>}
            </div>
            <div className="font-semibold text-sm" style={{ color: '#141348' }}>{item.title}</div>
            {!open && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{item.content}</p>
            )}
          </div>
          <span className="text-gray-400 text-xs shrink-0 mt-1">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/60">
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed mt-3">{item.content}</p>
          {item.fileUrl && (
            <a
              href={item.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#141348' }}
            >
              ⬇ {item.fileName ?? 'הורד קובץ'}
            </a>
          )}
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {item.tags.map((t) => (
                <span key={t} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Add Modal ────────────────────────────────────────────────────────────────

function AddModal({ onClose }: { onClose: () => void }) {
  const { addItem } = useAddHQKnowledge()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [domain, setDomain] = useState<Domain | 'all'>('all')
  const [category, setCategory] = useState<HQKnowledgeCategory>('instructions')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tag, setTag] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const addTag = () => {
    const t = tag.trim()
    if (t && !tags.includes(t)) setTags((p) => [...p, t])
    setTag('')
  }

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      let fileUrl: string | undefined
      let fileName: string | undefined
      if (file) {
        if (file.size > 500 * 1024) { alert('קובץ גדול מדי — מקסימום 500 KB'); setSaving(false); return }
        fileUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (ev) => resolve(ev.target?.result as string)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        fileName = file.name
      }
      await addItem({ domain, category, title: title.trim(), content: content.trim(), tags, fileUrl, fileName })
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
          <h2 className="font-bold" style={{ color: '#141348' }}>הוסף פריט ידע למטה</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Domain */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">תחום</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setDomain('all')}
                className="px-3 py-1.5 rounded-full text-xs border transition-colors"
                style={domain === 'all' ? { backgroundColor: '#6B7280', color: 'white', borderColor: '#6B7280' } : { borderColor: '#E5E7EB', color: '#374151' }}
              >
                כללי
              </button>
              {DOMAINS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDomain(d)}
                  className="px-3 py-1.5 rounded-full text-xs border transition-colors"
                  style={domain === d
                    ? { backgroundColor: DOMAIN_COLORS[d], color: '#fff', borderColor: DOMAIN_COLORS[d] }
                    : { borderColor: '#E5E7EB', color: '#374151' }
                  }
                >
                  {DOMAIN_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">קטגוריה</label>
            <div className="grid grid-cols-2 gap-2">
              {HQ_KNOWLEDGE_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors text-right"
                  style={category === c.id ? { backgroundColor: '#141348', color: 'white', borderColor: '#141348' } : { borderColor: '#E5E7EB', color: '#374151' }}
                >
                  <span>{c.icon}</span>
                  <span className="text-xs">{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">כותרת *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              placeholder="כותרת הפריט"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">תוכן / תיאור</label>
            <textarea
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              placeholder="הנחיות, תוכן הקובץ, סיכום..."
            />
          </div>

          {/* File upload */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">קובץ מצורף (אופציונלי)</label>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm border border-dashed border-gray-300 rounded-lg px-4 py-2 text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors w-full text-center"
            >
              {file ? `📎 ${file.name}` : '📎 בחר קובץ'}
            </button>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">תגיות</label>
            <div className="flex gap-2">
              <input
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                placeholder="הוסף תגית..."
              />
              <button onClick={addTag} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">הוסף</button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full cursor-pointer hover:bg-red-50 hover:text-red-500"
                    onClick={() => setTags((p) => p.filter((x) => x !== t))}
                  >
                    {t} ×
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white px-4 py-3 border-t border-gray-100 flex gap-3">
          <button
            onClick={() => void handleSave()}
            disabled={saving || !title.trim()}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: '#141348' }}
          >
            {saving ? 'שומר...' : 'שמור'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm border border-gray-200 hover:bg-gray-50">
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function HQKnowledgePage() {
  const { appUser } = useAuth()
  const [domainFilter, setDomainFilter] = useState<Domain | 'all'>('all')
  const [catFilter, setCatFilter] = useState<HQKnowledgeCategory | ''>('')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const { items, loading } = useHQKnowledge(domainFilter)

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (catFilter && item.category !== catFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const hay = [item.title, item.content, ...item.tags].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, catFilter, search])

  // Group filtered by category for display
  const grouped = useMemo(() => {
    const map = new Map<HQKnowledgeCategory, HQKnowledgeItem[]>()
    HQ_KNOWLEDGE_CATEGORIES.forEach((c) => map.set(c.id, []))
    filtered.forEach((item) => {
      map.get(item.category)?.push(item)
    })
    return HQ_KNOWLEDGE_CATEGORIES
      .map((c) => ({ ...c, items: map.get(c.id) ?? [] }))
      .filter((g) => g.items.length > 0)
  }, [filtered])

  const isAdmin = appUser?.role === 'admin'

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>מאגר ידע מטה</h1>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} פריטים · מאורגן לפי תחום וקטגוריה</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-xl text-white text-sm font-medium shadow-sm"
            style={{ backgroundColor: '#189A9F' }}
          >
            + הוסף פריט
          </button>
        )}
      </div>

      {/* Domain filter */}
      <div>
        <p className="text-xs font-medium text-gray-400 mb-2">תחום</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setDomainFilter('all')}
            className="px-3 py-1.5 rounded-full text-xs border transition-colors"
            style={domainFilter === 'all' ? { backgroundColor: '#141348', color: 'white', borderColor: '#141348' } : { borderColor: '#E5E7EB', color: '#374151' }}
          >
            הכל
          </button>
          {DOMAINS.map((d) => (
            <button
              key={d}
              onClick={() => setDomainFilter(d === domainFilter ? 'all' : d)}
              className="px-3 py-1.5 rounded-full text-xs border transition-colors"
              style={domainFilter === d
                ? { backgroundColor: DOMAIN_COLORS[d], color: '#fff', borderColor: DOMAIN_COLORS[d] }
                : { borderColor: '#E5E7EB', color: '#374151' }
              }
            >
              {DOMAIN_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCatFilter('')}
          className="px-3 py-1.5 rounded-full text-xs border transition-colors"
          style={!catFilter ? { backgroundColor: '#189A9F', color: 'white', borderColor: '#189A9F' } : { borderColor: '#E5E7EB', color: '#374151' }}
        >
          כל הקטגוריות
        </button>
        {HQ_KNOWLEDGE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCatFilter(catFilter === c.id ? '' : c.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors"
            style={catFilter === c.id ? { backgroundColor: '#141348', color: 'white', borderColor: '#141348' } : { borderColor: '#E5E7EB', color: '#374151' }}
          >
            <span>{c.icon}</span>
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="חיפוש..."
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
      />

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">טוען...</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16" dir="rtl">
          <div className="text-5xl mb-4">📭</div>
          <p className="text-gray-500 text-sm">אין פריטים להצגה</p>
          {isAdmin && items.length === 0 && (
            <p className="text-xs text-gray-400 mt-2">לחץ "+ הוסף פריט" כדי להתחיל למלא את מאגר הידע</p>
          )}
        </div>
      ) : (
        <div className="space-y-8 pb-8">
          {grouped.map((group) => (
            <section key={group.id}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{group.icon}</span>
                <h2 className="font-semibold text-sm" style={{ color: '#141348' }}>{group.label}</h2>
                <span className="text-xs text-gray-400">({group.items.length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.items.map((item) => (
                  <HQItemCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {showAdd && <AddModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}

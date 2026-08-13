import { useState, useMemo, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { storage } from '../../lib/firebase'
import { useKnowledge, useAddKnowledge } from '../../hooks/useKnowledge'
import { useAuth } from '../../context/AuthContext'
import type { PortalOutletContext } from './CoordinatorPortal'
import { KNOWLEDGE_TAGS, type KnowledgeItem, type KnowledgeItemType, type KnowledgeTag } from '../../types'
import { KNOWLEDGE_CATALOG, type CatalogArticle } from '../../data/knowledgeCatalog'

type TabId = 'branch' | 'org' | 'research'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return '📄'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return '📊'
  if (['doc', 'docx'].includes(ext)) return '📝'
  return '📎'
}

// ─── Item Card ────────────────────────────────────────────────────────────────

function ItemCard({ item }: { item: KnowledgeItem }) {
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const date = item.createdAt?.toDate?.().toLocaleDateString('he-IL') ?? ''
  const isChecklist = item.type === 'checklist'
  const isFile = item.type === 'file' || !!item.fileUrl

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-right px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isFile && (
                <span className="text-base shrink-0">
                  {fileIcon(item.fileName ?? '')}
                </span>
              )}
              {isChecklist && <span className="text-base shrink-0">✅</span>}
              <div className="font-medium text-sm truncate" style={{ color: '#141348' }}>
                {item.title}
              </div>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{date}</div>
            {item.fileName && (
              <div className="text-xs text-gray-400 mt-0.5">
                {item.fileName}{item.fileSize ? ` · ${formatBytes(item.fileSize)}` : ''}
              </div>
            )}
            <div className="flex flex-wrap gap-1 mt-1">
              {item.tags.map((t) => (
                <span key={t} className="px-1.5 py-0.5 text-xs rounded"
                  style={{ backgroundColor: '#E6F4F4', color: '#189A9F' }}>{t}</span>
              ))}
            </div>
            {!open && !isChecklist && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.content}</p>
            )}
            {!open && isChecklist && item.checklistItems && (
              <p className="text-xs text-gray-400 mt-1">
                {item.checklistItems.length} סעיפים ·{' '}
                {Object.values(checked).filter(Boolean).length} הושלמו
              </p>
            )}
          </div>
          <span className="text-gray-400 text-xs shrink-0 mt-1">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50 space-y-3">
          {/* Checklist */}
          {isChecklist && item.checklistItems && (
            <ul className="space-y-2 mt-3">
              {item.checklistItems.map((ci, i) => (
                <li key={i} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id={`${item.id}-${i}`}
                    checked={!!checked[i]}
                    onChange={() => setChecked((p) => ({ ...p, [i]: !p[i] }))}
                    className="mt-0.5 h-4 w-4 accent-[#189A9F] shrink-0"
                  />
                  <label
                    htmlFor={`${item.id}-${i}`}
                    className="text-sm cursor-pointer"
                    style={{ textDecoration: checked[i] ? 'line-through' : 'none', color: checked[i] ? '#9CA3AF' : '#141348' }}
                  >
                    {ci}
                  </label>
                </li>
              ))}
            </ul>
          )}

          {/* Text content */}
          {item.content && (
            <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">{item.content}</p>
          )}

          {/* File download */}
          {item.fileUrl && (
            <a
              href={item.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-2 text-sm font-medium px-4 py-2 rounded-lg text-white"
              style={{ backgroundColor: '#141348' }}
            >
              {fileIcon(item.fileName ?? '')} הורד {item.fileName ?? 'קובץ'}
            </a>
          )}

          {/* URL link */}
          {item.url && !item.fileUrl && (
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

// ─── Research Card ────────────────────────────────────────────────────────────

const LANG_COLOR: Record<string, string> = {
  'עברית': '#189A9F',
  'אנגלית': '#3A3A6B',
  'עברית + אנגלית': '#147F84',
}

function ResearchCard({ article }: { article: CatalogArticle }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full text-right px-4 py-3 hover:bg-gray-50 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white shrink-0"
                style={{ backgroundColor: LANG_COLOR[article.lang] ?? '#6B7280' }}>
                {article.lang}
              </span>
              <span className="text-xs text-gray-400">{article.pages} עמ׳</span>
            </div>
            <div className="font-medium text-sm" style={{ color: '#141348' }}>{article.titleHe}</div>
            {article.source && <div className="text-xs text-gray-400 mt-0.5">{article.source}</div>}
            {!open && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{article.summary}</p>}
          </div>
          <span className="text-gray-400 text-xs shrink-0 mt-0.5">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50">
          <p className="text-sm text-gray-700 mt-3 leading-relaxed">{article.summary}</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {article.topics.map((t) => (
              <span key={t} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
          {article.storageUrl ? (
            <a href={article.storageUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium px-3 py-1.5 rounded-lg text-white"
              style={{ backgroundColor: '#141348' }}>
              ⬇ הורד PDF
            </a>
          ) : (
            <span className="inline-block mt-3 text-xs text-gray-300 px-3 py-1.5 rounded-lg border border-gray-200">
              PDF בהכנה
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Add Knowledge Modal ──────────────────────────────────────────────────────

const TYPE_OPTIONS: { id: KnowledgeItemType; label: string; icon: string; desc: string }[] = [
  { id: 'file',      label: 'קובץ חפיפה',  icon: '📎', desc: 'PDF, Word, Excel' },
  { id: 'checklist', label: 'צ\'קליסט',    icon: '✅', desc: 'רשימת משימות' },
  { id: 'document',  label: 'מסמך',        icon: '📝', desc: 'טקסט חופשי' },
  { id: 'link',      label: 'לינק',        icon: '🔗', desc: 'קישור חיצוני' },
]

function AddKnowledgeModal({ branchId, onClose }: { branchId: string; onClose: () => void }) {
  const { addItem } = useAddKnowledge()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<KnowledgeItemType>('file')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [scope, setScope] = useState<'branch' | 'global'>('branch')

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  // Checklist state
  const [checklistItems, setChecklistItems] = useState<string[]>([''])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggleTag = (t: string) =>
    setSelectedTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setSelectedFile(f)
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ''))
  }

  const addChecklistItem = () => setChecklistItems((p) => [...p, ''])
  const updateChecklistItem = (i: number, val: string) =>
    setChecklistItems((p) => p.map((x, idx) => (idx === i ? val : x)))
  const removeChecklistItem = (i: number) =>
    setChecklistItems((p) => p.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    if (!title.trim()) { setError('נדרשת כותרת'); return }
    if (type === 'file' && !selectedFile) { setError('בחר קובץ להעלאה'); return }
    if (type === 'checklist' && checklistItems.filter((x) => x.trim()).length === 0) {
      setError('הוסף לפחות סעיף אחד'); return
    }
    setSaving(true)
    setError('')
    try {
      const effectiveBranchId = scope === 'global' ? 'global' : branchId
      let fileUrl: string | undefined
      let fileName: string | undefined
      let fileSize: number | undefined

      if (type === 'file' && selectedFile) {
        const ext = selectedFile.name.split('.').pop() ?? 'bin'
        const path = `handover/${effectiveBranchId}/${Date.now()}.${ext}`
        const storageRef = ref(storage, path)
        await new Promise<void>((resolve, reject) => {
          const task = uploadBytesResumable(storageRef, selectedFile)
          task.on('state_changed',
            (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
            reject,
            async () => {
              fileUrl = await getDownloadURL(task.snapshot.ref)
              resolve()
            }
          )
        })
        fileName = selectedFile.name
        fileSize = selectedFile.size
      }

      const cleanItems = checklistItems.map((x) => x.trim()).filter(Boolean)

      await addItem({
        branchId: effectiveBranchId,
        type,
        title: title.trim(),
        content: content.trim(),
        url: type === 'link' ? url.trim() || undefined : undefined,
        fileUrl,
        fileName,
        fileSize,
        checklistItems: type === 'checklist' ? cleanItems : undefined,
        tags: selectedTags,
      })
      onClose()
    } catch (e) {
      setError('שגיאה בשמירה — בדוק חיבור ורשאיות Firebase')
      console.error(e)
    } finally {
      setSaving(false)
      setUploadProgress(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto"
        dir="rtl" onClick={(e) => e.stopPropagation()}>

        <div className="sticky top-0 bg-white px-4 py-3 border-b border-gray-100 flex items-center justify-between z-10">
          <h2 className="font-bold text-sm" style={{ color: '#141348' }}>הוסף לידע הסניף</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>

        <div className="p-4 space-y-4">

          {/* Type selector */}
          <div>
            <label className="block text-xs text-gray-500 mb-2">סוג הפריט</label>
            <div className="grid grid-cols-2 gap-2">
              {TYPE_OPTIONS.map((t) => (
                <button key={t.id} onClick={() => setType(t.id)}
                  className="flex flex-col items-center gap-0.5 py-3 rounded-xl border-2 transition-all text-center"
                  style={{
                    borderColor: type === t.id ? '#189A9F' : '#E5E7EB',
                    backgroundColor: type === t.id ? '#E6F4F4' : 'white',
                  }}>
                  <span className="text-xl">{t.icon}</span>
                  <span className="text-xs font-semibold" style={{ color: '#141348' }}>{t.label}</span>
                  <span className="text-xs text-gray-400">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">כותרת *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
              placeholder={type === 'file' ? 'שם המסמך' : 'כותרת הפריט'} />
          </div>

          {/* FILE UPLOAD */}
          {type === 'file' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">קובץ *</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileSelect}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-6 text-center hover:border-[#189A9F] transition-colors"
              >
                {selectedFile ? (
                  <div className="space-y-1">
                    <div className="text-2xl">{fileIcon(selectedFile.name)}</div>
                    <div className="text-sm font-medium" style={{ color: '#141348' }}>{selectedFile.name}</div>
                    <div className="text-xs text-gray-400">{formatBytes(selectedFile.size)}</div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="text-2xl">📂</div>
                    <div className="text-sm text-gray-500">לחץ לבחירת קובץ</div>
                    <div className="text-xs text-gray-400">PDF, Word, Excel — עד 50MB</div>
                  </div>
                )}
              </button>
              {uploadProgress !== null && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>מעלה...</span><span>{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${uploadProgress}%`, backgroundColor: '#189A9F' }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CHECKLIST */}
          {type === 'checklist' && (
            <div>
              <label className="block text-xs text-gray-500 mb-2">סעיפי הצ׳קליסט *</label>
              <div className="space-y-2">
                {checklistItems.map((item, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="text-gray-300 text-xs w-4 shrink-0">{i + 1}.</span>
                    <input
                      value={item}
                      onChange={(e) => updateChecklistItem(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); addChecklistItem() }
                      }}
                      placeholder={`סעיף ${i + 1}`}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#189A9F]"
                    />
                    {checklistItems.length > 1 && (
                      <button onClick={() => removeChecklistItem(i)}
                        className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                    )}
                  </div>
                ))}
                <button onClick={addChecklistItem}
                  className="text-xs text-[#189A9F] hover:underline mt-1">
                  + הוסף סעיף
                </button>
              </div>
            </div>
          )}

          {/* LINK URL */}
          {type === 'link' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">קישור (URL)</label>
              <input value={url} onChange={(e) => setUrl(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                placeholder="https://..." dir="ltr" />
            </div>
          )}

          {/* Description / content */}
          {type !== 'checklist' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {type === 'file' ? 'תיאור (אופציונלי)' : type === 'link' ? 'תיאור קצר' : 'תוכן'}
              </label>
              <textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                placeholder={type === 'file' ? 'על מה המסמך?' : ''} />
            </div>
          )}

          {/* Tags */}
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
            </div>
          </div>

          {/* Scope */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">שמור כ:</label>
            <div className="flex gap-2">
              {([['branch', '📁 ידע סניפי'], ['global', '🌐 כלל-ארגוני']] as const).map(([s, l]) => (
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

          {error && (
            <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white px-4 py-3 border-t border-gray-100 flex gap-3">
          <button onClick={() => void handleSave()} disabled={saving || !title.trim()}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: '#141348' }}>
            {saving
              ? (uploadProgress !== null ? `מעלה ${uploadProgress}%...` : 'שומר...')
              : 'שמור'}
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PortalKnowledge() {
  const { branch } = useOutletContext<PortalOutletContext>()
  const { appUser } = useAuth()
  const { items, loading } = useKnowledge(branch.id)
  const [tab, setTab] = useState<TabId>('branch')
  const [activeTag, setActiveTag] = useState<string>('')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const branchItems = useMemo(
    () => items.filter((item) => item.branchId === branch.id),
    [items, branch.id]
  )

  const orgItems = useMemo(
    () => items.filter((item) => item.branchId === 'global' && item.type !== 'research_article'),
    [items]
  )

  const activeItems = tab === 'branch' ? branchItems : orgItems

  const filtered = useMemo(() => {
    if (tab === 'research') {
      if (!search) return KNOWLEDGE_CATALOG
      const q = search.toLowerCase()
      return KNOWLEDGE_CATALOG.filter((a) =>
        [a.titleHe, a.titleEn ?? '', a.summary, ...a.topics].join(' ').toLowerCase().includes(q)
      )
    }
    return activeItems
      .filter((item) => !activeTag || item.tags.includes(activeTag))
      .filter((item) => {
        if (!search) return true
        const q = search.toLowerCase()
        return item.title.toLowerCase().includes(q) || (item.content ?? '').toLowerCase().includes(q)
      })
  }, [tab, activeItems, activeTag, search])

  if (!appUser) return null

  const TAB_DEFS: { id: TabId; label: string; icon: string; count: number }[] = [
    { id: 'branch',   label: 'חומרים סניפיים', icon: '📁', count: branchItems.length },
    { id: 'org',      label: 'כלל-ארגוני',      icon: '🌐', count: orgItems.length },
    { id: 'research', label: 'חומר מקצועי',      icon: '📚', count: KNOWLEDGE_CATALOG.length },
  ]

  // Group branch items by type for display
  const fileItems = branchItems.filter((i) => i.type === 'file' || i.fileUrl)
  const checklistItemsList = branchItems.filter((i) => i.type === 'checklist')

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: '#141348' }}>מאגר הידע</h1>
        {tab !== 'research' && (
          <button onClick={() => setShowAdd(true)}
            className="px-3 py-1.5 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: '#189A9F' }}>
            + הוסף
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 rounded-xl border border-gray-200 overflow-hidden text-xs bg-white">
        {TAB_DEFS.map((t) => (
          <button key={t.id}
            onClick={() => { setTab(t.id); setSearch(''); setActiveTag('') }}
            className="flex flex-col items-center gap-0.5 py-2.5 transition-colors"
            style={{
              backgroundColor: tab === t.id ? '#141348' : 'transparent',
              color: tab === t.id ? 'white' : '#6B7280',
              borderRight: t.id !== 'branch' ? '1px solid #E5E7EB' : 'none',
            }}>
            <span className="text-base">{t.icon}</span>
            <span className="font-medium">{t.label}</span>
            <span className="opacity-70">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Branch tab: quick-access handover section */}
      {tab === 'branch' && fileItems.length > 0 && (
        <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
          <div className="text-xs font-semibold text-amber-800 mb-2">📎 קבצי חפיפה ופורמטים</div>
          <div className="space-y-1.5">
            {fileItems.map((item) => (
              <a key={item.id} href={item.fileUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-amber-900 hover:text-amber-700">
                <span>{fileIcon(item.fileName ?? '')}</span>
                <span className="truncate">{item.title}</span>
                {item.fileSize && (
                  <span className="text-xs text-amber-500 shrink-0">{formatBytes(item.fileSize)}</span>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Branch tab: checklists quick section */}
      {tab === 'branch' && checklistItemsList.length > 0 && (
        <div className="bg-green-50 rounded-xl p-3 border border-green-100">
          <div className="text-xs font-semibold text-green-800 mb-2">✅ צ׳קליסטים</div>
          <div className="space-y-1">
            {checklistItemsList.map((item) => (
              <div key={item.id} className="text-sm text-green-900">
                {item.title}
                {item.checklistItems && (
                  <span className="text-xs text-green-500 mr-1">({item.checklistItems.length} סעיפים)</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <input type="text"
        placeholder={tab === 'research' ? 'חיפוש במחקרים...' : 'חיפוש...'}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
      />

      {/* Tag filter */}
      {tab !== 'research' && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setActiveTag('')}
            className="px-3 py-1 rounded-full text-xs border transition-all"
            style={{
              backgroundColor: !activeTag ? '#189A9F' : 'white',
              color: !activeTag ? 'white' : '#141348',
              borderColor: !activeTag ? '#189A9F' : '#E5E7EB',
            }}>הכל</button>
          {KNOWLEDGE_TAGS.map((t) => (
            <button key={t}
              onClick={() => setActiveTag(activeTag === t ? '' : t)}
              className="px-3 py-1 rounded-full text-xs border transition-all"
              style={{
                backgroundColor: activeTag === t ? '#189A9F' : 'white',
                color: activeTag === t ? 'white' : '#141348',
                borderColor: activeTag === t ? '#189A9F' : '#E5E7EB',
              }}>
              {t}
            </button>
          ))}
        </div>
      )}

      {tab === 'research' && (
        <div className="bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-700 leading-relaxed">
          ספרייה מקצועית — מחקרים, דוחות וחומרי עיון על ניהול מתנדבים, קהילה ועמותות.
        </div>
      )}

      {/* Items list */}
      {loading && tab !== 'research' ? (
        <div className="text-center py-8 text-gray-400 text-sm">טוען...</div>
      ) : (filtered as (KnowledgeItem | CatalogArticle)[]).length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          {tab === 'research' ? 'לא נמצאו מחקרים' : (
            <div className="space-y-2">
              <div className="text-3xl">📂</div>
              <div>עדיין אין פריטים — לחץ <strong>+ הוסף</strong> להעלאה</div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2 pb-4">
          {tab === 'research'
            ? (filtered as CatalogArticle[]).map((a) => <ResearchCard key={a.id} article={a} />)
            : (filtered as KnowledgeItem[]).map((item) => <ItemCard key={item.id} item={item} />)
          }
        </div>
      )}

      {showAdd && <AddKnowledgeModal branchId={branch.id} onClose={() => setShowAdd(false)} />}
    </div>
  )
}

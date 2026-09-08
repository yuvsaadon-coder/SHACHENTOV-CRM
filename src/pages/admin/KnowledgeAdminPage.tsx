import { useState, useEffect, useRef } from 'react'
import { collection, doc, setDoc, getDocs, updateDoc, deleteDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../lib/firebase'
import { KNOWLEDGE_CATALOG, type CatalogArticle } from '../../data/knowledgeCatalog'
import { useAuth } from '../../context/AuthContext'

const MAX_FILE_BYTES = 30 * 1024 * 1024

async function uploadKnowledgeFile(file: File, docId: string): Promise<string> {
  const storageRef = ref(storage, `knowledge_articles/${docId}/${file.name}`)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}

interface FirestoreArticle {
  id: string
  titleHe: string
  titleEn?: string
  lang: string
  pages: number
  year?: number
  source?: string
  topics: string[]
  summary: string
  storageUrl?: string
  updatedAt?: string
  type?: 'research_article' | 'checklist' | 'document'
  checklistItems?: string[]
}

type SeedStatus = 'idle' | 'seeding' | 'done' | 'error'
type ItemType = 'article' | 'checklist'

function ArticleRow({
  article,
  firestoreDoc,
  onRefresh,
}: {
  article: CatalogArticle
  firestoreDoc: FirestoreArticle | null
  onRefresh: () => void
}) {
  const { firebaseUser } = useAuth()
  const [editingSum, setEditingSum] = useState(false)
  const [summary, setSummary] = useState(firestoreDoc?.summary ?? article.summary)
  const [summarizing, setSummarizing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isSeeded = firestoreDoc !== null

  const seedSingle = async () => {
    setSeeding(true)
    try {
      await setDoc(doc(db, 'knowledge_articles', article.id), {
        id: article.id,
        titleHe: article.titleHe,
        titleEn: article.titleEn ?? null,
        lang: article.lang,
        pages: article.pages,
        year: article.year ?? null,
        source: article.source ?? null,
        topics: article.topics,
        summary: article.summary,
        storageUrl: article.storageUrl ?? null,
        updatedAt: new Date().toISOString(),
      })
      await setDoc(doc(db, 'knowledgeItems', `research-${article.id}`), {
        branchId: 'global',
        type: 'research_article',
        title: article.titleHe,
        content: article.summary,
        storageUrl: article.storageUrl ?? null,
        articleId: article.id,
        createdAt: new Date().toISOString(),
      })
      onRefresh()
    } finally {
      setSeeding(false)
    }
  }

  const saveSummary = async () => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'knowledge_articles', article.id), {
        summary,
        updatedAt: new Date().toISOString(),
      })
      await setDoc(doc(db, 'knowledgeItems', `research-${article.id}`), {
        branchId: 'global',
        type: 'research_article',
        title: article.titleHe,
        content: summary,
        storageUrl: firestoreDoc?.storageUrl ?? article.storageUrl ?? null,
        articleId: article.id,
        createdAt: new Date().toISOString(),
      }, { merge: true })
      setEditingSum(false)
    } finally {
      setSaving(false)
    }
  }

  const aiSummarize = async () => {
    setSummarizing(true)
    try {
      const token = await firebaseUser?.getIdToken()
      const res = await fetch('/.netlify/functions/summarize-article', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ title: article.titleHe }),
      })
      if (!res.ok) return
      const { summary: s } = await res.json() as { summary: string }
      setSummary(s)
    } finally {
      setSummarizing(false)
    }
  }

  const uploadPdf = async (file: File) => {
    if (!file.name.match(/\.(pdf|doc|docx)$/i)) return
    if (file.size > MAX_FILE_BYTES) { alert('קובץ גדול מדי — מקסימום 30 MB'); return }
    try {
      const storageUrl = await uploadKnowledgeFile(file, article.id)
      await updateDoc(doc(db, 'knowledge_articles', article.id), { storageUrl, updatedAt: new Date().toISOString() })
      await setDoc(doc(db, 'knowledgeItems', `research-${article.id}`), { storageUrl }, { merge: true })
      onRefresh()
    } catch {
      // ignore
    }
  }

  const effectiveSummary = editingSum ? summary : (firestoreDoc?.summary ?? article.summary)
  const effectiveUrl = firestoreDoc?.storageUrl ?? article.storageUrl

  return (
    <div className="py-4 border-b border-gray-50 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800">{article.titleHe}</span>
            {isSeeded ? (
              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#C6EFCE', color: '#0A6B2E' }}>✓ מסונכרן</span>
            ) : (
              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">לא מסונכרן</span>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {article.lang} · {article.pages} עמ׳{article.year ? ` · ${article.year}` : ''}{article.source ? ` · ${article.source}` : ''}
          </div>
          {isSeeded && (
            <div className="mt-2">
              {editingSum ? (
                <div className="space-y-2">
                  <textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    rows={5}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-[#189A9F]"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => void saveSummary()}
                      disabled={saving}
                      className="text-xs px-3 py-1 rounded-lg text-white disabled:opacity-50"
                      style={{ backgroundColor: '#189A9F' }}
                    >
                      {saving ? 'שומר...' : 'שמור תקציר'}
                    </button>
                    <button
                      onClick={() => void aiSummarize()}
                      disabled={summarizing}
                      className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-teal-400 disabled:opacity-50"
                    >
                      {summarizing ? '⏳ מסכם...' : '✨ AI סיכום'}
                    </button>
                    <button onClick={() => { setEditingSum(false); setSummary(firestoreDoc?.summary ?? article.summary) }} className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-500">ביטול</button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 line-clamp-2">{effectiveSummary}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 items-end shrink-0">
          {!isSeeded ? (
            <button
              onClick={() => void seedSingle()}
              disabled={seeding}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#141348', color: 'white', borderColor: '#141348' }}
            >
              {seeding ? '⏳' : '+ סנכרן'}
            </button>
          ) : (
            <>
              {!editingSum && (
                <button onClick={() => setEditingSum(true)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-teal-400">
                  ✏️ עריכה
                </button>
              )}
              {effectiveUrl && (
                <a
                  href={effectiveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 hover:border-teal-400 text-center"
                  style={{ color: '#189A9F' }}
                >
                  📄 מסמך
                </a>
              )}
              <label className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-teal-400 cursor-pointer">
                📎 החלף מסמך
                <input type="file" accept=".pdf,.doc,.docx" className="hidden" ref={inputRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPdf(f) }} />
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ChecklistItemsEditor({
  items,
  onChange,
}: {
  items: string[]
  onChange: (items: string[]) => void
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 items-center">
          <span className="text-gray-300 text-sm shrink-0">☐</span>
          <input
            value={item}
            onChange={(e) => {
              const next = [...items]
              next[i] = e.target.value
              onChange(next)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const next = [...items]
                next.splice(i + 1, 0, '')
                onChange(next)
              }
              if (e.key === 'Backspace' && item === '' && items.length > 1) {
                e.preventDefault()
                onChange(items.filter((_, j) => j !== i))
              }
            }}
            placeholder={`פריט ${i + 1}...`}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
            autoFocus={i === items.length - 1 && item === '' && items.length > 1}
          />
          {items.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="text-red-300 hover:text-red-500 text-lg leading-none shrink-0"
              aria-label="מחק פריט"
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ''])}
        className="w-full text-xs py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-[#189A9F] hover:text-[#189A9F] transition-colors"
      >
        + הוסף פריט
      </button>
    </div>
  )
}

function AddArticlePanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { firebaseUser } = useAuth()
  const [itemType, setItemType] = useState<ItemType>('article')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [checklistItems, setChecklistItems] = useState<string[]>([''])
  const [file, setFile] = useState<File | null>(null)
  const [summarizing, setSummarizing] = useState(false)
  const [saving, setSaving] = useState(false)

  const aiSummarize = async () => {
    if (!title.trim()) return
    setSummarizing(true)
    try {
      const token = await firebaseUser?.getIdToken()
      const res = await fetch('/.netlify/functions/summarize-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) return
      const { summary: s } = await res.json() as { summary: string }
      setSummary(s)
    } finally {
      setSummarizing(false)
    }
  }

  const save = async () => {
    if (!title.trim()) return
    if (itemType === 'checklist' && checklistItems.filter(Boolean).length === 0) return
    setSaving(true)
    try {
      const id = `custom-${Date.now()}`
      let storageUrl: string | null = null

      if (file && itemType === 'article') {
        if (file.size > MAX_FILE_BYTES) { alert('קובץ גדול מדי — מקסימום 30 MB'); setSaving(false); return }
        storageUrl = await uploadKnowledgeFile(file, id)
      }

      const validItems = checklistItems.filter(Boolean)
      const content = itemType === 'checklist'
        ? `• ${validItems.join('\n• ')}`
        : summary.trim()

      await setDoc(doc(db, 'knowledge_articles', id), {
        id,
        titleHe: title.trim(),
        lang: 'עברית',
        pages: 0,
        topics: [],
        summary: content,
        storageUrl,
        type: itemType === 'checklist' ? 'checklist' : 'document',
        ...(itemType === 'checklist' ? { checklistItems: validItems } : {}),
        updatedAt: new Date().toISOString(),
      })

      await setDoc(doc(db, 'knowledgeItems', `research-${id}`), {
        branchId: 'global',
        type: itemType === 'checklist' ? 'checklist' : 'document',
        title: title.trim(),
        content,
        storageUrl,
        articleId: id,
        ...(itemType === 'checklist' ? { checklistItems: validItems } : {}),
        createdAt: new Date().toISOString(),
      })

      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const canSave = title.trim() && (
    itemType === 'article'
      ? true
      : checklistItems.filter(Boolean).length > 0
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-sm" style={{ color: '#141348' }}>הוסף פריט ידע חדש</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Type selector */}
          <div>
            <label className="block text-xs text-gray-500 mb-2">סוג פריט</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              {([
                { key: 'article', label: '📄 מאמר / מסמך' },
                { key: 'checklist', label: '✅ צ׳קליסט' },
              ] as { key: ItemType; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setItemType(key)}
                  className="flex-1 px-3 py-2 text-sm transition-colors"
                  style={{
                    backgroundColor: itemType === key ? '#141348' : 'transparent',
                    color: itemType === key ? 'white' : '#6B7280',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {itemType === 'checklist' ? 'שם הצ׳קליסט *' : 'כותרת המסמך *'}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={itemType === 'checklist' ? 'למשל: רשימת פתיחת סניף...' : 'שם המאמר / המסמך...'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
            />
          </div>

          {itemType === 'article' ? (
            <>
              {/* Summary with AI */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-500">תקציר</label>
                  <button
                    type="button"
                    onClick={() => void aiSummarize()}
                    disabled={summarizing || !title.trim()}
                    className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-teal-400 disabled:opacity-40"
                  >
                    {summarizing ? '⏳ מסכם...' : '✨ AI סיכום'}
                  </button>
                </div>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={6}
                  placeholder="תקציר המאמר..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                />
              </div>

              {/* File upload */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">קובץ מסמך (אופציונלי)</label>
                <label className="flex items-center gap-3 cursor-pointer border border-dashed border-gray-300 rounded-lg px-4 py-3 hover:border-[#189A9F] transition-colors">
                  <span className="text-xl">📎</span>
                  <div className="flex-1 min-w-0">
                    {file ? (
                      <span className="text-sm text-gray-700 truncate block">{file.name}</span>
                    ) : (
                      <span className="text-sm text-gray-400">לחץ להעלאת PDF, Word (.doc/.docx)</span>
                    )}
                  </div>
                  {file && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setFile(null) }}
                      className="text-red-400 hover:text-red-600 text-sm shrink-0"
                    >
                      ×
                    </button>
                  )}
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <p className="text-xs text-gray-400 mt-1">מקסימום 30 MB</p>
              </div>
            </>
          ) : (
            /* Checklist */
            <div>
              <label className="block text-xs text-gray-500 mb-2">פריטי הצ׳קליסט *</label>
              <ChecklistItemsEditor items={checklistItems} onChange={setChecklistItems} />
              <p className="text-xs text-gray-400 mt-2">טיפ: לחץ Enter להוספת פריט, Backspace בשדה ריק למחיקתו</p>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-3 sticky bottom-0 bg-white pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !canSave}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: '#189A9F' }}
          >
            {saving ? 'שומר...' : itemType === 'checklist' ? 'שמור צ׳קליסט' : 'שמור מסמך'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm border border-gray-200 hover:bg-gray-50">ביטול</button>
        </div>
      </div>
    </div>
  )
}

function CustomDocCard({ doc: d, onDelete }: { doc: FirestoreArticle; onDelete: () => void }) {
  const isChecklist = d.type === 'checklist'
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="py-4 border-b border-gray-50 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">{d.titleHe}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {isChecklist ? '✅ צ׳קליסט' : '📄 מסמך'}
            </span>
          </div>

          {isChecklist && d.checklistItems && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs text-gray-400 hover:text-gray-600 mb-1"
              >
                {expanded ? '▲ הסתר' : `▼ ${d.checklistItems.length} פריטים`}
              </button>
              {expanded && (
                <ul className="space-y-1 mt-1">
                  {d.checklistItems.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="text-gray-300 shrink-0">☐</span>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!isChecklist && d.storageUrl && (
            <a href={d.storageUrl} target="_blank" rel="noopener noreferrer" className="text-xs mt-1 inline-block" style={{ color: '#189A9F' }}>
              📄 פתח מסמך
            </a>
          )}

          {!isChecklist && d.summary && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{d.summary}</p>
          )}
        </div>
        <button
          onClick={onDelete}
          className="text-xs text-red-400 hover:text-red-600 border border-red-100 px-2 py-1 rounded-lg hover:bg-red-50 shrink-0"
        >
          מחק
        </button>
      </div>
    </div>
  )
}

export function KnowledgeAdminPage() {
  const [firestoreDocs, setFirestoreDocs] = useState<Record<string, FirestoreArticle>>({})
  const [customDocs, setCustomDocs] = useState<FirestoreArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [seedStatus, setSeedStatus] = useState<SeedStatus>('idle')
  const [seedProgress, setSeedProgress] = useState(0)
  const [addingArticle, setAddingArticle] = useState(false)

  const loadFirestore = async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'knowledge_articles'))
      const map: Record<string, FirestoreArticle> = {}
      const custom: FirestoreArticle[] = []
      snap.docs.forEach((d) => {
        const data = { id: d.id, ...d.data() } as FirestoreArticle
        const catalogIds = new Set(KNOWLEDGE_CATALOG.map((a) => a.id))
        if (catalogIds.has(d.id)) {
          map[d.id] = data
        } else {
          custom.push(data)
        }
      })
      setFirestoreDocs(map)
      setCustomDocs(custom)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadFirestore() }, [])

  const seededCount = Object.keys(firestoreDocs).length
  const totalCatalog = KNOWLEDGE_CATALOG.length

  const seedAll = async () => {
    setSeedStatus('seeding')
    setSeedProgress(0)
    try {
      for (let i = 0; i < KNOWLEDGE_CATALOG.length; i++) {
        const article = KNOWLEDGE_CATALOG[i]
        await setDoc(doc(db, 'knowledge_articles', article.id), {
          id: article.id,
          titleHe: article.titleHe,
          titleEn: article.titleEn ?? null,
          lang: article.lang,
          pages: article.pages,
          year: article.year ?? null,
          source: article.source ?? null,
          topics: article.topics,
          summary: article.summary,
          storageUrl: article.storageUrl ?? null,
          updatedAt: new Date().toISOString(),
        })
        await setDoc(doc(db, 'knowledgeItems', `research-${article.id}`), {
          branchId: 'global',
          type: 'research_article',
          title: article.titleHe,
          content: article.summary,
          storageUrl: article.storageUrl ?? null,
          articleId: article.id,
          createdAt: new Date().toISOString(),
        })
        setSeedProgress(i + 1)
      }
      await loadFirestore()
      setSeedStatus('done')
    } catch {
      setSeedStatus('error')
    }
  }

  const deleteCustom = async (id: string) => {
    await deleteDoc(doc(db, 'knowledge_articles', id))
    await deleteDoc(doc(db, 'knowledgeItems', `research-${id}`))
    await loadFirestore()
  }

  return (
    <div className="max-w-3xl space-y-6" dir="rtl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>ניהול ספריית ידע</h1>
          <p className="text-sm text-gray-500 mt-1">
            {seededCount} / {totalCatalog} מאמרים מסונכרנים לצ'אטבוט
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setAddingArticle(true)}
            className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            + פריט ידע חדש
          </button>
          <button
            onClick={() => void seedAll()}
            disabled={seedStatus === 'seeding' || seededCount === totalCatalog}
            className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: '#141348' }}
          >
            {seedStatus === 'seeding'
              ? `מסנכרן... ${seedProgress}/${totalCatalog}`
              : seededCount === totalCatalog
              ? '✓ הכל מסונכרן'
              : 'סנכרן הכל לצ׳אטבוט'}
          </button>
        </div>
      </div>

      {seedStatus === 'done' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
          ✅ כל {totalCatalog} המאמרים סונכרנו בהצלחה! הצ'אטבוט יכול עכשיו לענות על שאלות על בסיסם.
        </div>
      )}
      {seedStatus === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          ❌ שגיאה בסנכרון. בדוק חיבור לרשת ונסה שוב.
        </div>
      )}

      {seededCount < totalCatalog && seedStatus !== 'seeding' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          <strong>שים לב:</strong> {totalCatalog - seededCount} מאמרים עדיין לא מסונכרנים עם הצ'אטבוט.
          לחץ "סנכרן הכל לצ'אטבוט" כדי להעביר את כל המאמרים.
        </div>
      )}

      {seedStatus === 'seeding' && (
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="text-sm text-gray-600 mb-2">מסנכרן מאמרים... {seedProgress}/{totalCatalog}</div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all"
              style={{ width: `${(seedProgress / totalCatalog) * 100}%`, backgroundColor: '#189A9F' }}
            />
          </div>
        </div>
      )}

      {/* Catalog articles */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-sm" style={{ color: '#141348' }}>קטלוג מאמרים ({totalCatalog})</h2>
          <span className="text-xs text-gray-400">לחץ על מאמר מסונכרן לעריכה</span>
        </div>
        {loading ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">טוען...</div>
        ) : (
          <div className="px-4">
            {KNOWLEDGE_CATALOG.map((article) => (
              <ArticleRow
                key={article.id}
                article={article}
                firestoreDoc={firestoreDocs[article.id] ?? null}
                onRefresh={() => void loadFirestore()}
              />
            ))}
          </div>
        )}
      </div>

      {/* Custom items (docs, checklists) */}
      {customDocs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="font-semibold text-sm" style={{ color: '#141348' }}>פריטים שנוספו ידנית ({customDocs.length})</h2>
          </div>
          <div className="px-4">
            {customDocs.map((d) => (
              <CustomDocCard key={d.id} doc={d} onDelete={() => void deleteCustom(d.id)} />
            ))}
          </div>
        </div>
      )}

      {addingArticle && (
        <AddArticlePanel onClose={() => setAddingArticle(false)} onSaved={() => void loadFirestore()} />
      )}
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { collection, doc, setDoc, getDocs, updateDoc, deleteDoc } from 'firebase/firestore'
import { storage, db } from '../../lib/firebase'
import { KNOWLEDGE_CATALOG, type CatalogArticle } from '../../data/knowledgeCatalog'
import { useAuth } from '../../context/AuthContext'

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
}

type SeedStatus = 'idle' | 'seeding' | 'done' | 'error'

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
    if (!file.name.endsWith('.pdf')) return
    try {
      const storageRef = ref(storage, `knowledge/${article.id}.pdf`)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)
      await updateDoc(doc(db, 'knowledge_articles', article.id), { storageUrl: url, updatedAt: new Date().toISOString() })
      await setDoc(doc(db, 'knowledgeItems', `research-${article.id}`), { storageUrl: url }, { merge: true })
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
                  📄 PDF
                </a>
              )}
              <label className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-teal-400 cursor-pointer">
                📎 החלף PDF
                <input type="file" accept=".pdf" className="hidden" ref={inputRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPdf(f) }} />
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function AddArticlePanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { firebaseUser } = useAuth()
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
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
    setSaving(true)
    try {
      const id = `custom-${Date.now()}`
      let storageUrl: string | null = null

      if (file) {
        const storageRef = ref(storage, `knowledge/${id}.pdf`)
        await uploadBytes(storageRef, file)
        storageUrl = await getDownloadURL(storageRef)
      }

      await setDoc(doc(db, 'knowledge_articles', id), {
        id,
        titleHe: title.trim(),
        lang: 'עברית',
        pages: 0,
        topics: [],
        summary: summary.trim(),
        storageUrl,
        updatedAt: new Date().toISOString(),
      })

      await setDoc(doc(db, 'knowledgeItems', `research-${id}`), {
        branchId: 'global',
        type: 'research_article',
        title: title.trim(),
        content: summary.trim(),
        storageUrl,
        articleId: id,
        createdAt: new Date().toISOString(),
      })

      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-sm" style={{ color: '#141348' }}>הוסף מאמר חדש</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">כותרת המאמר *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="שם המאמר / המסמך..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">תקציר</label>
              <button
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
          <div>
            <label className="block text-xs text-gray-500 mb-1">קובץ PDF (אופציונלי)</label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-xs text-gray-600"
            />
            {file && <div className="text-xs text-gray-400 mt-1">{file.name}</div>}
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3 sticky bottom-0 bg-white pt-3 border-t border-gray-100">
          <button
            onClick={() => void save()}
            disabled={saving || !title.trim()}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: '#189A9F' }}
          >
            {saving ? 'שומר...' : 'שמור מאמר'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm border border-gray-200 hover:bg-gray-50">ביטול</button>
        </div>
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
            + מאמר חדש
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

      {/* Progress bar during seeding */}
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

      {/* Custom (non-catalog) articles */}
      {customDocs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="font-semibold text-sm" style={{ color: '#141348' }}>מאמרים שהועלו ידנית ({customDocs.length})</h2>
          </div>
          <div className="px-4">
            {customDocs.map((d) => (
              <div key={d.id} className="py-4 border-b border-gray-50 last:border-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">{d.titleHe}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{d.lang}</div>
                    {d.storageUrl && (
                      <a href={d.storageUrl} target="_blank" rel="noopener noreferrer" className="text-xs mt-1 inline-block" style={{ color: '#189A9F' }}>📄 PDF</a>
                    )}
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{d.summary}</p>
                  </div>
                  <button
                    onClick={() => void deleteCustom(d.id)}
                    className="text-xs text-red-400 hover:text-red-600 border border-red-100 px-2 py-1 rounded-lg hover:bg-red-50"
                  >
                    מחק
                  </button>
                </div>
              </div>
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

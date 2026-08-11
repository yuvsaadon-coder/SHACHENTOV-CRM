import { useState, useRef } from 'react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { collection, doc, setDoc } from 'firebase/firestore'
import { storage, db } from '../../lib/firebase'
import { KNOWLEDGE_CATALOG, type CatalogArticle } from '../../data/knowledgeCatalog'

interface UploadState {
  status: 'idle' | 'uploading' | 'done' | 'error'
  url?: string
  error?: string
}

function ArticleRow({ article }: { article: CatalogArticle }) {
  const [state, setState] = useState<UploadState>({ status: 'idle' })
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.pdf')) {
      setState({ status: 'error', error: 'נדרש קובץ PDF' })
      return
    }
    setState({ status: 'uploading' })
    try {
      const storageRef = ref(storage, `knowledge/${article.id}.pdf`)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)

      // Save to Firestore knowledge_articles collection
      await setDoc(doc(collection(db, 'knowledge_articles'), article.id), {
        id: article.id,
        titleHe: article.titleHe,
        titleEn: article.titleEn ?? null,
        lang: article.lang,
        pages: article.pages,
        year: article.year ?? null,
        source: article.source ?? null,
        topics: article.topics,
        summary: article.summary,
        storageUrl: url,
        updatedAt: new Date().toISOString(),
      })

      // Also create a global knowledgeItem for chatbot context
      await setDoc(doc(collection(db, 'knowledgeItems'), `research-${article.id}`), {
        branchId: 'global',
        type: 'research_article',
        title: article.titleHe,
        content: article.summary,
        storageUrl: url,
        articleId: article.id,
        createdAt: new Date().toISOString(),
      })

      setState({ status: 'done', url })
    } catch (e) {
      setState({ status: 'error', error: String(e) })
    }
  }

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{article.titleHe}</div>
        <div className="text-xs text-gray-400 mt-0.5">
          {article.lang} · {article.pages} עמ׳
          {article.year ? ` · ${article.year}` : ''}
        </div>
      </div>

      <div className="shrink-0">
        {state.status === 'idle' && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
              }}
            />
            <button
              onClick={() => inputRef.current?.click()}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-teal-400 hover:text-teal-600 transition-colors"
            >
              📎 בחר PDF
            </button>
          </>
        )}
        {state.status === 'uploading' && (
          <span className="text-xs text-blue-500">⏳ מעלה...</span>
        )}
        {state.status === 'done' && (
          <span className="text-xs text-green-600 font-medium">✅ הועלה</span>
        )}
        {state.status === 'error' && (
          <span className="text-xs text-red-500" title={state.error}>❌ שגיאה</span>
        )}
      </div>
    </div>
  )
}

export function KnowledgeAdminPage() {
  return (
    <div className="max-w-3xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>ניהול ספריית ידע</h1>
        <p className="text-sm text-gray-500 mt-1">
          העלאת קבצי PDF לכל מסמך. לאחר ההעלאה, הקישור יישמר ב-Firebase Storage ויהיה זמין לציבור.
        </p>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
        <strong>הוראות:</strong> לכל שורה, לחץ "בחר PDF" ובחר את הקובץ המתאים מהמחשב שלך.
        הקובץ יועלה ל-Firebase Storage ויהיה זמין להורדה בספריית הידע.
        כמו כן, תקציר המסמך ייכנס לבסיס הידע של הצ׳אטבוט.
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {KNOWLEDGE_CATALOG.map((a) => (
          <div key={a.id} className="px-4">
            <ArticleRow article={a} />
          </div>
        ))}
      </div>
    </div>
  )
}

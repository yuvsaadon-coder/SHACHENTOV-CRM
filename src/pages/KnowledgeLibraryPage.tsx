import { useState, useMemo } from 'react'
import { KNOWLEDGE_CATALOG, ALL_TOPICS, type CatalogArticle, type ArticleLang, type ArticleTopic } from '../data/knowledgeCatalog'

const LANG_OPTIONS: ArticleLang[] = ['עברית', 'אנגלית', 'עברית + אנגלית']

const LANG_COLOR: Record<ArticleLang, string> = {
  'עברית': '#189A9F',
  'אנגלית': '#3A3A6B',
  'עברית + אנגלית': '#147F84',
}

function ArticleCard({ article }: { article: CatalogArticle }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full text-white shrink-0"
                style={{ backgroundColor: LANG_COLOR[article.lang] }}
              >
                {article.lang}
              </span>
              <span className="text-xs text-gray-400 shrink-0">{article.pages} עמ׳</span>
              {article.year && <span className="text-xs text-gray-400 shrink-0">{article.year}</span>}
            </div>
            <h3 className="font-semibold text-sm leading-snug" style={{ color: '#141348' }}>
              {article.titleHe}
            </h3>
            {article.titleEn && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{article.titleEn}</p>
            )}
            {article.source && (
              <p className="text-xs text-gray-500 mt-1">{article.source}</p>
            )}
          </div>
        </div>

        {/* Topics */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {article.topics.map((t) => (
            <span
              key={t}
              className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
            >
              {t}
            </span>
          ))}
        </div>

        {/* Preview summary (one line) */}
        {!expanded && (
          <p className="text-xs text-gray-600 mt-3 line-clamp-2 leading-relaxed">
            {article.summary}
          </p>
        )}

        {/* Expanded summary */}
        {expanded && (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-gray-700 leading-relaxed">{article.summary}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium transition-colors"
            style={{ color: '#189A9F' }}
          >
            {expanded ? '▲ הסתר' : '▼ הרחב תקציר'}
          </button>
          <div className="flex items-center gap-2">
            {article.storageUrl ? (
              <a
                href={article.storageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium px-3 py-1 rounded-lg text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#141348' }}
              >
                ⬇ הורד PDF
              </a>
            ) : (
              <span className="text-xs text-gray-300 px-3 py-1 rounded-lg border border-gray-200">
                PDF בהכנה
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function KnowledgeLibraryPage() {
  const [searchText, setSearchText] = useState('')
  const [selectedLangs, setSelectedLangs] = useState<Set<ArticleLang>>(new Set())
  const [selectedTopics, setSelectedTopics] = useState<Set<ArticleTopic>>(new Set())

  const toggleLang = (l: ArticleLang) => {
    setSelectedLangs((prev) => {
      const next = new Set(prev)
      next.has(l) ? next.delete(l) : next.add(l)
      return next
    })
  }

  const toggleTopic = (t: ArticleTopic) => {
    setSelectedTopics((prev) => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })
  }

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return KNOWLEDGE_CATALOG.filter((a) => {
      if (selectedLangs.size > 0 && !selectedLangs.has(a.lang)) return false
      if (selectedTopics.size > 0 && !a.topics.some((t) => selectedTopics.has(t))) return false
      if (q) {
        const hay = [a.titleHe, a.titleEn ?? '', a.source ?? '', a.summary, ...a.topics].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [searchText, selectedLangs, selectedTopics])

  const heCount = KNOWLEDGE_CATALOG.filter((a) => a.lang === 'עברית' || a.lang === 'עברית + אנגלית').length
  const enCount = KNOWLEDGE_CATALOG.filter((a) => a.lang === 'אנגלית' || a.lang === 'עברית + אנגלית').length

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>
          ספריית ידע מקצועי
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {KNOWLEDGE_CATALOG.length} מסמכים · {heCount} עברית · {enCount} אנגלית
        </p>
      </div>

      {/* Search */}
      <input
        type="text"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="חיפוש לפי כותרת, נושא, מקור..."
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2"
        style={{ '--tw-ring-color': '#189A9F' } as React.CSSProperties}
      />

      {/* Language filter */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">שפה</p>
        <div className="flex flex-wrap gap-2">
          {LANG_OPTIONS.map((l) => (
            <button
              key={l}
              onClick={() => toggleLang(l)}
              className="text-xs px-3 py-1.5 rounded-full border transition-colors"
              style={
                selectedLangs.has(l)
                  ? { backgroundColor: LANG_COLOR[l], color: 'white', borderColor: LANG_COLOR[l] }
                  : { backgroundColor: 'white', color: '#374151', borderColor: '#E5E7EB' }
              }
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Topic filter */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">נושאים</p>
        <div className="flex flex-wrap gap-2">
          {ALL_TOPICS.map((t) => (
            <button
              key={t}
              onClick={() => toggleTopic(t)}
              className="text-xs px-3 py-1.5 rounded-full border transition-colors"
              style={
                selectedTopics.has(t)
                  ? { backgroundColor: '#141348', color: 'white', borderColor: '#141348' }
                  : { backgroundColor: 'white', color: '#374151', borderColor: '#E5E7EB' }
              }
            >
              {t}
            </button>
          ))}
          {selectedTopics.size > 0 && (
            <button
              onClick={() => setSelectedTopics(new Set())}
              className="text-xs px-2 py-1.5 text-red-400 hover:text-red-600"
            >
              נקה ✕
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      {(selectedLangs.size > 0 || selectedTopics.size > 0 || searchText) && (
        <p className="text-xs text-gray-400">
          מוצגים {filtered.length} מתוך {KNOWLEDGE_CATALOG.length} מסמכים
        </p>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-sm">לא נמצאו מסמכים מתאימים לחיפוש</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-8">
          {filtered.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      )}
    </div>
  )
}

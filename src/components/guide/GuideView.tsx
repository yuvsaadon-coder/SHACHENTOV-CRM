import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Guide, GuideSection } from '../../content/guides'

function sectionText(s: GuideSection): string {
  return [s.title, s.summary, ...(s.paragraphs ?? []), ...(s.steps ?? []), ...(s.tips ?? [])].join(' ')
}

export function sectionLinks(s: GuideSection): { to: string; label: string }[] {
  return [...(s.link ? [s.link] : []), ...(s.links ?? [])]
}

function SectionCard({ section, open, onToggle }: { section: GuideSection; open: boolean; onToggle: () => void }) {
  return (
    <div id={`guide-${section.id}`} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden scroll-mt-24">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-right px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition-colors"
      >
        <span className="text-2xl shrink-0">{section.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm" style={{ color: '#141348' }}>{section.title}</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{section.summary}</div>
        </div>
        <span className="text-gray-400 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-gray-100 flex flex-col gap-3 text-sm leading-relaxed" style={{ color: '#374151' }}>
          {section.paragraphs?.map((p, i) => <p key={i}>{p}</p>)}

          {section.steps && section.steps.length > 0 && (
            <ol className="list-decimal pr-5 space-y-1.5 marker:font-semibold marker:text-[#189A9F]">
              {section.steps.map((st, i) => <li key={i}>{st}</li>)}
            </ol>
          )}

          {section.tips?.map((t, i) => (
            <div key={i} className="text-xs bg-teal-50 border border-teal-100 text-teal-900 rounded-lg px-3 py-2">💡 {t}</div>
          ))}

          {sectionLinks(section).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sectionLinks(section).map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#189A9F' }}
                >
                  {l.label} ←
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** One or more guides: contents chips, a search box, and collapsible sections. */
export function GuideView({ guides }: { guides: Guide[] }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<string>>(() => new Set([guides[0]?.sections[0]?.id].filter(Boolean) as string[]))
  const q = query.trim()

  const visible = useMemo(
    () => guides
      .map((g) => ({ guide: g, sections: g.sections.filter((s) => !q || sectionText(s).includes(q)) }))
      .filter((g) => g.sections.length > 0),
    [guides, q],
  )
  const total = visible.reduce((n, g) => n + g.sections.length, 0)

  const toggle = (id: string) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const jump = (id: string) => {
    setOpen((prev) => new Set(prev).add(id))
    setTimeout(() => document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  return (
    <div className="flex flex-col gap-5 max-w-3xl mx-auto" dir="rtl">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="חיפוש במדריך..."
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
      />

      {total === 0 && (
        <div className="text-center text-sm text-gray-400 py-10">לא נמצא בחיפוש "{q}". נסו מילה אחרת.</div>
      )}

      {visible.map(({ guide, sections }) => (
        <div key={guide.id} className="flex flex-col gap-3">
          <div
            className="rounded-2xl px-5 py-4 text-white"
            style={{ background: 'linear-gradient(135deg, #141348 0%, #189A9F 100%)' }}
          >
            <h2 className="text-lg font-bold">{guide.title}</h2>
            <p className="text-sm mt-1 leading-relaxed text-white/80">{guide.intro}</p>
          </div>

          {!q && (
            <div className="flex flex-wrap gap-1.5">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => jump(s.id)}
                  className="text-xs px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-600 hover:border-[#189A9F] hover:text-[#189A9F] transition-colors"
                >
                  {s.icon} {s.title}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {sections.map((s) => (
              <SectionCard key={s.id} section={s} open={!!q || open.has(s.id)} onToggle={() => toggle(s.id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

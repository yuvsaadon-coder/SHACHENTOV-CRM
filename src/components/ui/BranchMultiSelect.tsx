import { useAllBranches } from '../../hooks/useBranch'

export function BranchMultiSelect({ value, onChange, label }: { value: string[]; onChange: (ids: string[]) => void; label: string }) {
  const { branches, loading } = useAllBranches()
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {loading ? (
        <p className="text-xs text-gray-400">טוען סניפים...</p>
      ) : branches.length === 0 ? (
        <p className="text-xs text-gray-400">אין סניפים מוגדרים</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {branches.map((b) => {
            const on = value.includes(b.id)
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => toggle(b.id)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  on ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                }`}
              >
                {on ? '✓ ' : ''}{b.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function BranchChips({ ids }: { ids: string[] }) {
  const { branches } = useAllBranches()
  const names = ids.map((id) => branches.find((b) => b.id === id)?.name).filter(Boolean)
  if (names.length === 0) return null
  return (
    <div className="px-4 pb-2 flex flex-wrap gap-1">
      {names.map((n) => (
        <span key={n} className="text-xs px-2 py-0.5 rounded-md bg-teal-50 text-teal-700">📍 {n}</span>
      ))}
    </div>
  )
}

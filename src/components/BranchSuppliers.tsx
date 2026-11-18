import { useHQSuppliers } from '../hooks/useHQSuppliers'
import { useHQPartners } from '../hooks/useHQPartners'

/** Suppliers and partners that serve a branch — read-only, managed in HQ knowledge base. */
export function BranchSuppliers({ branchId }: { branchId: string | null | undefined }) {
  const { suppliers } = useHQSuppliers()
  const { partners } = useHQPartners()
  if (!branchId) return null
  const mine = suppliers.filter((s) => s.active !== false && s.branchIds.includes(branchId))
  const partnersHere = partners.filter((p) => p.active !== false && (p.branchIds ?? []).includes(branchId))

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-sm font-bold text-gray-700">ספקים ושותפים</h3>
      {mine.length === 0 && partnersHere.length === 0 ? (
        <p className="text-xs text-gray-400">לא שויכו ספקים לסניף — אפשר לשייך במאגר ידע מטה ← ספקים</p>
      ) : (
        <div className="flex flex-col gap-1">
          {mine.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-xs bg-indigo-50 rounded-lg px-2.5 py-1.5">
              <span>🚚</span>
              <span className="font-medium" style={{ color: '#141348' }}>{s.name}</span>
              {s.categories.length > 0 && <span className="text-gray-400 truncate">{s.categories.join(', ')}</span>}
              {s.phone && <span className="mr-auto text-gray-500" dir="ltr">{s.phone}</span>}
            </div>
          ))}
          {partnersHere.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-xs bg-teal-50 rounded-lg px-2.5 py-1.5">
              <span>🤝</span>
              <span className="font-medium" style={{ color: '#141348' }}>{p.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

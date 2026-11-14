import type { TaxDimension, TaxValue } from '../lib/taxonomy.ts'

interface Props {
  values: TaxValue[]
  selected: string[]
  onChange: (next: string[]) => void
  multi?: boolean
}

/** בחירת ערכים כצ'יפים. ערכים לא פעילים מוצגים רק אם כבר נבחרו (כדי לא לאבד מידע במסמכים ישנים). */
export default function TagPicker({ values, selected, onChange, multi = true }: Props) {
  const visible = values.filter((v) => v.active !== false || selected.includes(v.key))
  const toggle = (key: string) => {
    if (!multi) return onChange(selected[0] === key ? [] : [key])
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key])
  }
  return (
    <div className="chips" role="group">
      {visible.map((v) => (
        <button
          type="button"
          key={v.key}
          className={`chip${selected.includes(v.key) ? ' on' : ''}${v.active === false ? ' inactive' : ''}`}
          aria-pressed={selected.includes(v.key)}
          title={v.note ?? v.hint ?? ''}
          onClick={() => toggle(v.key)}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

export function DimLabel({ def }: { def: TaxDimension | undefined }) {
  return <>{def?.label}</>
}

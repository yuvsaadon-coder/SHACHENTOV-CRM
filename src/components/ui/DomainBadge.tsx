import type { Domain } from '../../types'
import { DOMAIN_LABELS, DOMAIN_COLORS } from '../../types'
import { getTextColor } from '../../utils/color'

export function DomainBadge({ domain }: { domain: Domain }) {
  const bg = DOMAIN_COLORS[domain]
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: bg, color: getTextColor(bg) }}
    >
      {DOMAIN_LABELS[domain]}
    </span>
  )
}

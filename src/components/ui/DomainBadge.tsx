import type { Domain } from '../../types'
import { DOMAIN_LABELS, DOMAIN_COLORS } from '../../types'

export function DomainBadge({ domain }: { domain: Domain }) {
  const color = DOMAIN_COLORS[domain]
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {DOMAIN_LABELS[domain]}
    </span>
  )
}

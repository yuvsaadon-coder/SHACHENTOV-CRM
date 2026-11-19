import type { ReactNode } from 'react'
import { money } from '../lib/format'

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  )
}

export function Card({ title, accent, children }: { title?: ReactNode; accent?: boolean; children: ReactNode }) {
  return (
    <div className={`card${accent ? ' accent' : ''}`}>
      {title && <div className="card-title">{title}</div>}
      {children}
    </div>
  )
}

export function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className={`stat${accent ? ' accent' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}

export function BudgetBar({ used, budget, ofLabel }: { used: number; budget: number; ofLabel: string }) {
  const pct = budget > 0 ? Math.min(100, (used / budget) * 100) : 0
  return (
    <div>
      <div className="budgetbar-top">
        <span className="cell-strong">{money(used)} {ofLabel} {money(budget, { trim: true })}</span>
        <span className="muted">{pct.toFixed(0)}%</span>
      </div>
      <div className="budgetbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function Field({ label, grow, children }: { label: string; grow?: boolean; children: ReactNode }) {
  return (
    <label className={`field${grow ? ' grow' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}

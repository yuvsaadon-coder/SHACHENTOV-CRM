import { useMemo, useState } from 'react'
import { he } from '../../i18n/he'
import { money } from '../../lib/format'
import type { Items } from '../../lib/algorithm'
import { visibleProducts, roundOf, type LegacyConfig, type LegacyCoordinator, type LegacyVote } from '../../data/legacy'
import { useLocalDraft } from '../../data/hooks'
import type { Store } from '../../data/store'
import { basketStatus, basketTotal, clampQty, cleanItems, isBasketValid, isUnlocked } from './basket'

type Draft = Record<string, Items>

const CHIP = {
  empty: { cls: 'chip-empty', label: he.chipEmpty },
  ok: { cls: 'chip-ok', label: he.chipOk },
  warn: { cls: 'chip-warn', label: he.chipWarn },
  over: { cls: 'chip-over', label: he.chipOver },
} as const

export function VoteStepper({ store, config, coordinator, existingVote, onLogout }: {
  store: Store
  config: LegacyConfig
  coordinator: LegacyCoordinator
  existingVote?: LegacyVote
  onLogout: () => void
}) {
  // Same localStorage key as the legacy stepper, so an in-progress draft survives the switch.
  const [draft, setDraft] = useLocalDraft<Draft>(`shachen-tov-v2-${coordinator.id}`, {})
  const [openBasket, setOpenBasket] = useState<string | null>(config.baskets[0]?.id ?? null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const products = useMemo(() => visibleProducts(config, coordinator), [config, coordinator])
  const allowed = useMemo(() => new Set(products.map((p) => p.id)), [products])
  const baskets = config.baskets
  const round = roundOf(config)

  // Start from the saved vote when there is no local draft (e.g. a different device).
  const items = (bid: string): Items => draft[bid] ?? (existingVote?.[bid as keyof LegacyVote] as Items | undefined) ?? {}
  const totals = baskets.map((b) => basketTotal(items(b.id), products))
  const budgets = baskets.map((b) => b.budget)
  const validCount = baskets.filter((b, i) => isBasketValid(totals[i]!, b.budget)).length
  const allValid = validCount === baskets.length
  const totalAll = totals.reduce((a, b) => a + b, 0)
  const budgetAll = budgets.reduce((a, b) => a + b, 0)

  const setQty = (bid: string, pid: string, qty: number) => {
    const p = products.find((x) => x.id === pid)
    if (!p) return
    setDraft((s) => ({ ...s, [bid]: { ...items(bid), ...s[bid], [pid]: clampQty(qty, p.max) } }))
  }

  const submit = async () => {
    if (!allValid || submitting || !round.open) return
    setSubmitting(true)
    const vote: LegacyVote = {
      coordinatorId: coordinator.id, coordinatorName: coordinator.name, branch: coordinator.branch, submittedAt: Date.now(),
    }
    for (const b of baskets) (vote as unknown as Record<string, Items>)[b.id] = cleanItems(items(b.id), allowed)
    try {
      await store.submitVote(vote)
      setMessage(he.submitOk(coordinator.name))
    } catch (err) {
      console.error('save failed', err)
      setMessage(he.submitFail(err instanceof Error ? err.message : String(err)))
    } finally {
      setSubmitting(false)
    }
  }

  if (!round.open) {
    return (
      <div className="center-msg">
        <div>
          <h1>{he.roundClosedTitle}</h1>
          <p>{he.roundClosedBody}</p>
          <button type="button" className="btn" onClick={onLogout}>{he.switchUser}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="stepper">
      <header className="stepper-header">
        <div className="stepper-header-row">
          <div style={{ flex: 1 }}>
            <div className="stepper-kicker">{he.roundHeader}</div>
            <div className="stepper-name">{coordinator.name}</div>
            <div className="stepper-branch">{he.branchLabel(coordinator.branch)}</div>
          </div>
          <div className="stepper-actions">
            <button type="button" className="btn btn-small btn-ghost-light" onClick={onLogout}>{he.switchUser}</button>
          </div>
        </div>
        <div className="progress-text">
          {he.overallProgress} <strong>{money(totalAll, { trim: true })}</strong> {he.of} {money(budgetAll, { trim: true })}
        </div>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={budgetAll} aria-valuenow={Math.round(totalAll)}>
          <div style={{ width: `${Math.min(100, budgetAll ? (totalAll / budgetAll) * 100 : 0)}%` }} />
        </div>
      </header>

      {(message || existingVote) && <div className="notice" role="status">{message ?? he.alreadySubmitted}</div>}

      <div className="baskets">
        {baskets.map((b, i) => {
          const its = items(b.id)
          const total = totals[i]!
          const status = basketStatus(total, b.budget)
          const unlocked = isUnlocked(i, totals, budgets)
          const open = openBasket === b.id && unlocked
          const itemCount = Object.values(its).reduce((s, v) => s + v, 0)
          const chip = CHIP[status.state]
          const bodyId = `basket-${b.id}`
          return (
            <section key={b.id} className={`basket${open ? ' is-open' : ''}${unlocked ? '' : ' is-locked'}`} aria-label={b.name}>
              <button
                type="button" className="basket-toggle" disabled={!unlocked} aria-expanded={open} aria-controls={bodyId}
                onClick={() => setOpenBasket(open ? null : b.id)}
              >
                <span className="basket-num" aria-hidden>{unlocked ? i + 1 : '🔒'}</span>
                <span className="basket-title">
                  <strong>{b.name}{unlocked ? '' : <span className="sr-only"> ({he.locked})</span>}</strong>
                  <span>{he.budgetLine(money(b.budget, { trim: true }), itemCount > 0 ? he.itemsLine(itemCount, money(total)) : he.empty)}</span>
                </span>
                {!open && unlocked && <span className={`chip ${chip.cls}`}>{chip.label}</span>}
                <span className="basket-sign" aria-hidden>{open ? '–' : '+'}</span>
              </button>

              {open && (
                <div className="basket-body" id={bodyId}>
                  <div className="product-grid">
                    {products.map((p) => {
                      const qty = its[p.id] ?? 0
                      return (
                        <div key={p.id} className={`product${qty > 0 ? ' has-qty' : ''}`}>
                          <div className="product-top">
                            <div className="product-emoji" aria-hidden>{p.emoji}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="product-name">{p.name}</div>
                              <div className="product-meta">{money(p.price, { trim: true })}{p.max < 10 ? ` · ${he.maxQty(p.max)}` : ''}</div>
                            </div>
                          </div>
                          <div className="qty">
                            <button type="button" aria-label={he.decrease(p.name)} disabled={qty === 0} onClick={() => setQty(b.id, p.id, qty - 1)}>−</button>
                            <output aria-live="polite" aria-label={he.qtyOf(p.name, qty)}>{qty}</output>
                            <button type="button" aria-label={he.increase(p.name)} disabled={qty >= p.max} onClick={() => setQty(b.id, p.id, qty + 1)}>+</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className={`basket-summary${status.state === 'over' ? ' is-over' : status.state === 'warn' ? ' is-warn' : ''}`}>
                    <div>
                      <strong>{money(total)}</strong> / {money(b.budget, { trim: true })}
                      {status.state === 'over' && <span className="txt-over">{he.overBy(money(total - b.budget))}</span>}
                      {status.state === 'warn' && <span className="txt-warn">{he.left(money(b.budget - total))}</span>}
                    </div>
                    {(status.state === 'ok' || status.state === 'warn') && i < baskets.length - 1 && (
                      <button type="button" className="btn btn-primary btn-small" onClick={() => setOpenBasket(baskets[i + 1]!.id)}>{he.nextBasket}</button>
                    )}
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>

      <div className="submit-bar">
        <div className="submit-bar-inner">
          <div style={{ flex: 1 }}>
            <div className="submit-bar-label">{he.voteTotal}</div>
            <div className="submit-bar-total">{money(totalAll)} / {money(budgetAll, { trim: true })}</div>
          </div>
          <button type="button" className="btn btn-primary" disabled={!allValid || submitting} onClick={() => void submit()}>
            {submitting ? he.submitting : allValid ? he.submit : he.completedOf(validCount, baskets.length)}
          </button>
        </div>
      </div>
    </div>
  )
}

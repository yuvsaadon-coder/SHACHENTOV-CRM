import { useMemo, useState } from 'react'
import { he } from '../../i18n/he'
import { money } from '../../lib/format'
import type { Items } from '../../lib/algorithm'
import type { BasketKey, VoteDoc, VotingConfig } from '../../data/model'
import { productsForBranch } from '../../data/cycle'
import { useLocalDraft } from '../../data/hooks'
import type { VotingStore } from '../../data/store'
import { roundLabel } from '../admin/RoundsPanel'
import { basketStatus, basketTotal, clampQty, cleanItems, isBasketValid, isUnlocked } from './basket'

type Draft = Record<string, Items>

const CHIP = {
  empty: { cls: 'chip-empty', label: he.chipEmpty },
  ok: { cls: 'chip-ok', label: he.chipOk },
  warn: { cls: 'chip-warn', label: he.chipWarn },
  over: { cls: 'chip-over', label: he.chipOver },
} as const

/**
 * The coordinator's voting screen. In the CRM the coordinator is the signed-in user and the branch is the portal
 * branch. `preview` renders exactly the same screen for HQ without saving anything.
 */
export function VoteStepper({ store, config, uid, name, branchId, branchName, existingVote, preview, inPortal }: {
  store: VotingStore | null
  config: VotingConfig
  uid: string
  name: string
  branchId: string
  branchName: string
  existingVote?: VoteDoc | null
  preview?: boolean
  inPortal?: boolean
}) {
  const [draft, setDraft] = useLocalDraft<Draft>(`voting-draft-${preview ? 'preview-' : ''}${uid}-${branchId}`, {})
  const [openBasket, setOpenBasket] = useState<string | null>(config.baskets[0]?.id ?? null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const products = useMemo(() => productsForBranch(config, branchId), [config, branchId])
  const allowed = useMemo(() => new Set(products.map((p) => p.id)), [products])
  const baskets = config.baskets
  const round = config.round ?? { num: 1, open: true }

  // Start from the saved vote when there is no local draft (e.g. a different device).
  const items = (bid: string): Items => draft[bid] ?? existingVote?.baskets[bid as BasketKey] ?? {}
  const totals = baskets.map((b) => basketTotal(items(b.id), products))
  const budgets = baskets.map((b) => b.budget)
  const validCount = baskets.filter((b, i) => isBasketValid(totals[i] ?? 0, b.budget)).length
  const allValid = validCount === baskets.length
  const totalAll = totals.reduce((a, b) => a + b, 0)
  const budgetAll = budgets.reduce((a, b) => a + b, 0)
  const label = roundLabel(round)

  const setQty = (bid: string, pid: string, qty: number) => {
    const p = products.find((x) => x.id === pid)
    if (!p) return
    setDraft((s) => ({ ...s, [bid]: { ...items(bid), ...s[bid], [pid]: clampQty(qty, p.max) } }))
  }

  const submit = async () => {
    if (!allValid || submitting || !round.open || preview || !store) return
    setSubmitting(true)
    const vote: VoteDoc = {
      uid, branchId, name, submittedAt: Date.now(), round: round.num,
      baskets: Object.fromEntries(baskets.map((b) => [b.id, cleanItems(items(b.id), allowed)])),
    }
    try {
      await store.submitVote(vote)
      setMessage(he.submitOk(name))
    } catch (err) {
      console.error('save failed', err)
      setMessage(he.submitFail(err instanceof Error ? err.message : String(err)))
    } finally {
      setSubmitting(false)
    }
  }

  if (!round.open && !preview) {
    return (
      <div className="center-msg">
        <div><h2>{he.roundClosedTitle}</h2><p>{he.roundClosedBody}</p></div>
      </div>
    )
  }

  return (
    <div className="stepper">
      <header className="stepper-header">
        <div className="stepper-header-row">
          <div style={{ flex: 1 }}>
            <div className="stepper-kicker">{he.roundHeader}{label ? ` · ${label}` : ''}</div>
            <div className="stepper-name">{name}</div>
            <div className="stepper-branch">{he.branchLabel(branchName)}</div>
          </div>
        </div>
        <div className="progress-text">
          {he.overallProgress} <strong>{money(totalAll, { trim: true })}</strong> {he.of} {money(budgetAll, { trim: true })}
        </div>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={budgetAll} aria-valuenow={Math.round(totalAll)}>
          <div style={{ width: `${Math.min(100, budgetAll ? (totalAll / budgetAll) * 100 : 0)}%` }} />
        </div>
      </header>

      {preview && <div className="preview-banner" role="note">{he.crm.previewBanner}</div>}
      {(message || (existingVote && !preview)) && <div className="notice" role="status">{message ?? he.alreadySubmitted}</div>}

      <div className="baskets">
        {baskets.map((b, i) => {
          const its = items(b.id)
          const total = totals[i] ?? 0
          const status = basketStatus(total, b.budget)
          const unlocked = isUnlocked(i, totals, budgets)
          const open = openBasket === b.id && unlocked
          const itemCount = Object.values(its).reduce((s, v) => s + v, 0)
          const chip = CHIP[status.state]
          const bodyId = `basket-${b.id}`
          return (
            <section key={b.id} className={`basket${open ? ' is-open' : ''}${unlocked ? '' : ' is-locked'}`} aria-label={b.name}>
              <button type="button" className="basket-toggle" disabled={!unlocked} aria-expanded={open} aria-controls={bodyId}
                onClick={() => setOpenBasket(open ? null : b.id)}>
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

      <div className={`submit-bar${inPortal ? ' in-portal' : ''}`}>
        <div className="submit-bar-inner">
          <div style={{ flex: 1 }}>
            <div className="submit-bar-label">{he.voteTotal}</div>
            <div className="submit-bar-total">{money(totalAll)} / {money(budgetAll, { trim: true })}</div>
          </div>
          <button type="button" className="btn btn-primary" disabled={!allValid || submitting || preview} onClick={() => void submit()}>
            {preview ? he.crm.previewSubmit : submitting ? he.submitting : allValid ? he.submit : he.completedOf(validCount, baskets.length)}
          </button>
        </div>
      </div>
    </div>
  )
}

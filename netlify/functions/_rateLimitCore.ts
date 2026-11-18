export const WINDOW_MS = 15 * 60 * 1000
export const LOCK_MS = 15 * 60 * 1000

export interface AttemptState {
  count: number
  windowStart: number
  lockedUntil: number
}

export function isLocked(state: AttemptState | undefined, now: number): boolean {
  return !!state && state.lockedUntil > now
}

/** The state after one more failed attempt: counts within a window, locks when the limit is reached. */
export function afterFailure(prev: AttemptState | undefined, now: number, limit: number): AttemptState {
  const fresh = !prev || now - prev.windowStart > WINDOW_MS
  const count = (fresh ? 0 : prev.count) + 1
  return {
    count,
    windowStart: fresh ? now : prev.windowStart,
    lockedUntil: count >= limit ? now + LOCK_MS : fresh ? 0 : prev.lockedUntil,
  }
}

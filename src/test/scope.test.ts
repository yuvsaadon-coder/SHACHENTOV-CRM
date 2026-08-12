import { describe, it, expect } from 'vitest'
import type { ScopeKey } from '../pages/HQChatPage'

// Pure logic extracted from HQChatPage.toggleScope
function toggleScope(prev: ScopeKey[], key: ScopeKey): ScopeKey[] {
  if (prev.includes(key)) {
    return prev.length > 1 ? prev.filter((s) => s !== key) : prev
  }
  return [...prev, key]
}

describe('toggleScope', () => {
  it('adds a scope that is not currently selected', () => {
    const result = toggleScope(['hq', 'research'], 'branch')
    expect(result).toContain('branch')
    expect(result).toHaveLength(3)
  })

  it('removes a scope that is currently selected', () => {
    const result = toggleScope(['hq', 'research', 'global'], 'global')
    expect(result).not.toContain('global')
    expect(result).toHaveLength(2)
  })

  it('does not remove the last remaining scope', () => {
    const result = toggleScope(['hq'], 'hq')
    expect(result).toEqual(['hq'])
  })

  it('maintains other scopes when adding', () => {
    const initial: ScopeKey[] = ['hq', 'research']
    const result = toggleScope(initial, 'global')
    expect(result).toContain('hq')
    expect(result).toContain('research')
    expect(result).toContain('global')
  })

  it('returns unchanged array when trying to remove sole scope', () => {
    const initial: ScopeKey[] = ['research']
    const result = toggleScope(initial, 'research')
    expect(result).toBe(initial)
  })
})

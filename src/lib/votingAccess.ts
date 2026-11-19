/**
 * Who sees and manages the basket survey in the HQ environment: system managers, the suppliers
 * coordinator (domain SUP) and the Jerusalem branches coordinator (domain JLM). Nobody else —
 * the sidebar item is hidden and the page itself says there is no access.
 */
export function canManageVoting(access: string, domain: string | null): boolean {
  return access === 'admin' || domain === 'JLM' || domain === 'SUP'
}

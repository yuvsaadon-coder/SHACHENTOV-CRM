import { describe, expect, it } from 'vitest'
import { authErrorMessage } from '../lib/authErrors'

const fb = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code })

describe('authErrorMessage', () => {
  it('says wrong credentials only for real credential errors', () => {
    expect(authErrorMessage(fb('auth/invalid-credential'))).toBe('אימייל או סיסמה שגויים')
    expect(authErrorMessage(fb('auth/wrong-password'))).toBe('אימייל או סיסמה שגויים')
  })
  it('does not call a temporary lock or a disabled account a wrong password', () => {
    expect(authErrorMessage(fb('auth/too-many-requests'))).toContain('ננעל זמנית')
    expect(authErrorMessage(fb('auth/user-disabled'))).toContain('מושבת')
  })
  it('explains an unauthorised domain', () => {
    expect(authErrorMessage(fb('auth/unauthorized-domain'))).toContain('Authorized domains')
  })
  it('keeps the code for unknown errors so it can be reported', () => {
    expect(authErrorMessage(fb('auth/something-new'))).toContain('auth/something-new')
  })
})

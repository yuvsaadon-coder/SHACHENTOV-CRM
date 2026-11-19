import { describe, expect, it } from 'vitest'
import { distinctContacts, telHref } from '../lib/branchContacts'

describe('branch contacts', () => {
  it('drops linked contacts that repeat the supplier phone or e-mail, and duplicates', () => {
    const linked = [
      { name: 'דני', phone: '052-111-2222' },
      { name: 'רות', email: 'RUT@x.co' },
      { name: 'משה', phone: '050-9999999' },
      { name: 'משה', phone: '0509999999' },
    ]
    const out = distinctContacts({ phone: '0521112222', email: 'rut@x.co' }, linked)
    expect(out.map((c) => c.name)).toEqual(['משה'])
  })

  it('builds a dialable tel link', () => {
    expect(telHref('052-111 2222')).toBe('tel:0521112222')
    expect(telHref('+972 52-1112222')).toBe('tel:+972521112222')
  })
})

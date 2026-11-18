import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), serverTimestamp: vi.fn(), writeBatch: vi.fn(),
}))

import { buildTarget, defaultExtras, fromDrive, fromOfficial } from '../lib/hqDocTransfer'
import type { HQDriveLink, HQOfficialDoc } from '../types'

const link = { id: 'd1', name: 'תקציב 2025', url: 'https://drive.google.com/x', driveType: 'sheet', category: 'budget', year: 2025, notes: 'n' } as HQDriveLink

describe('doc transfer', () => {
  it('drive -> finance keeps title, link, notes and takes period from the year', () => {
    const s = fromDrive(link)
    const t = buildTarget(s, 'finance', defaultExtras(s)) as Record<string, unknown>
    expect(t).toMatchObject({ title: 'תקציב 2025', fileUrl: link.url, notes: 'n', period: '2025' })
  })
  it('drive -> official keeps the old name in notes', () => {
    const s = fromDrive(link)
    const t = buildTarget(s, 'official', { ...defaultExtras(s), subtype: 'section46' }) as Record<string, unknown>
    expect(t).toMatchObject({ subtype: 'section46', year: 2025, fileUrl: link.url })
    expect(String(t.notes)).toContain('תקציב 2025')
  })
  it('official -> drive uses the label as name', () => {
    const o = { id: 'o', subtype: 'section46', year: 2024, fileUrl: 'https://x/y.pdf', registrationNumber: '58-1' } as HQOfficialDoc
    const s = fromOfficial(o)
    const t = buildTarget(s, 'drive', defaultExtras(s)) as Record<string, unknown>
    expect(String(t.name)).toContain('58-1')
    expect(t.url).toBe('https://x/y.pdf')
  })
})

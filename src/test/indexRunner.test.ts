// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { stateOf } from '../../netlify/functions/_indexRunner'
import type { FileEntry } from '../../netlify/functions/_fileSources'

const entry = (hash: string): FileEntry => ({ key: 'k', url: 'u', name: 'n.pdf', ext: 'pdf', kind: 'storage', places: [], sourceHash: hash })

describe('index state of a file', () => {
  it('is pending when never read or when the file changed', () => {
    expect(stateOf(entry('a'), undefined)).toBe('pending')
    expect(stateOf(entry('b'), { sourceHash: 'a' })).toBe('pending')
  })
  it('is indexed once read and unchanged', () => {
    expect(stateOf(entry('a'), { sourceHash: 'a', error: null })).toBe('indexed')
  })
  it('retries a failed file once more, then reports it as failed', () => {
    expect(stateOf(entry('a'), { sourceHash: 'a', error: 'HTTP 500', attempts: 1 })).toBe('pending')
    expect(stateOf(entry('a'), { sourceHash: 'a', error: 'HTTP 500', attempts: 2 })).toBe('failed')
  })
})

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import './unit-env'
import './network'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
  sessionStorage.clear()
})

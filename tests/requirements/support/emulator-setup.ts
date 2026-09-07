import { assertEmulatorEnvironment } from './emulator-env'
import './network'
import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/dom'

assertEmulatorEnvironment()

// Real Firestore/Auth Emulator round-trips are slower than the in-process
// V-layer mock, especially on the first request per test file (cold gRPC
// channel setup) — the default 1000ms `waitFor` timeout is too tight for
// that, independent of any actual test-logic issue.
configure({ asyncUtilTimeout: 8000 })

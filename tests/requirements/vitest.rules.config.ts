import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/requirements/emulator/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/requirements/support/emulator-setup.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 20000,
    hookTimeout: 30000,
    restoreMocks: true,
    clearMocks: true,
    reporters: ['default', 'json', 'junit'],
    outputFile: {
      json: 'tests/requirements/artifacts/emulator.json',
      junit: 'tests/requirements/artifacts/emulator.xml',
    },
  },
})

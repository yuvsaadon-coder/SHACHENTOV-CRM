import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    maxWorkers: 2,
    reporters: ['default', 'json', 'junit'],
    outputFile: {
      json: 'tests/requirements/artifacts/behavior.json',
      junit: 'tests/requirements/artifacts/behavior.xml',
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['tests/requirements/components/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/requirements/support/setup.ts'],
          restoreMocks: true,
          clearMocks: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'contracts',
          environment: 'node',
          include: ['tests/requirements/contracts/**/*.test.ts'],
          setupFiles: [
            'tests/requirements/support/unit-env.ts',
            'tests/requirements/support/network.ts',
          ],
          restoreMocks: true,
          clearMocks: true,
        },
      },
    ],
  },
})

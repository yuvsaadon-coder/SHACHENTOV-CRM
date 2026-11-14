import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['test/rules/**/*.test.ts'], environment: 'node', testTimeout: 20000, fileParallelism: false },
})

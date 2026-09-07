import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  testDir: './browser',
  outputDir: './artifacts/browser-traces',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: './artifacts/browser.json' }], ['junit', { outputFile: './artifacts/browser.xml' }]],
  use: {
    baseURL: 'http://127.0.0.1:5187',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    command: 'node node_modules/vite/bin/vite.js --config tests/requirements/browser-vite.config.ts --host 127.0.0.1 --port 5187 --strictPort',
    url: 'http://127.0.0.1:5187',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})

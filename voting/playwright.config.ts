import { defineConfig, devices } from '@playwright/test'

// E2E against the production build in demo mode (no Firebase env -> browser-only store).
// Emulator-backed E2E (SPEC appendix B) arrives with Phase 1-2.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4173', locale: 'he-IL', timezoneId: 'Asia/Jerusalem' },
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  projects: [
    { name: 'mobile-375', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 800 } } },
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
  ],
})

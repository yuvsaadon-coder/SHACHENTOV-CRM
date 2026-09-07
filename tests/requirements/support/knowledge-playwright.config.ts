import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import shared from '../playwright.config'

const requirements = fileURLToPath(new URL('..', import.meta.url))
const suffix = process.env.KNOWLEDGE_RESULT_SUFFIX ?? 'final'
if (!/^(final|probe-[KH]0[1-8])$/.test(suffix)) throw new Error('Invalid knowledge result suffix')
export default defineConfig({
  ...shared,
  testDir: path.join(requirements, 'browser', 'knowledge'),
  outputDir: path.join(requirements, 'artifacts', 'knowledge-feature-traces'),
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(requirements, 'artifacts', `knowledge-feature-browser-${suffix}.json`) }],
  ],
  timeout: 30_000,
  expect: { timeout: 5_000 },
})

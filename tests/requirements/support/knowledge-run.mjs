import { spawnSync } from 'node:child_process'
import { mkdirSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const lane = process.argv[2]
const commands = {
  browser: 'node node_modules/@playwright/test/cli.js test --config tests/requirements/support/knowledge-playwright.config.ts',
  rules: 'node node_modules/vitest/vitest.mjs run --config tests/requirements/vitest.rules.config.ts tests/requirements/emulator/knowledge --outputFile.json=tests/requirements/artifacts/knowledge-feature-emulator-final.json --outputFile.junit=tests/requirements/artifacts/knowledge-feature-emulator-final.xml',
}
if (!Object.hasOwn(commands, lane)) throw new Error('Expected knowledge lane: browser or rules')
const filter = process.argv[3]
if (filter && !/^[KH]0[1-8]$/.test(filter)) throw new Error('Only a knowledge family filter is allowed')
const command = (filter ? commands[lane].replaceAll('-final.', `-probe-${filter}.`) : commands[lane]) +
  (filter ? ` ${lane === 'browser' ? '--grep' : '-t'} TEST-${filter}` : '')
const cache = path.join(root, 'tests', 'requirements', '.cache')
mkdirSync(cache, { recursive: true })
for (const file of ['firestore.rules', 'storage.rules']) copyFileSync(path.join(root, file), path.join(cache, file))
const env = { ...process.env, CI: 'true', NO_UPDATE_NOTIFIER: '1' }
env.KNOWLEDGE_RESULT_SUFFIX = filter ? `probe-${filter}` : 'final'
for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'FIREBASE_SERVICE_ACCOUNT', 'ANTHROPIC_API_KEY']) delete env[key]
env.GCLOUD_PROJECT = 'demo-shachentov-requirements'
env.GOOGLE_CLOUD_PROJECT = env.GCLOUD_PROJECT
env.FIREBASE_CONFIG = JSON.stringify({ projectId: env.GCLOUD_PROJECT })
const result = spawnSync(process.execPath, [
  path.join(root, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js'),
  'emulators:exec', '--project', env.GCLOUD_PROJECT, '--config', 'tests/requirements/firebase.json',
  '--only', 'auth,firestore,storage', command,
], { cwd: root, env, stdio: 'inherit' })
if (result.error) throw result.error
if (result.signal) throw new Error(`Emulator runner terminated by ${result.signal}`)
process.exitCode = result.status ?? 1

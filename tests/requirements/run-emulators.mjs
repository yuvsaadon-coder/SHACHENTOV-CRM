import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
const lane = process.argv[2]
const area = process.argv[3]
const commands = {
  rules: 'node node_modules/vitest/vitest.mjs run --config tests/requirements/vitest.rules.config.ts',
  browser: 'node node_modules/@playwright/test/cli.js test --config tests/requirements/playwright.config.ts',
}
if (!Object.hasOwn(commands, lane)) {
  throw new Error('Expected emulator lane: rules or browser')
}
if (area && (lane !== 'rules' || !['core', 'operations', 'knowledge', 'rules'].includes(area))) {
  throw new Error('Expected emulator test area: core, operations, knowledge, or rules')
}
const command = commands[lane] + (area ? ` tests/requirements/emulator/${area}` : '')

// The CLI rejects rules outside its config directory. Refresh exact copies on every run.
const cache = path.join(root, 'tests', 'requirements', '.cache')
mkdirSync(cache, { recursive: true })
for (const rules of ['firestore.rules', 'storage.rules']) {
  copyFileSync(path.join(root, rules), path.join(cache, rules))
}

const env = { ...process.env, CI: 'true', NO_UPDATE_NOTIFIER: '1' }
delete env.GOOGLE_APPLICATION_CREDENTIALS
delete env.FIREBASE_TOKEN
delete env.FIREBASE_SERVICE_ACCOUNT
delete env.ANTHROPIC_API_KEY
env.GCLOUD_PROJECT = 'demo-shachentov-requirements'
env.GOOGLE_CLOUD_PROJECT = env.GCLOUD_PROJECT
env.FIREBASE_CONFIG = JSON.stringify({ projectId: env.GCLOUD_PROJECT })

const result = spawnSync(process.execPath, [
  path.join(root, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js'),
  'emulators:exec',
  '--project', env.GCLOUD_PROJECT,
  '--config', 'tests/requirements/firebase.json',
  '--only', 'auth,firestore,storage',
  command,
], { cwd: root, env, stdio: 'inherit' })

if (result.error) throw result.error
if (result.signal) throw new Error(`Emulator runner terminated by ${result.signal}`)
process.exitCode = result.status ?? 1

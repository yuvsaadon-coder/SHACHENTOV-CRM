import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const artifacts = path.join(root, 'tests', 'requirements', 'artifacts')
const sha = (filename) => createHash('sha256').update(readFileSync(filename)).digest('hex')
const read = (filename) => JSON.parse(readFileSync(path.join(artifacts, filename), 'utf8'))
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const historical = read('knowledge-feature-final.json')
const priorReviews = read('knowledge-feature-individual-reviews.json')
const preparation = read('knowledge-consistency-preparation.json')
const freshReviews = read('knowledge-current-six-reviews.json')
const freshById = new Map(freshReviews.cases.map((entry) => [entry.id, entry]))
const priorById = new Map(priorReviews.cases.map((entry) => [entry.id, entry]))
const historicalById = new Map(historical.cases.map((entry) => [entry.id, entry]))
const changed = preparation.cases.map((entry) => entry.id).sort()
assert(JSON.stringify(changed) === JSON.stringify([...freshById.keys()].sort()), 'Missing changed/new case review')
assert(sha(path.join(artifacts, 'knowledge-feature-final.json')) === preparation.originalFrozenManifest.sha256, 'Historical manifest changed')
for (const file of historical.files) {
  assert(sha(path.join(artifacts, file.filename)) === file.sha256, `Historical lane changed: ${file.filename}`)
}
for (const file of preparation.files) {
  assert(sha(path.join(root, file.path)) === file.sha256, `Prepared source changed: ${file.path}`)
}
const production = spawnSync('git', ['--no-pager', 'diff', '--exit-code', '60548f8', '--', 'src', 'netlify', 'firestore.rules', 'storage.rules'], {
  cwd: root, encoding: 'utf8',
})
assert(!production.error && production.status === 0, 'Production baseline changed or could not be verified')

const cases = []
const files = []
const inputSuites = []
const idFrom = (title) => title.match(/TEST-[KH]\d\d\.[^\s(:]+/)?.[0]
const classificationFrom = (title) => title.match(/\(([AGC])\)/)?.[1]
function sourcePath(filename) {
  const absolute = path.resolve(root, filename)
  const relative = path.relative(root, absolute)
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `Out-of-root source: ${filename}`)
  return relative
}
function literalCaseLine(filename, id) {
  const lines = readFileSync(path.join(root, filename), 'utf8').split(/\r?\n/)
  const index = lines.findIndex((line) => ['it', 'test'].some((name) =>
    line.trimStart().startsWith(`${name}('${id} `) || line.trimStart().startsWith(`${name}("${id} `)))
  assert(index >= 0, `Current literal case not found in source: ${id}`)
  return index + 1
}

for (const input of [
  { lane: 'browser', filename: 'browser-final.json', expected: freshReviews.sha256 },
  { lane: 'emulator', filename: 'knowledge-full-run.json', expected: '6298d3eb883e2d5976d369ff42d7e56fb6202e2251b9232685b7188c1473b842' },
  { lane: 'components', filename: 'knowledge-components-current.json' },
]) {
  const fileSha = sha(path.join(artifacts, input.filename))
  if (input.expected) assert(fileSha === input.expected, `Current input changed: ${input.filename}`)
  const report = read(input.filename)
  files.push({ ...input, sha256: fileSha })
  if (input.lane === 'browser') {
    assert((report.errors ?? []).length === 0, 'Browser runner has top-level suite errors')
    const allResults = []
    const visit = (suite) => {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests) {
          allResults.push(...test.results)
        }
        const id = idFrom(spec.title)
        if (!id) continue
        assert(spec.tests.length === 1 && spec.tests[0].results.length === 1, `Retries/projects are ambiguous: ${id}`)
        assert(spec.tests[0].expectedStatus === 'passed', `Expected-failure/skip test is not ordinary acceptance: ${id}`)
        const result = spec.tests[0].results[0]
        cases.push({
          id, classification: classificationFrom(spec.title), lane: input.lane,
          file: sourcePath(path.join('tests', 'requirements', 'browser', spec.file)),
          line: spec.line, status: result.status, resultFile: input.filename,
          failures: (result.errors ?? []).map((error) => error.message),
          attachments: result.attachments ?? [],
        })
      }
      for (const child of suite.suites ?? []) visit(child)
    }
    visit(report)
    inputSuites.push({
      filename: input.filename, total: allResults.length,
      passed: allResults.filter((result) => result.status === 'passed').length,
      failed: allResults.filter((result) => result.status === 'failed').length,
      runnerErrors: report.errors ?? [],
      diagnosticNote: 'browser-final.log contains application-level unhandled rejection diagnostics. They are retained in case attachments/logs, not relabeled as successful handling.',
    })
  } else {
    const allAssertions = report.testResults.flatMap((file) => file.assertionResults)
    assert(allAssertions.length === report.numTotalTests, `Missing assertion records: ${input.filename}`)
    const unmatched = report.testResults.filter((file) =>
      file.status === 'failed' && !file.assertionResults.some((test) => test.status === 'failed'))
    assert(unmatched.length === 0, `Failed file without a failed case: ${input.filename}`)
    assert((report.unhandledErrors ?? []).length === 0, `Unhandled runner errors: ${input.filename}`)
    for (const file of report.testResults) {
      for (const result of file.assertionResults) {
        const id = idFrom(result.title)
        if (!id) continue
        const filename = sourcePath(file.name)
        cases.push({
          id, classification: classificationFrom(result.title), lane: input.lane,
          file: filename, line: result.location?.line ?? literalCaseLine(filename, id),
          status: result.status, resultFile: input.filename,
          failures: result.failureMessages ?? [], attachments: [],
        })
      }
    }
    inputSuites.push({
      filename: input.filename, total: report.numTotalTests,
      passed: report.numPassedTests, failed: report.numFailedTests,
      pending: report.numPendingTests, todo: report.numTodoTests,
      unmatchedFileFailures: unmatched, serializedUnhandledErrors: report.unhandledErrors ?? [],
      logAvailability: input.lane === 'emulator'
        ? 'Parent-designated structured H-source report; no matching standalone H-run log was supplied. H files and assertion counts are complete; API-only cases remain outside K/H scope.'
        : 'knowledge-components-current.log',
    })
  }
}

const carriedCauses = {
  'TEST-H02.branch-switch-no-session-mixing': 'PortalChat retains local messages and applies the old request continuation after the same component switches branch context.',
  'TEST-H03.source.reports': 'The actual report formatter reads answers while the legitimate producer-shaped report stores data, omitting the submitted fact.',
  'TEST-H05.task-evidence-reaches-context': 'hq-chat never queries tasks, so valid task facts cannot reach provider context through the selected sources.',
  'TEST-H06.challenge-content': 'PortalReport writes data; hq-chat reads answers and omits the actual submitted challenge.',
  'TEST-H06.year-disambiguation': 'hq-chat report formatting omits year and reads the wrong answer field, losing both year-qualified facts.',
  'TEST-H06.missing-roster-context': 'hq-chat queries submitted reports without the existing branch population, so non-reporting branches are absent.',
  'TEST-H07.scope-session-isolation': 'useChatHistory retains currentSessionId across authenticated user/type changes and updates a nonexistent document under the new owner.',
  'TEST-K01.domain-default': 'HQKnowledgePage initializes domainFilter to all instead of the signed-in domain default.',
  'TEST-K02.local-create-with-sparse-fields': 'The real link modal supplies undefined file-related fields and the production hook spreads them into addDoc, which rejects them.',
  'TEST-K02.local-create-document-modal': 'The real document modal supplies undefined optional fields, including url, and addDoc rejects the production-generated payload.',
  'TEST-K02.local-create-checklist-modal': 'The real checklist modal supplies undefined optional fields despite valid nonempty items; addDoc rejects the payload.',
  'TEST-K03.local-storage-contract': 'The real file modal fails saving undefined url/optional fields. This is a producer failure; later Storage persistence assertions are not independently established.',
  'TEST-K03.partial-upload-recovery': 'HQ source and Storage object survive failed file-metadata update without compensation, leaving an unlinked uploaded object.',
  'TEST-K04.delete-current-retrieval': 'HQ deletion removes only the source; its coordinator mirror and current handler context retain deleted content.',
  'TEST-K04.produced-mirror-tag-filter': 'The actual HQ mirror writer omits tags and the actual portal ItemCard unconditionally calls tags.map.',
  'TEST-K06.research-item-reaches-open-library': 'The maintained research writer persists the item, but KnowledgeLibraryPage filters a static catalog instead of maintained records.',
  'TEST-K08.document-content-grounding': 'The actual page and summarizer send title alone, not the selected document content or a verifiable document representation.',
}

cases.sort((a, b) => a.id.localeCompare(b.id))
assert(cases.length === 46 && new Set(cases.map((entry) => entry.id)).size === 46, 'Expected 46 distinct K/H cases')
let carried = 0
for (const entry of cases) {
  assert(entry.classification && ['passed', 'failed'].includes(entry.status), `Nonexecuted/unclassified case: ${entry.id}`)
  const fresh = freshById.get(entry.id)
  if (fresh) {
    assert(entry.status === fresh.status && entry.classification === fresh.classification, `Fresh verdict mismatch: ${entry.id}`)
    entry.review = { mode: 'fresh-current-leaf', ...fresh }
    entry.cause = fresh.cause
  } else {
    const previous = historicalById.get(entry.id)
    const review = priorById.get(entry.id)
    assert(previous && review, `Missing previous source/status/reviewer record: ${entry.id}`)
    assert(path.basename(previous.file) === path.basename(entry.file), `Carry source file changed: ${entry.id}`)
    assert(previous.status === entry.status && previous.classification === entry.classification, `Carry status/class changed: ${entry.id}`)
    assert(['VALID_PASS', 'VALID_PRODUCT_FAILURE'].includes(review.disposition), `Unresolved prior review: ${entry.id}`)
    entry.review = {
      mode: 'carried-source-status-matched',
      reviewer: review.reviewer, agentId: review.agentId, model: review.model, disposition: review.disposition,
      priorReviewFile: 'knowledge-feature-individual-reviews.json',
      sourceGate: 'Outside the six designated revised/new cases; prepared source hashes match; production is unchanged60548f8; latest status/classification match. Original per-case source byte hashes were not available, so this is change-inventory/source inspection plus status verification, not a fabricated historical byte comparison.',
      historicalEvidence: review.evidence,
      refs: (review.refs ?? []).filter((ref) => !ref.startsWith('tests/')),
    }
    entry.cause = entry.status === 'failed' ? carriedCauses[entry.id] : null
    assert(entry.status !== 'failed' || entry.cause, `Missing current cause: ${entry.id}`)
    carried++
  }
}
assert(carried === 40, 'Expected exactly 40 source/status-matched carried verdicts')
assert(new Set(cases.map((entry) => entry.review.agentId)).size === 46, 'Current reviewers must be distinct per case')
assert(cases.filter((entry) => entry.lane === 'browser').length === 30, 'Native browser count mismatch')
assert(cases.filter((entry) => entry.lane === 'emulator').length === 13, 'H emulator count mismatch')
assert(cases.filter((entry) => entry.lane === 'components').length === 3, 'H01 component count mismatch')
const sources = [...new Set([
  ...cases.map((entry) => entry.file),
  ...preparation.files.map((file) => file.path),
  'tests/requirements/support/knowledge-browser-driver.tsx',
  'tests/requirements/support/knowledge-chat-context.ts',
  'tests/requirements/support/knowledge-provider-stub.ts',
  'tests/requirements/support/knowledge-netlify-handler.ts',
  'tests/requirements/support/knowledge-grpc-fault.ts',
].map(sourcePath))].map((file) => ({ file, sha256: sha(path.join(root, file)) }))

const counts = {
  total: cases.length,
  passed: cases.filter((entry) => entry.status === 'passed').length,
  failed: cases.filter((entry) => entry.status === 'failed').length,
  independentlyReviewed: cases.length, freshCurrentReviews: freshById.size, carriedReviews: carried,
  pending: 0,
}
assert(counts.passed === 24 && counts.failed === 22, 'Unexpected current K/H totals')
writeFileSync(path.join(artifacts, 'knowledge-feature-final46.json'), JSON.stringify({
  schemaVersion: 2, authoritativeScope: 'Current 46 K/H cases only',
  baseline: '60548f8', generatedAt: new Date().toISOString(), counts,
  historicalManifest: { filename: 'knowledge-feature-final.json', sha256: preparation.originalFrozenManifest.sha256 },
  files, inputSuites, sources,
  reviewerQualityNotes: freshReviews.qualityCorrections,
  protectedSource: 'HQChatPage Authorization span is not read/reconstructed/hashed as source evidence. Baseline identity uses git diff metadata; H01 is black-box component execution.',
  sourceCarryNote: 'Forty case bodies were unchanged by the designated preparation delta and retain matching outcomes. New/revised six are independently reviewed against browser-final. Current test/helper fingerprints are recorded; protected production bytes are not reconstructed.',
  cases,
}, null, 2) + '\n')
console.log(JSON.stringify(counts))

import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'

it('TEST-N01.strict-production-compiler [G] enables the required strict TypeScript configuration', () => {
  const configPath = fileURLToPath(new URL('../../../../tsconfig.app.json', import.meta.url))
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic(diagnostic) {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
    },
  })

  expect(parsed, 'The application compiler configuration must parse').toBeDefined()
  expect(parsed?.errors).toEqual([])
  expect(Number(ts.versionMajorMinor.split('.')[0])).toBe(6)
  expect(parsed?.options.strict ?? false, 'REQ-T02 requires strict: true for the application compiler').toBe(true)
})

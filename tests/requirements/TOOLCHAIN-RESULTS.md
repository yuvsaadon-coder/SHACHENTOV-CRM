# Compiler configuration result

| Test | Classification | Actual result | Independent reviewer | Verdict |
|---|---|---|---|---|
| `TEST-N01.strict-production-compiler` | G | Failed | `review-N01-strict-final` | Confirmed production-configuration gap |

The [technical specification](../../docs/requirements/technical-specification.he.md#L31)
explicitly requires TypeScript 6 with `strict: true`.
The [test](contracts/toolchain/strict.test.ts#L5-L17) asks the installed TypeScript
compiler to resolve the real application configuration, including inheritance.
Parsing succeeds with no configuration errors and TypeScript 6.0.3 is installed,
but effective strict mode is not enabled.

The [application configuration](../../tsconfig.app.json#L1-L24) omits the setting.
The [root build project](../../tsconfig.json#L1-L7) references that configuration,
and the [build command](../../package.json#L8) runs `tsc -b` without an alternative
strict-mode configuration. Consequently the normal production build does not
enforce the required strict checks.

This is not a mocked result or a search for a source-code string: the real
compiler configuration API supplies the observed option. The successful parse
and major-version checks exclude missing dependencies or a malformed config as
the reason for failure. It proves a configuration mismatch, not a particular
runtime crash.

Reproduce from the repository root:

```text
node node_modules/vitest/vitest.mjs run --config tests/requirements/vitest.config.ts tests/requirements/contracts/toolchain --reporter=default
```

The normal assertion remains red. No production compiler setting was changed.

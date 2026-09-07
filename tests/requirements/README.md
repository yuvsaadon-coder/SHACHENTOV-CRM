# Requirements test suite

Application baseline: `60548f8`. Authoritative inputs are the immutable Hebrew
captures in `docs/requirements`. The suite is separate from the existing
`src/test` and `e2e` regression suites. It does not modify application logic or
Firebase authorization rules.

Start with [RESULTS.md](RESULTS.md) for the final counts and scope, and
[FAILURES.md](FAILURES.md) for the indexed explanation of every failing case.
[test-manifest.json](test-manifest.json) lists every executed case exactly once.

## Run

Install locked dependencies with `npm ci`. Use Node 24.15.0 for the test toolchain
(the runtime exercised locally); the current dependency tree has newer runtime
requirements than the application's original deployment specification.
The source specifies Node 20 for application deployment; this test-tooling
prerequisite does not change that deployment configuration. Firebase emulator runs also
require Java 21 on PATH; browser runs require Playwright's
Chromium (`npx playwright install chromium`).

For a portable Java runtime in PowerShell, set `JAVA_HOME` and prepend its `bin`
directory to PATH in the same shell before running the emulator command:

```powershell
$env:JAVA_HOME = 'C:\path\to\java21'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
```

No Public or Private network firewall exception is needed; the tests use local
emulator connections. Do not grant broad inbound Java access.

| Command | Scope |
|---|---|
| `npm test` | Existing regression suite, not requirement coverage |
| `npm run test:requirements` | Component/hook, network-free function contracts, and compiler configuration |
| `npm run test:requirements:rules` | Real Auth/Firestore/Storage emulator tests, including handler integration |
| `npm run test:requirements:browser` | Isolated browser journeys with emulators |
| `npm run test:requirements:typecheck` | Suite TypeScript checks |
| `npm run lint` and `npm run build` | Existing repository static/build commands |

Run the lanes independently and retain every exit code. A failure in one lane
must not prevent collecting the others. JSON and JUnit behavior/emulator results
are written under ignored `tests/requirements/artifacts`. Do not interpret an
empty/discovery-error report as a passing suite.

The emulator launcher starts its own services and shuts them down after the test
command. It does not attach to preexisting emulators. Ports are fixed and must be
free: Auth 9097, Firestore 8787, Storage 9297, hub 4407, logging 4507, Firestore
websocket 9157. Do not run two emulator lanes concurrently on this machine.

The Firebase CLI forbids rule paths outside its configuration directory. Before
each launch, the wrapper copies the exact current root `firestore.rules` and
`storage.rules` into ignored `.cache` files. Those generated files are not
alternative rules or committed snapshots; every run refreshes them from source.

## Safety and interpretation

Only `demo-shachentov-requirements` and loopback services are permitted. The
launcher removes cloud credential and provider-key environment variables and
disables CLI update/MOTD checks. Tests use synthetic data, never repository seed
scripts, customer exports, real Firebase projects, or actual Anthropic calls.
Dependency and emulator-binary downloads are provisioning, not test execution.

Behavior workers scrub credentials and force demo configuration before handler
imports. The shared transport guard intercepts `globalThis.fetch` and browser
XMLHttpRequest, including relative URLs. It is not an OS network sandbox and does not intercept every
raw socket or Node HTTP client. Real SDK test connections require validated demo
emulator settings; browser requests need the browser harness's routing guard.
CI environments needing process-wide egress isolation should enforce it at the
job/container boundary in addition to these harness checks.

Component/contract fakes prove only the behavior actually exercised. Emulator
tests are required for query semantics, real serialization, rules, and handler
authorization/source inclusion. Browser tests against a local Vite server do not
prove Netlify deployment behavior. Stubbed model responses prove rendering and
transport, not the model's semantic grounding or prompt-injection resistance.

Each concrete test has a stable `TEST-` identifier and one classification:

- **A:** acceptance behavior expected to work at the reviewed baseline.
- **G:** acceptance behavior predicted to expose a production gap.
- **C:** current-behavior characterization, not approval of that policy.

Predictions are not results. G tests use normal assertions and remain red when
the application violates the requirement. They are not expected-failure tests.
Setup failures are infrastructure problems, not proof of production defects.
Unresolved policies, future entrypoints, and operational evidence remain explicit
non-executable dispositions in the plan/results; no numeric targets are invented.

## Design and evidence

`TEST-PLAN.md` maps every technical section and executive feature to scenario
families, concrete oracles, or explicit policy/future/manual evidence gaps. It
was reviewed before implementation; the concrete registry overrides shorthand
family labels.

Area result reports record actual outcomes, independent per-test reviewer
assignments, failure explanations, and outstanding coverage. A passed
characterization does not cancel a failed acceptance test. A per-test reviewer
must verify that a green assertion reached real production behavior, and that a
red assertion is not caused by fixtures, mocks, selectors, or environment.

`AUTOMATION.md` proposes commit and release gates. No CI workflow or repository
protection setting is enabled by this suite.

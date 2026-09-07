# Proposed commit and release automation

This is a proposal, not an enabled workflow or a claim about deployed controls.
The acceptance suite must remain red when a requirement is violated. Do not
replace failing assertions with expected failures, retries, or `continue-on-error`.

## Commit and pull-request gate

Run on each push to the development branch and on pull requests. Use read-only
repository permissions, a clean checkout, and `npm ci`. Pin Node 24.15.0 for the
test toolchain, matching the locally exercised runtime and current dependencies.
The application specification names Node 20; validate application deployment
separately with its supported toolchain (Vite requires at least 20.19 in that line).
Do not silently change application runtime policy to match test tooling.

Use independent required jobs so a failing acceptance test does not hide results
from the other layers:

| Job | Required work |
|---|---|
| Static and build | Existing `npm run lint` and `npm run build`; suite typecheck |
| Existing regression suite | `npm test` |
| Requirement behavior | Isolated component/hook and server-function suites |
| Firebase boundaries | Real Firestore and Storage emulators and the unchanged repository rules |
| Critical browser flows | Isolated local application server, synthetic identities, HQ/admin/coordinator journeys |

Install Java 21 before the emulator job. Use only a `demo-` project ID and
loopback hosts. Disable CLI update/MOTD checks using `CI=true` and
`NO_UPDATE_NOTIFIER=1`; provisioning downloads are separate from offline execution.
The test runner must reject real project IDs and missing emulator
environment variables. Seed only synthetic records with rule enforcement disabled
for setup; perform assertions with real authenticated/unauthenticated SDK clients.
Never use a service account, deployed Firebase project, production data, or a real
Anthropic key. Test fixtures must not turn SDK boundary fakes into a claimed
Security Rules integration test.

Pin action implementations to reviewed commit SHAs when a workflow is adopted.
Do not run untrusted PR code through `pull_request_target`, grant write tokens, or
expose deployment secrets to test jobs. Enforce process-wide egress restrictions at the
job/container boundary when required; a JavaScript fetch guard is not a firewall.
Cancel superseded runs on the same branch,
not unrelated release runs. Give every job an explicit operational timeout.

Upload sanitized JUnit/JSON results and failure traces using an unconditional
artifact step even when the test command fails. Preserve the test command's
nonzero exit status. Artifacts must distinguish assertion failures, setup errors,
unexecuted scenarios, and unresolved policies. Set artifact retention through an
owner-approved policy; the requirements do not specify a retention duration.

## Release gate

Run all commit checks against the exact release commit, plus:

- Full browser journeys against the built app and local server-function runtime.
- Emulator integration, concurrent-write and recovery scenarios.
- Accessibility, load, and performance checks using explicitly approved budgets.
- Deployment-configuration inspection and an authorized preview-environment smoke
  test with isolated test accounts, only after credentials and scope are approved.

Local Vite browser tests do not prove Netlify routing, deployed authorization,
serverless timeouts, secret rotation, or production recovery. Treat these as
separate evidence requirements. Do not contact a deployed system from the normal
offline acceptance suite.

Require all intended gates through repository rulesets/branch protection; adding
a workflow alone does not block merges. A release must not silently exclude red
acceptance tests. If an owner explicitly waives a requirement, record the waiver,
scope, and expiry separately rather than weakening the assertion.

## Coverage and mutation

Track requirement-to-test coverage separately from line coverage. Publish measured
coverage and mutation results when their tooling is adopted; do not invent numeric
thresholds, report an unmeasured percentage, or treat missing features as covered
because a test checks that their source file is absent. Select thresholds and
performance/rate/retention budgets with the requirements owner before enforcement.

## Reproducibility

The original lockfile could not pass `npm ci`: optional platform package entries
were missing. This branch repairs that generated metadata and adds test-only
Firebase emulator dependencies. Keep the lockfile checked in. Use a package
registry available to the execution environment without disabling TLS validation.
No machine-specific runtime path belongs in the checked-in configuration.

Exact runnable suite commands and the tested environment belong in the adjacent
suite README after implementation. Review this proposal with the repository owner
before enabling workflows or changing repository protection.

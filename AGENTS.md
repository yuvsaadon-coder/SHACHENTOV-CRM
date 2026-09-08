# Agent guide

See [`CLAUDE.md`](CLAUDE.md) at the repository root. It's written for
whichever AI is currently working in this repo (Claude Code, GitHub Copilot,
or otherwise) — the maintainer is not a software engineer, so the AI is the
one responsible for keeping the app stable. In particular: the requirements
test suite under `tests/requirements/` is a **permanent gating check** for
any change — and because no CI workflow or branch protection enforces it yet
(see [`tests/requirements/AUTOMATION.md`](tests/requirements/AUTOMATION.md)),
*you* are the only thing enforcing it. Nothing will stop a bad change except
you running the checks. Read `CLAUDE.md` in full before considering any task
done.

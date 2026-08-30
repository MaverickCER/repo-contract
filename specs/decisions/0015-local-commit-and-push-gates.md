# 0015: Local commit and push gates run as zero-dependency git hooks

## Status

Accepted. Implemented in `.githooks/commit-msg`, `.githooks/pre-commit`, `.githooks/pre-push`,
`scripts/install-hooks.mjs`, and `package.json` (`prepare`, `precommit`, `prepush`). The
`commit-msg` hook (commitlint) was added with [ADR 0008](0008-api-contract-compatibility-gate.md).
`scripts/install-hooks.mjs` was later extended to also point `commit.template` at `.gitmessage`
(the Conventional Commits cheat sheet shown in the editor), under the same guards.

## Context

`npm run contract` is this repository's single mechanical quality gate, and both
[README](../../README.md) and [CONTRIBUTING](../../CONTRIBUTING.md) have long said to "wire it
into a `precommit`" — but nothing actually did. The `precommit` npm script existed and was
never invoked; the first time a contributor saw a contract failure was in CI, after a push and
a PR.

Running the _whole_ suite on every commit is not viable either: it takes ~5–6 minutes (mutation
testing alone is ~2.5 min) and several checks need network access (`security-deps` runs
`npm audit`, `docs` crawls links). A gate that slow on every commit trains people to pass
`--no-verify` reflexively, which is worse than no gate.

Separately, [ADR 0009](0009-self-hosting-tool-and-dependency-choices.md) sets the bar that a
clean checkout must satisfy the full suite through package installation alone, with no
separately-installed system binaries — so a hook manager like `husky` (a new devDependency plus
its own `.husky/` install step) is a poor fit.

## Decision

**Three hooks:**

- **`.githooks/commit-msg`** runs commitlint against the message being written (Conventional
  Commits, per `commitlint.config.mjs`) and blocks a non-conforming commit. Added with ADR
  0008, where Conventional Commits became the sole versioning input.
- **`.githooks/pre-commit`** runs `npm run precommit` and blocks the commit if it fails. That
  script (the authoritative list lives in `package.json`, not here) is a fast offline subset of
  the contract's static checks — no network, ~15–20 s. The test suites are deliberately left
  out: `test-unit` alone is ~45 s with coverage instrumentation, more than a commit-time gate
  should cost; tests run on pre-push and in CI. After the run, auto-fixes the writer checks
  (`format` / `lint --fix`, regenerated schemas) made to files that were **already staged** are
  re-staged; files that were not staged are left untouched.
- **`.githooks/pre-push`** runs the full `npm run contract` (the `prepush` script) and blocks
  the push.

**Installation is a side effect of `npm install`.** `prepare` runs `scripts/install-hooks.mjs`,
which points `core.hooksPath` at `.githooks` and `commit.template` at an absolute path to
`.gitmessage` (absolute because git resolves `commit.template` relative to the cwd of
`git commit`, not the repo root). No new dependency; the hook scripts are committed,
POSIX `sh`, and run on macOS, Linux, and Git-for-Windows alike. `install-hooks.mjs` is
deliberately unobtrusive: it no-ops when `CI` is set (so release-please-action's own commits in
CI are never intercepted), no-ops outside a git checkout (tarball installs), and never
overwrites a `core.hooksPath` a contributor set themselves.

**The hooks are advisory.** `git commit --no-verify` / `git push --no-verify` bypass them by
design, for genuine work-in-progress checkpoints. CI remains the authoritative gate — the PR
template already states that "`npm run contract` passing is necessary but not sufficient."

**`api-contract` / `adr-governance` are not enforced at pre-commit.** They derive their
evidence from `origin/main..HEAD` — committed history, which at pre-commit time is one commit
behind the change being made. They run in the full pre-push suite and in CI.

## Consequences

- A fresh `npm install` / `npm ci` now also writes two local git config values
  (`core.hooksPath`, `commit.template`). Both are documented in CONTRIBUTING, honor a value
  a contributor set themselves, and are reversible with `git config --unset <key>`.
- Every commit now runs ~15–20 s of checks. `--no-verify` is the escape hatch for a deliberate
  WIP commit.
- Every push now runs the full ~5–6 min suite. Contributors pushing WIP to a draft PR will
  often use `--no-verify` and rely on CI; that is expected, not a workaround.
- Partial staging (`git add -p`) plus an auto-fix to that same file: the hook re-stages the
  whole file, pulling in the hunks that were left unstaged. This is rare and is noted here so
  it is not a surprise.
- The pre-commit subset is a second, smaller definition of "good enough" alongside the full
  contract. It is deliberately a strict subset of the same checks (never a reimplementation),
  and pre-push plus CI always run the complete suite, so the smaller list can only ever be
  _faster to fail_, never _more permissive at the gate that matters_.

## Alternatives considered

- **`husky`.** Rejected: a new devDependency and a separate install step, against ADR 0009's
  "package install only" bar. `.githooks/` + `core.hooksPath` needs neither — `core.hooksPath`
  is the same mechanism `husky` itself uses under the hood.
- **Full `npm run contract` on pre-commit** (as literally requested at first). Rejected: ~5–6
  min per commit, network-dependent, and would push contributors to `--no-verify` as a habit —
  defeating the gate it is meant to be.
- **Full contract on pre-push only, nothing on pre-commit.** Rejected: a broken commit then
  lands in branch history and only surfaces at push time, where fixing it means an interactive
  rebase rather than just amending the commit that was blocked.
- **Enforcing `api-contract` / `adr-governance` at pre-commit.** Rejected: their
  `origin/main..HEAD` scan cannot see the not-yet-created commit, so they would need a bespoke
  commit-aware invocation while every other check stays history-based. (The `commit-msg` hook
  does check the message being written, which is a message file, not history.)
- **A read-only pre-commit that only _reports_ formatting/lint problems.** Rejected: `format`
  and `lint` are writer checks by design (`prettier --write`, `eslint --fix`); running them in
  a different check-only mode would duplicate their invocation contracts. Re-staging their
  fixes to already-staged files is the smaller cost.

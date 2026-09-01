# 0009: Versioning, the changelog, the ADR trail, and the local commit/push gates all derive from Conventional Commits

## Status

Accepted. Supersedes two earlier ADRs that were never retained as their own files — one on
changeset/ADR/PR documentation discipline, one on Keep a Changelog generation. Implemented in
`commitlint.config.mjs`, `.githooks/commit-msg`, `.githooks/pre-commit`, `.githooks/pre-push`,
`scripts/install-hooks.mjs`, the `commitlint` self-hosting check, `release-please-config.json` /
`.release-please-manifest.json`, `.github/workflows/release.yml`, `scripts/api-contract/*.ts`
(now a **gate**), `scripts/adr-governance/*.ts` (now scans commit messages), and `package.json`
(`setup`, `precommit`, `prepush`).

## Context

Versioning used to require a step outside the normal git flow: `npx changeset` to declare the
release bump, with Changesets driving `package.json` and `CHANGELOG.md`. Contributors already
write commit messages; they should not also have to author a changeset. Three checks
(`changeset-docs`, `adr-governance`, `api-contract`) plus a custom Keep a Changelog generator
were all keyed on the single `.changeset/*.md` file.

An earlier revision of this ADR deliberately kept `api-contract` **advisory** and refused to
interpret commit messages, because under Changesets `package.json`'s version legitimately lagged
the real state of unreleased work — gating on it would have failed nearly every API-touching PR.
That reasoning does not survive the switch: once the commits themselves declare the bump, the
check can and should gate on whether they declare _enough_.

Separately: `npm run contract` is this repository's single mechanical quality gate, and both
[README](../../README.md) and [CONTRIBUTING](../../CONTRIBUTING.md) have long said to "wire it
into a `precommit`" — but nothing actually did. The `precommit` npm script existed and was never
invoked; the first time a contributor saw a contract failure was in CI, after a push and a PR.
Running the _whole_ suite on every commit is not viable either: it takes ~5–6 minutes (mutation
testing alone is ~2.5 min) and several checks need network access (`security-deps` runs
`npm audit`, `docs` crawls links). A gate that slow on every commit trains people to pass
`--no-verify` reflexively, which is worse than no gate. And
[ADR 0008](0008-self-hosting-tool-and-dependency-choices.md) sets the bar that a clean checkout
must satisfy the full suite through package installation alone, with no separately-installed
system binaries — so a hook manager like `husky` (a new devDependency plus its own `.husky/`
install step) is a poor fit.

## Decision

**Conventional Commits are the sole versioning input.**

- **Format is enforced.** `@commitlint/config-conventional` via `commitlint.config.mjs`; the
  `.githooks/commit-msg` hook rejects a non-conforming message locally, and the `commitlint`
  self-hosting check re-lints `origin/main..HEAD` in `npm run contract` and CI. Merge strategy
  is **merge commit / rebase**, so every commit that lands on `main` conforms. Squash merging
  is disabled at the repo level; as a compensating control CI also lints the PR title
  (`amannn/action-semantic-pull-request`) and `api-contract` counts the PR title toward the
  declared bump (`PR_TITLE` in `ci.yml`).

- **release-please derives the version and changelog.** On push to `main` it maintains a
  "Release PR" (bumps `package.json`, regenerates `CHANGELOG.md` from the commit types,
  updates `.release-please-manifest.json`); merging that PR tags `vX.Y.Z` and creates a GitHub
  Release, which gates the credential-free `verify` job and then the OIDC `publish` job (the
  same credential-free-verify-then-publish split SECURITY.md describes). `bump-minor-pre-major`
  / `bump-patch-for-minor-pre-major` encode VERSIONING.md's pre-1.0 policy (a breaking change
  is a `minor` bump while `0.x`). Keep a Changelog styling is dropped — SemVer correctness
  matters more than the changelog's shape, and release-please's native grouped format is a
  fine changelog.

- **`api-contract` is now a gate.** It still derives the minimum required release level
  deterministically from the typed public-contract delta against the committed baseline (real
  API extraction + the TypeScript compiler for assignability — never heuristics). It then reads
  the branch's commit messages (plus the PR title in CI) with a small hand-rolled Conventional
  Commits parser (`scripts/api-contract/conventional-commits.ts` — hand-rolled for the same
  reason `semver.ts` is, and pinned by tests against the spec's worked examples; it must agree
  with release-please's bump logic) and **fails the PR when the declared bump is lower than the
  required one** — e.g. a breaking export removal committed as `fix:`. The stale-schema-literal
  finding still fails; an unclassifiable (`unknown`) delta still only warns, because a human
  must confirm the declared bump there. The baseline is still updated only by the explicit
  `npm run contract:baseline`, after a release ships.

- **`adr-governance` scans commit messages.** A PR touching `src/execution/**` or
  `src/policy/**` must either touch `specs/decisions/**` or reference a real, existing ADR
  (`ADR NNNN`) in one of its commit messages. This is the same hard-failure discipline the
  earlier documentation-discipline ADR established, repointed off the (now gone) changeset file.

- **ADR structure** — filename convention, no duplicate numbers, the five required section
  headings — is still validated mechanically as a static section of the `architecture` check.
  It evaluates the current file tree only; a numbering gap is accepted by design.

**The local commit/push gates run as zero-dependency git hooks.**

- **`.githooks/commit-msg`** runs commitlint against the message being written (Conventional
  Commits, per `commitlint.config.mjs`) and blocks a non-conforming commit. This hook arrived
  first, when Conventional Commits became the sole versioning input; the other two followed.
- **`.githooks/pre-commit`** runs `npm run precommit` and blocks the commit if it fails. That
  script (the authoritative list lives in `package.json`, not here) is a fast offline subset of
  the contract's static checks — no network, ~15–20 s. The test suites are deliberately left
  out: `test-unit` alone is ~45 s with coverage instrumentation, more than a commit-time gate
  should cost; tests run on pre-push and in CI. After the run, auto-fixes the writer checks
  (`format` / `lint --fix`, regenerated schemas) made to files that were **already staged** are
  re-staged; files that were not staged are left untouched.
- **`.githooks/pre-push`** runs the full `npm run contract` (the `prepush` script) and blocks
  the push.
- **Installation is one explicit command: `npm run setup`.** That script builds `dist/` and
  runs `scripts/install-hooks.mjs`, which points `core.hooksPath` at `.githooks` and
  `commit.template` at an absolute path to `.gitmessage` (absolute because git resolves
  `commit.template` relative to the cwd of `git commit`, not the repo root). It is a plain npm
  script, **not** an npm lifecycle hook (`prepare` / `postinstall` / …): the published package
  ships with no install scripts at all, so a consumer's `npm install` never executes any of this
  repository's code, and static supply-chain analysers (Socket's `installScripts` alert, etc.)
  have nothing to flag. The one-command cost after `npm install` in a fresh clone is the price;
  CONTRIBUTING documents it. No new dependency; the hook scripts are committed, POSIX `sh`, and
  run on macOS, Linux, and Git-for-Windows alike. `install-hooks.mjs` still no-ops when `CI` is
  set (so release-please-action's own commits in CI are never intercepted), no-ops outside a git
  checkout, and never overwrites a `core.hooksPath` a contributor set themselves.
- **The hooks are advisory.** `git commit --no-verify` / `git push --no-verify` bypass them by
  design, for genuine work-in-progress checkpoints. CI remains the authoritative gate — the PR
  template already states that "`npm run contract` passing is necessary but not sufficient."
- **`api-contract` / `adr-governance` are not enforced at pre-commit.** They derive their
  evidence from `origin/main..HEAD` — committed history, which at pre-commit time is one commit
  behind the change being made. They run in the full pre-push suite and in CI. (The `commit-msg`
  hook does check the message being written, which is a message file, not history.)

## Consequences

- The contributor workflow loses a step: `npx changeset` is gone. Write a Conventional Commit
  that describes the user-visible impact; that is the changelog entry and the version signal.
- `api-contract` will now **block** a PR whose commits under-declare a typed API change, with a
  message naming the change and the required `feat!:` / `BREAKING CHANGE:`. It still cannot
  catch a behavioral breaking change with an unchanged type signature — that remains a
  human-review concern, the same blind spot it always had.
- **Required GitHub repo settings** (not enforceable from inside the repo, so recorded here):
  in Settings → Pull Requests, disable "Allow squash merging"; keep merge commits and/or
  rebase merging. Branch protection should require the `contract` and `pr-title` checks.
- **One-time bootstrap** (maintainer, before the first release-please run):
  `git tag v0.1.0 <main HEAD> && git push origin v0.1.0`. Without a `v0.1.0` tag matching the
  manifest, release-please synthesizes the first changelog from the root commit.
- `@changesets/cli`, `.changeset/`, the `changeset-docs` check, `scripts/changeset-file-locator.ts`,
  `scripts/helpers.ts`, `scripts/contracts.ts`, and `scripts/changelog/` are all deleted.
- `commitlint` is now the one self-hosting check that reads git history for _format_ rather
  than _content_ — deliberate, and the thing the earlier documentation-discipline ADR was
  written to avoid. The trade the project is making: one enforced commit convention buys away
  one authoring step and makes the SemVer floor a real gate.
- A fresh clone runs `npm install` then `npm run setup`; `setup` writes two local git config
  values (`core.hooksPath`, `commit.template`). Both are documented in CONTRIBUTING, honor a
  value a contributor set themselves, and are reversible with `git config --unset <key>`.
- The published tarball's `package.json` has **no** `prepare` (or any other install-lifecycle)
  script. `.github/workflows/release.yml`'s `publish` job therefore builds `dist/` with an
  explicit `npm run build` step rather than relying on `npm ci` firing `prepare`.
- Every commit now runs ~15–20 s of checks; every push now runs the full ~5–6 min suite.
  `--no-verify` is the escape hatch for a deliberate WIP commit or a push to a draft PR; that is
  expected, not a workaround.
- Partial staging (`git add -p`) plus an auto-fix to that same file: the hook re-stages the
  whole file, pulling in the hunks that were left unstaged. This is rare and is noted here so it
  is not a surprise.
- The pre-commit subset is a second, smaller definition of "good enough" alongside the full
  contract. It is deliberately a strict subset of the same checks (never a reimplementation),
  and pre-push plus CI always run the complete suite, so the smaller list can only ever be
  _faster to fail_, never _more permissive at the gate that matters_.

## Alternatives considered

- **Keeping Changesets.** Rejected: the `npx changeset` step is exactly the friction this
  change removes.
- **semantic-release instead of release-please.** Rejected: it publishes on every merge to
  `main` in a single job with credentials in scope, against SECURITY.md's deliberate
  credential-free-verify-first split. release-please's Release PR also keeps a human approval
  gate on the version bump.
- **Keeping `api-contract` advisory.** Rejected: the entire point of moving to commit-based
  versioning is to make the SemVer floor mechanically enforced.
- **Depending on `conventional-commits-parser` for the bump logic.** Rejected: the surface used
  is tiny and fully specified; a hand-rolled parser matches `semver.ts`'s precedent and is
  pinned against the spec by tests. The invariant "it must agree with release-please" is stated
  and tested, not delegated.
- **A seventh `### Breaking` changelog category / a bespoke Keep a Changelog generator.**
  Rejected along with the rest of the abandoned Keep-a-Changelog ADR: not worth the machinery
  when SemVer already carries the breaking signal and release-please's changelog is adequate.
- **`husky` for the git hooks.** Rejected: a new devDependency and a separate install step,
  against [ADR 0008](0008-self-hosting-tool-and-dependency-choices.md)'s "package install only"
  bar. `.githooks/` + `core.hooksPath` needs neither — `core.hooksPath` is the same mechanism
  `husky` itself uses under the hood.
- **Wiring the hooks from a `prepare` lifecycle script** (the original design). Rejected: it put
  a `prepare` entry in the _published_ `package.json`, which every supply-chain scanner reads as
  an install script (Socket scored the package down for it) even though npm no longer runs
  `prepare` for registry installs. An explicit `npm run setup` is one extra command in a fresh
  clone — a contributor-only cost — and keeps the published package free of install scripts,
  which is the stronger position under both ADR 0008's bar and SECURITY.md.
- **Stripping the dev-only scripts from the tarball at pack time** (a `prepack`/`postpack` pair,
  or a `clean-publish` tool). Rejected: it keeps a fragile mutate-then-restore step in the
  release path for no gain over simply not having the script.
- **Full `npm run contract` on pre-commit** (as literally requested at first). Rejected: ~5–6
  min per commit, network-dependent, and would push contributors to `--no-verify` as a habit —
  defeating the gate it is meant to be.
- **Full contract on pre-push only, nothing on pre-commit.** Rejected: a broken commit then
  lands in branch history and only surfaces at push time, where fixing it means an interactive
  rebase rather than just amending the commit that was blocked.
- **Enforcing `api-contract` / `adr-governance` at pre-commit.** Rejected: their
  `origin/main..HEAD` scan cannot see the not-yet-created commit, so they would need a bespoke
  commit-aware invocation while every other check stays history-based.
- **A read-only pre-commit that only _reports_ formatting/lint problems.** Rejected: `format`
  and `lint` are writer checks by design (`prettier --write`, `eslint --fix`); running them in a
  different check-only mode would duplicate their invocation contracts. Re-staging their fixes
  to already-staged files is the smaller cost.

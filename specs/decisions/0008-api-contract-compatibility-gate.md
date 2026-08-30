# 0008: Versioning, the changelog, and the ADR trail are all derived from Conventional Commits

## Status

Accepted. Supersedes the deleted ADR 0010 (changeset/ADR/PR documentation discipline) and ADR
0014 (Keep a Changelog generation). Implemented in `commitlint.config.mjs`,
`.githooks/commit-msg`, the `commitlint` self-hosting check, `release-please-config.json` /
`.release-please-manifest.json`, `.github/workflows/release.yml`, `scripts/api-contract/*.ts`
(now a **gate**), and `scripts/adr-governance/*.ts` (now scans commit messages).

## Context

Versioning used to require a step outside the normal git flow: `npx changeset` to declare the
release bump, with Changesets driving `package.json` and `CHANGELOG.md`. Contributors already
write commit messages; they should not also have to author a changeset. Three checks
(`changeset-docs`, `adr-governance`, `api-contract`) plus a custom Keep a Changelog generator
were all keyed on the single `.changeset/*.md` file.

The earlier ADR 0008 deliberately kept `api-contract` **advisory** and refused to interpret
commit messages, because under Changesets `package.json`'s version legitimately lagged the real
state of unreleased work — gating on it would have failed nearly every API-touching PR. That
reasoning does not survive the switch: once the commits themselves declare the bump, the check
can and should gate on whether they declare _enough_.

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
  deleted ADR 0010 established, repointed off the (now gone) changeset file.

- **ADR structure** — filename convention, no duplicate numbers, the five required section
  headings — is still validated mechanically as a static section of the `architecture` check.
  It evaluates the current file tree only; a numbering gap (e.g. 0010, 0014 now) is accepted by
  design.

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
  than _content_ — deliberate, and the thing ADR 0010 was written to avoid. The trade the
  project is making: one enforced commit convention buys away one authoring step and makes the
  SemVer floor a real gate.

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
  Rejected along with the rest of ADR 0014: not worth the machinery when SemVer already carries
  the breaking signal and release-please's changelog is adequate.

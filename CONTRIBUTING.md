# Contributing to repo-contract

## Development setup

```bash
git clone https://github.com/maverickcer/repo-contract.git
cd repo-contract
npm install
```

Run the full self-assurance suite before opening a pull request:

```bash
npm run verify   # alias for `npm run contract` -- every check in repo-contract.config.ts
```

See [`specs/verification-taxonomy.md`](specs/verification-taxonomy.md) for what each check
establishes. Individual steps: `npm run typecheck`, `npm run lint`, `npm run format`, `npm run
build`, `npm run size`, `npm run schema`.

Two checks worth knowing about before you start:

- **`api-contract`** derives the required SemVer bump from your public API changes and updates a
  `.changeset/*.md` section describing it (see
  [ADR 0008](specs/decisions/0008-api-contract-compatibility-gate.md)). After a release ships, run
  `npm run contract:baseline` and commit the result — the only way the baseline is ever updated.
- **`changeset-docs`** fails until every file your PR changes has a real description in that same
  changeset file — replace each `_(needs description)_` placeholder (see
  [ADR 0010](specs/decisions/0010-changeset-adr-and-pr-documentation-discipline.md)).

**Node.js note**: two different floors, proven independently.

- **The published package** supports Node `>=20` (`engines.node`). CI's `published-floor` job
  installs the packed tarball into a throwaway project and exercises both entry points on Node
  20 and 22 — with none of the repo's dev dependencies installed — so this stays honest no
  matter what the toolchain does.
- **The repository's own verification toolchain** (`npm run contract`, `lint`, `schema`,
  mutation testing, …) needs Node `>=24` to run: several dev dependencies
  (`ts-json-schema-generator`, `watskeburt` via `dependency-cruiser`, `@stryker-mutator`'s
  Babel 8) have moved past Node 20/22. Use Node 24 locally. CI's `verify`, `contract`, and
  `runtime-compat` jobs all run on Node 24.

## Making a change

1. Branch from `main`.
2. Make your change. Touching `src/execution/` or `src/policy/`? Add or reference an ADR in your
   changeset — enforced by the `adr-governance` check.
3. Add or update tests, preferring real behavior over mocking (see
   `test/unit/execution/spawn-check.test.ts` for the house style). `npm run test:coverage` must
   not drop below the thresholds in `scripts/coverage-thresholds.mjs`.
4. Run `npx changeset` and describe your change from the consumer's perspective. Pick
   `patch`/`minor`/`major` per [`VERSIONING.md`](VERSIONING.md).
5. Open a pull request. CI runs the same checks across Linux, macOS, Windows, and a Node version
   matrix. The PR template's Code Owner checklist covers what CI can't — see
   [`CODE_REVIEW.md`](CODE_REVIEW.md) for what each item means and why it exists.

## Adding an Architecture Decision Record (ADR)

`specs/decisions/` records _why_ the project is shaped the way it is — `specs/architecture.md` is
the current-state summary. Add an ADR when a change introduces a new constraint a consumer could
rely on, closes off an alternative a future contributor might otherwise reintroduce, or changes
what the package is responsible for. A one-line fix or refactor with no observable behavior change
doesn't need one.

**Numbering**: the next unused integer — check `specs/decisions/` for the current highest, and
never reuse one even if no file exists for it (a number can be reserved, then abandoned).

**Structure**:

```markdown
# NNNN: <short, decision-stated-as-a-sentence title>

## Status

Accepted. Implemented in `path/to/file.ts`.

## Context

What problem existed and what would happen absent this decision.

## Decision

What was decided, concretely enough that a future reader could verify the codebase still matches it.

## Consequences

What this makes possible, what it forecloses, and any non-obvious tradeoff worth knowing before
"fixing" what looks like a limitation.

## Alternatives considered

Each rejected alternative, and the specific reason it was rejected.
```

## Release process (maintainers)

Releases are automated via [Changesets](https://github.com/changesets/changesets) and npm's OIDC
trusted publishing (`.github/workflows/release.yml`) — no `NPM_TOKEN` secret exists in this
repository. Every merged PR with a pending changeset causes the workflow to open/update a
"Version Packages" PR; merging that PR runs `npm run verify` and publishes.

**One-time setup**, before the first release (requires npm account access, not doable from a PR):
on [npmjs.com](https://www.npmjs.com), add a trusted publisher for
`repo-contract` — organization/user `maverickcer`, repository `repo-contract`,
workflow filename `release.yml` exactly. No token to copy anywhere; the workflow's
`id-token: write` permission plus this registration is the entire trust relationship.

## Versioning and stability

See [`VERSIONING.md`](VERSIONING.md) for what's Stable, Experimental, or a Private implementation
detail that can change without notice. When in doubt whether your change is breaking, ask in the
pull request rather than guessing at the changeset bump type.

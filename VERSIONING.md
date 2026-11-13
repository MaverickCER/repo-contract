# Versioning and API stability

`repo-contract` follows [Semantic Versioning](https://semver.org/). This document defines which
surface that promise covers, since "semver" alone doesn't say. Three tiers exist, following the
same policy `@maverickcer/env-cap` and `data-cap` established.

## Stable

Covered by semver. A breaking change to any of the following requires a major version bump once
the package reaches 1.0 (see [Pre-1.0 status](#pre-10-status) below):

- **`defineRepoContract`** and **`runRepoContract`**: their signatures, and the promise that
  neither calls `process.exit()`.
- **`renderMarkdownSummary`** and **`serializeRun`**: pure functions over a run's result.
  - The Markdown they render is for people and may be reworded in a minor release.
  - The JSON `serializeRun` returns is exactly the `Evidence`/`Verdict` documents described below.
- **The `Evidence`/`CheckEvidence`/`Verdict` type shapes** and the invariants documented for them:
  - For a full run (`options.checks` omitted), every configured check appears exactly once in
    `evidence.checks`/`verdict.checks`. A policy is invoked for every check regardless of
    execution outcome.
  - Execution and policy evaluation are strictly phased: no policy runs until every check's
    evidence is assembled.
  - When `options.checks` selects a subset, only the checks actually resolved to run appear in
    `evidence.checks`/`verdict.checks`. Those are the requested ids plus their transitive
    `dependsOn`. Every other configured id is absent, not present with some placeholder
    "not run" state.
  - `Evidence`/`Verdict`'s declared TypeScript shape is a total mapping over the _configured_
    checks either way. After a partial run, a consumer indexing into
    `evidence.checks`/`verdict.checks` must account for a key being absent at runtime. The type
    alone suggests otherwise.
- **The exported error classes** (`RepoContractError`, `InvalidRepoContractConfigError`,
  `InvalidCheckConfigError`, `DependencyDeclaredLaterError`, `UnknownCheckIdError`,
  `StandardSchemaValidateThrewError`, `PolicyThrewError`, `PolicyReadUnrequestedOutputError`,
  `PolicyReadFailedParseValueError`) and their `code`/`checkId`/`cause`/`dependencyId` fields.
  This includes `StandardSchemaValidateThrewError`'s own additional `checkId` field and native
  `cause` chain. That error means a supplied `output.schema`'s own `~standard.validate()` threw
  or rejected. It is distinct from an ordinary parse/validation failure (see that error class's
  own doc comment).
- **The `run` string tokenization contract**:
  - which characters are rejected as shell operators;
  - which are deliberately allowed through (glob characters, a bare `$`);
  - that no shell is ever invoked without `shell: true`.
- **`repo-contract/helpers`** (the whole subpath): the exception-registry and exception-policy
  primitives. These are `loadExceptionRegistry`, `reconcileExceptions`, `writeExceptionRegistry`,
  `evaluateExceptionRecord`, `hashRequirementFields`, `validateExceptionPolicyConfig`, the
  exception record types and the v2 record fields.
  - [ADR 0019](specs/decisions/0019-helpers-promoted-presets-stay-experimental.md) promoted them
    from Experimental after a real feedback cycle. `internal-package-contract` builds its whole
    exceptions system on them and needed additive changes only.
  - A new export is a minor from `1.0` on. While the package is `0.x`, the release tooling
    deflates it to a patch (see [Pre-1.0 status](#pre-10-status)).
  - A changed signature or behavior is a breaking change.
- **`./schema`**: the published JSON Schema files' own `$id`s and top-level `$ref` targets. See
  [Evidence and Verdict schema versioning](#evidence-and-verdict-schema-versioning) below for how
  the schemas _themselves_ version independently of this package's own semver.

## Experimental

**`repo-contract/presets`** (the whole subpath, including every preset it exports) is an
Experimental library surface, along with `./affected` and `./metrics` below.

- Consumers that cannot tolerate a changed preset pin a tilde range: `internal-package-contract`
  uses `~0.12.0`.
- It is a new pre-1.0 surface shipped before a real feedback cycle, per this section's own stated
  convention (see
  [ADR 0004](specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md)).
- An Experimental surface may change shape, including in a breaking way, in a minor or patch
  release without that being a semver violation. This applies to a preset's TypeScript signature
  and to its runtime behavior:

A preset's execution semantics or policy interpretation are part of its public contract even when
its TypeScript signature is unchanged. Classify a change to an existing preset accordingly, whether
or not it would be a semver violation while Experimental:

- a new preset → minor;
- a new configurable option → minor;
- a changed default behavior (e.g. a different default scanned path, a different default
  severity threshold) → potentially major;
- a changed policy interpretation (e.g. a finding that used to fail now warns) → potentially
  major;
- a bug fix that restores documented behavior → patch or minor depending on impact.

**`repo-contract/affected`** (the whole subpath) and the `affected`, `cache`, `doctor` and
`merge-mutation` commands (0.12.0) cover scope resolution, the affected-test analysis, the result
cache and the shard tools.

- They need a TypeScript with a compiler API, for their types as well as their runtime.
  [GUIDE.md's runtime support](GUIDE.md#runtime-support) lists the versions.
- They are Experimental because real use will reshape how a run is narrowed. A change can land in
  a minor or patch release while `0.x`.
- Promotion to Stable follows the same rule as presets: a real feedback cycle with no breaking
  change needed.

**`repo-contract/metrics`** (the whole subpath) and the `metrics` command (0.12.0): run records,
their log format, `summarizeRuns`, `pillarCoverage`, `maturityLevel` and the evidence manifest.
Experimental for the same reason, with the same promotion rule.

The CLI that scaffolds a contract, `bin/repo-contract.mjs`, is classified Experimental in its own
right below.

**`bin/repo-contract.mjs`** (the `repo-contract init` command) is a further Experimental surface.
It was added per
[ADR 0004](specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md)'s
2026-09-09 amendment.

- Its detection table (which preset maps to which npm dependency) and its generated file content
  may both change in a minor or patch release.
- **Experimental here is a version-stability classification, not a caution against using it**.
  The files `init` writes are ordinary, fully-yours source the moment they land, no different from
  writing them by hand. What may change between releases is what `init` writes next time you run
  it, not what it already wrote.
- The `PresetName` union and `detectPresets`/`buildConfigTemplate`/`patchContractScript` are all
  internal to `bin/` and never imported by a consumer. They follow the same "new preset → minor;
  changed default → potentially major" framing as `repo-contract/presets` above.

## Private

Never covered by semver, may change at any time without notice:

- Everything under `src/execution/`, `src/parsing/`, `src/policy/`, and `src/config/`'s
  lower-level pieces (`tokenizeRunString`, `validateRepoContractConfig`, `spawnCheck`,
  `killTree`, `composeSignals`, `runWithConcurrency`, `runWithConcurrencyGraph`, `buildEvidence`,
  `runPolicies`, and their supporting types). None of these are re-exported from the package root
  (`src/index.ts`'s curated barrel). Their internal shape may change at any time as long as the
  Stable-tier promises above continue to hold.
- The exact process-tree cleanup mechanism (POSIX process groups vs. Windows `taskkill`). The
  _behavioral guarantee_ ("a check's entire process tree is terminated on timeout/abort/signal")
  is Stable; the implementation technique is not.
- The exact CRAP/mutation/security-scanning tool selection in this repository's own
  `repo-contract.config.ts`. This is the package's own internal self-assurance configuration, not
  part of the product it ships. It may change tools or thresholds at any time (see
  `specs/decisions/` for the reasoning behind the current selection).
- Any behavior not documented in the README, a JSDoc comment on a public export, or an ADR.

## Evidence and Verdict schema versioning

`Evidence` and `Verdict` are each independently versioned via their own `version` field. Each
version is separate from this package's own semver and from the other schema's version.

- `Evidence.version` is currently `1`.
- `Verdict.version` is currently `2`. It bumped from `1` when `checks[id]` changed from
  `{ passed, reason? }` to a structured `PolicyResult` (see
  [ADR 0001](specs/decisions/0001-execution-and-policy-are-a-strict-sequential-contract.md)).

This matters once repo-contract's output is used as a CI-interoperability artifact. Its consumer
(a dashboard, a stored baseline, a separate tool) may outlive the package version that produced it:

- **A field added to, removed from or changed on `Evidence` or `Verdict` itself** requires
  bumping that schema's own `version` number. This repository's `api-contract` check enforces
  this. Its schema-version pass fails when a direct member of an exported interface with a literal
  `version` member is added, removed or changed while that literal stays the same.
- **A field added to a nested type** (`CheckEvidence` under `evidence.checks[id]`, `PolicyResult`
  under `verdict.checks[id]`) is a compatible change within the same `version` number. A consumer
  reading `evidence.checks[id].newField` should already expect it to be `undefined` on evidence
  from an older `repo-contract` version.
- **Changing or removing a nested field**, or changing what any field's value can mean, also
  requires bumping that schema's `version`. No gate enforces this part. The schema-version pass
  compares direct members only, and `checks` keeps the same type text when `CheckEvidence` or
  `PolicyResult` changes. Review is the control. The `api-contract` and `surface-contract`
  checks still require a changeset at the right package level for the type and schema diff.
- Each schema's `version` bump is independent of the other schema's. It is also independent of
  whether the change coincides with a `repo-contract` major version bump.
- The published `./schema` JSON Schema files (`schemas/evidence.schema.json`,
  `schemas/verdict.schema.json`) are generated directly from `src/types.ts`'s `Evidence`/
  `Verdict` interfaces (see `scripts/generate-json-schema.mjs`). They cannot drift from the
  TypeScript types they describe.

## Pre-1.0 status

`repo-contract` has not yet reached a `1.0` release. Per common pre-1.0 SemVer convention,
**minor versions may include breaking changes to the Stable tier before 1.0**. This document
defines _scope_ (what would eventually be covered), not a promise that it is already fully
locked in at `0.x`.

How a `0.x` bump is chosen is **this repository's release tooling, not [Changesets](https://github.com/changesets/changesets)**.
Changesets applies exactly the bump a changeset declares: a `major` changeset on `0.8.8` produces
`1.0.0`. The shared release workflow from `internal-package-contract` deflates one level while the
package is `0.x`:

- a `feat!:` / `BREAKING CHANGE:` commit generates a `minor` changeset;
- a `feat:` generates a `patch`;
- the API-contract gate requires only a `minor` for a breaking API diff.

So **no commit and no API diff can publish `1.0.0` by itself**. Crossing to `1.0.0` takes a
human-authored `major` changeset, and a person reads and merges that version pull request, as for
every release.

### What `1.0.0` will promise

At the `1.0.0` cut the Stable tier above is locked in. That includes `repo-contract/helpers`, which is
already Stable today, so `1.0.0` keeps its existing promise rather than promoting it. The other
surface that `internal-package-contract` is built on, `repo-contract/presets`, is promoted from
Experimental at that cut. That way `1.x` does not promise less than the ecosystem needs:

- **`repo-contract/helpers`** (already Stable): the exception-registry primitives
  (`loadExceptionRegistry`, `reconcileExceptions`, `writeExceptionRegistry`,
  `evaluateExceptionRecord`, `hashRequirementFields`, `validateExceptionPolicyConfig`,
  `resolveExceptionPolicy`) and the types they take and return.
- **`repo-contract/presets`**: the presets `internal-package-contract` composes, with their `run`
  commands and policy interpretation.

Until then, `internal-package-contract` depends on `repo-contract` with a **tilde range** (`~0.x.y`).
It therefore receives patch releases only and takes each `0.x` minor deliberately (see
[ADR 0018](specs/decisions/0018-ecosystem-bootstrap-cycle-and-package-names.md)). The Experimental and
Private tiers behave the same before and after 1.0. Experimental surfaces may change at any version;
Private internals always may.

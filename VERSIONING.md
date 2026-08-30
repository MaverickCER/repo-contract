# Versioning and API stability

`repo-contract` follows [Semantic Versioning](https://semver.org/). This document defines what
that promise actually covers, since "semver" alone doesn't say which surface it applies to.
Three tiers exist, following the same policy `@maverickcer/env-cap` and `@maverickcer/data-cap`
established.

## Stable

Covered by semver. A breaking change to any of the following requires a major version bump (once
the package reaches 1.0 — see [Pre-1.0 status](#pre-10-status) below):

- **`defineRepoContract`** and **`runRepoContract`** — their signatures, and the guarantee that
  neither calls `process.exit()`.
- **The `Evidence`/`CheckEvidence`/`Verdict` type shapes** and the invariants documented for
  them: for a full run — `options.checks` omitted — every configured check appears exactly once
  in `evidence.checks`/`verdict.checks`, and a policy is invoked for every check regardless of
  execution outcome; execution and policy evaluation are strictly phased (no policy runs until
  every check's evidence is assembled). When `options.checks` selects a subset, only the checks
  actually resolved to run (the requested ids plus their transitive `dependsOn`) appear in
  `evidence.checks`/`verdict.checks` — every other configured id is simply absent, not present
  with some placeholder "not run" state. `Evidence`/`Verdict`'s declared TypeScript shape is a
  total mapping over the _configured_ checks either way; a consumer indexing into
  `evidence.checks`/`verdict.checks` after a partial run must account for a key being absent at
  runtime despite what the type alone suggests.
- **The exported error classes** (`RepoContractError`, `InvalidRepoContractConfigError`,
  `InvalidCheckConfigError`, `DependencyDeclaredLaterError`, `UnknownCheckIdError`,
  `ParserDependencyMissingError`, `PolicyThrewError`, `PolicyReadUnrequestedOutputError`,
  `PolicyReadFailedParseValueError`) and their `code`/`checkId`/`cause`/`dependencyId` fields,
  plus `ParserDependencyMissingError`'s own additional `format` field (which optional output
  format was requested but missing its peer dependency).
- **The `run` string tokenization contract**: which characters are rejected as shell operators,
  which are deliberately allowed through (glob characters, a bare `$`), and that no shell is
  ever invoked without `shell: true`.
- **`./schema`**: the published JSON Schema files' own `$id`s and top-level `$ref` targets — see
  [Evidence and Verdict schema versioning](#evidence-and-verdict-schema-versioning) below for how
  the schemas _themselves_ version independently of this package's own semver.

## Experimental

**`repo-contract/presets`** (the whole subpath, including every preset it exports) —
a new pre-1.0 surface shipped before a real feedback cycle, per this section's own stated
convention (see [ADR 0004](specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md)). An Experimental
surface may change shape, including in a breaking way, in a minor or patch release without that
being a semver violation — this applies to a preset's TypeScript signature and to its runtime
behavior:

> A preset's execution semantics or policy interpretation are part of its public contract even
> when its TypeScript signature is unchanged. Classify a change to an existing preset
> accordingly, whether or not it would be a semver violation while Experimental: a new preset →
> minor; a new configurable option → minor; a changed default behavior (e.g. a different default
> scanned path, a different default severity threshold) → potentially major; a changed policy
> interpretation (e.g. a finding that used to fail now warns) → potentially major; a bug fix that
> restores documented behavior → patch or minor depending on impact.

Also unstable at v0.1.0, per the same "not yet been through a real feedback cycle" framing as the
README's and the original design notes' explicit "not yet" language for a future CLI: none
shipped yet.

## Private

Never covered by semver, may change at any time without notice:

- Everything under `src/execution/`, `src/parsing/`, `src/policy/`, and `src/config/`'s
  lower-level pieces (`tokenizeRunString`, `validateRepoContractConfig`, `spawnCheck`,
  `killTree`, `composeSignals`, `runWithConcurrency`, `runWithConcurrencyGraph`, `buildEvidence`,
  `runPolicies`, and their
  supporting types) — none of these are re-exported from the package root (`src/index.ts`'s
  curated barrel), and their internal shape may change at any time as long as the Stable-tier
  guarantees above continue to hold.
- The exact process-tree cleanup mechanism (POSIX process groups vs. Windows `taskkill`) — the
  _behavioral guarantee_ ("a check's entire process tree is terminated on timeout/abort/signal")
  is Stable; the implementation technique is not.
- The exact CRAP/mutation/security-scanning tool selection in this repository's own
  `repo-contract.config.ts` — this is the package's own internal self-assurance configuration,
  not part of the product it ships, and may change tools or thresholds at any time (see
  `specs/decisions/` for the reasoning behind the current selection).
- Any behavior not documented in the README, a JSDoc comment on a public export, or an ADR.

## Evidence and Verdict schema versioning

`Evidence` and `Verdict` are each independently versioned via their own `version` field
(`Evidence.version` is currently `1`; `Verdict.version` is currently `2`, having bumped from `1`
when `checks[id]` changed from `{ passed, reason? }` to a structured `PolicyResult` — see
[ADR 0001](specs/decisions/0001-execution-and-policy-are-a-strict-sequential-contract.md)), separate from this package's own
semver and from each other. This matters once repo-contract's output is used as a
CI-interoperability artifact whose consumer (a dashboard, a stored baseline, a separate tool) may
outlive the package version that produced it:

- **Additive fields** to either schema are a compatible change within the same `version` number
  — a consumer reading `evidence.checks[id].newField` should already be prepared for it to be
  `undefined` on evidence produced by an older `repo-contract` version, the same way any
  forward-compatible JSON consumer would be.
- **Changing or removing an existing field**, or changing what an existing field's value can
  mean, requires bumping that schema's own `version` number — independently of the other schema,
  and independently of whether the change happens to coincide with a `repo-contract` major
  version bump.
- The published `./schema` JSON Schema files (`schemas/evidence.schema.json`,
  `schemas/verdict.schema.json`) are generated directly from `src/types.ts`'s `Evidence`/
  `Verdict` interfaces (see `scripts/generate-json-schema.mjs`) — they cannot drift from the
  TypeScript types they describe.

## Pre-1.0 status

`repo-contract` has not yet reached a `1.0` release. Per common pre-1.0 SemVer convention,
**minor versions may include breaking changes to the Stable tier before 1.0** — this document
defines _scope_ (what would eventually be covered), not a promise that it is already fully
locked in at `0.x`. Concretely, release-please is configured (`bump-minor-pre-major`) so that a
`feat!:` / `BREAKING CHANGE:` commit bumps the minor version, and a `feat:` commit bumps the
patch version, while the package is `0.x`. The Experimental and Private tiers behave the same
before and after 1.0: Experimental surfaces may change at any version; Private internals always
may.

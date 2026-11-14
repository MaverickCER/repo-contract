# Verification taxonomy

This document is the canonical reference for every verification category this repository runs. It
covers what the repository verifies, how, and why each category is distinct.
README/CONTRIBUTING/`specs/architecture.md` refer to it. Its companions are `specs/architecture.md`
(how the package itself is built) and `specs/decisions/` (the reasoning trail for load-bearing
constraints).

## Purpose: a self-governing reference implementation

This repository is intentionally a **reference implementation of repo-contract's own intended
usage**. Through the package's own operation, it shows how independent, industry-standard
verification systems connect to repo-contract's `execution → evidence → policy → verdict` pipeline.
Examples include Vitest, fast-check, dependency-cruiser, Stryker, API Extractor, npm audit, and
secretlint. repo-contract does not own, replace, or abstract any of them:

```text
external verifier → machine-readable result → repo-contract evidence → policy → verdict
```

Every tool used here is a demonstration of that integration pattern, never a prescription. A
consumer can replace Vitest with Jest, fast-check with another property-testing library, or
dependency-cruiser with another architecture analyzer. The pattern still holds: nothing here
requires repo-contract itself to know anything about any of these tools.

Avoid special-case APIs or primitives introduced solely to make this repository's own
self-governance easier. Suppose this repository repeatedly needs a capability the public
`repo-contract` API can't naturally express. That is a signal the API itself may need to mature, not
something to silently work around here.

**Automated verification does not replace human review.** Every check and policy below establishes
machine-checkable properties. None of them determine whether a change is appropriate or whether
requirements were correctly understood. Nor do they determine whether product, operational,
architectural, legal, security, or maintenance considerations have been adequately addressed. Human
review remains required wherever this repository's review policy requires it.

## Taxonomy admission rule (category-proliferation guardrail)

A verification category earns independent status when it asks a **materially different semantic
question and produces independently meaningful evidence**. Using a different tool, config file,
directory, or coverage environment does not earn it. A distinct execution boundary or tool is
required only when it materially contributes to that distinction. Unit and Integration both
legitimately use Vitest; Property-based and model-based testing both legitimately use Vitest +
fast-check.

Do not create a new top-level verification category merely because a different tool, config file,
test directory, or coverage environment exists. Prefer a new case, sub-methodology, or evidence
field inside an existing category when the underlying semantic question is unchanged. This rule is
what rejected 14 of the 17 candidate categories evaluated below (see "Rejected categories").

Two further terminology notes keep the concepts in this document from collapsing into one another:

- **"test:" is a command namespace, not a claim.** `test:architecture` runs dependency-cruiser, not
  Vitest, and isn't "a test" in the traditional sense. The prefix signals "an independently runnable
  verification level." `npm run test` (the aggregate) therefore covers only the four Vitest-based
  categories (unit/integration/property/e2e). `test:architecture` is invoked separately.
- **`npm run test:watch`** is an explicitly aggregate developer-convenience command, not a
  verification category of its own. It watches unit+integration+property together (see "Execution
  layers" below).

## Verification category vs. execution environment vs. test runner vs. evidence vs. policy

These are five different concepts, deliberately kept distinct throughout this repository:

| Concept               | Example                                 | Answers                                                       |
| --------------------- | --------------------------------------- | ------------------------------------------------------------- |
| Verification category | Unit testing                            | What semantic question is being asked?                        |
| Execution environment | Node 24.x on `ubuntu-latest` in CI      | Where/under what conditions does it run?                      |
| Test runner / tool    | Vitest, fast-check, dependency-cruiser  | What executes the check and produces raw output?              |
| Evidence              | `CheckEvidence`, `ArchitectureEvidence` | What happened, captured as structured, machine-readable fact? |
| Policy                | `evaluateArchitecturePolicy`            | Does the repository consider that evidence acceptable?        |

Unit and Integration share a test runner (Vitest) without being the same category. The OS/Node
version matrix in CI is an execution-_environment_ axis applied across categories, not a category of
its own. See "Compatibility/interoperability testing" under "Rejected categories". Coverage is a
_measurement_, derived from evidence several categories independently produce. It is not a category
that executes anything itself.

## Verification matrix

The table shows the three newly-accepted categories alongside the existing categories most relevant
to source/coverage. Mutation and API compatibility are unchanged by this taxonomy expansion. They
are included so the full picture is visible in one table rather than split across documents.

The remaining existing categories are preserved unchanged and not repeated here. They are Syntax,
Static analysis, Formatting, Dependency analysis, Accessibility, Performance tests, Golden/snapshot
contracts, Git/repository guardrails, and Release checks. See the repo-contract checks list in
`repo-contract.config.ts` for those.

| Verification                 | Semantic question                                                                                           | Tool                                                                   | Execution boundary                                                                                                                                | Coverage                                                     | Evidence                               | repo-contract check      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------- | ------------------------ |
| Unit                         | Does isolated behavior satisfy its examples/contracts?                                                      | Vitest                                                                 | `test/unit/**`                                                                                                                                    | Yes                                                          | JSON (Vitest `--reporter=json`)        | `test-unit`              |
| Integration                  | Do internal components compose correctly?                                                                   | Vitest                                                                 | `test/integration/**`                                                                                                                             | Yes                                                          | JSON (Vitest `--reporter=json`)        | `test-integration`       |
| Property (incl. model-based) | Do generalized invariants hold over generated inputs?                                                       | Vitest + fast-check                                                    | `test/property/**`                                                                                                                                | Yes                                                          | JSON (Vitest `--reporter=json`)        | `test-property`          |
| E2E / package-acceptance     | Does the built package work as a consumer would use it?                                                     | Vitest + real subprocesses, against `dist/`                            | `test/e2e/**`                                                                                                                                     | No                                                           | JSON (Vitest `--reporter=json`)        | `test-e2e`               |
| Architecture                 | Does the production dependency graph obey architectural constraints?                                        | dependency-cruiser                                                     | `src/**/*.ts` module graph (+ each Vitest config's own boundary)                                                                                  | No                                                           | JSON (`ArchitectureEvidence`)          | `architecture`           |
| Coverage                     | What proportion of the canonical source surface is exercised by the contributing test categories, in union? | istanbul-lib-coverage (merge) + `@vitest/coverage-v8`                  | aggregate (reads only prior categories' artifacts)                                                                                                | N/A: this _is_ the measurement                               | JSON (`coverage-summary.json` total)   | `coverage`               |
| Mutation                     | Do tests detect injected behavioral changes?                                                                | Stryker (running the fast Vitest suite per mutant)                     | `src/**/*.ts` mutated, `vitest.config.ts`'s dev-aggregate suite as the oracle                                                                     | No. A separate quality signal, not ordinary runtime coverage | JSON (Stryker's `json` reporter)       | `mutation`               |
| API compatibility            | Do the branch's changesets declare a SemVer bump ≥ what the public-API change requires?                     | `internal-package-contract/checks/api-contract` (API Extractor-backed) | each entry point's own API surface (`src/index.ts`/`presets`/`helpers` vs. its own committed baseline), and this branch's `.changeset/*.md` files | No                                                           | JSON (`ApiContractEvidence`)           | `api-contract`           |
| Commit-message format        | Is every commit on the branch a valid Conventional Commit?                                                  | commitlint + `@commitlint/config-conventional`                         | `origin/main..HEAD`                                                                                                                               | No                                                           | exit code                              | `commitlint`             |
| Suppression governance       | Is every static-analysis suppression directive centrally inventoried and justified against policy?          | TypeScript compiler scanner + `scripts/suppression-governance/`        | governed source files (`find-source-files.ts`)                                                                                                    | No                                                           | JSON (`SuppressionGovernanceEvidence`) | `suppression-governance` |
| Security (no network)        | Does the shipped surface (src/**) avoid network-capable imports, globals, and unreviewed spawned commands?  | TypeScript compiler scanner + `scripts/security-network/`              | `src/**/*.ts`                                                                                                                                     | No                                                           | JSON (`NetworkScanEvidence`)           | `security-network`       |
| GitHub Actions               | Are this repository's own workflow files free of correctness and script-injection defects?                  | actionlint (via the `github-actionlint` npm wrapper)                   | `.github/workflows/*.{yml,yaml}`                                                                                                                  | No                                                           | JSON (`GitHubActionsEvidence`)         | `github-actions`         |
| Security (supply-chain)      | Does any installed dependency trip a Socket.dev supply-chain alert above a medium rating, unwaived?         | `@socketsecurity/cli` + `scripts/security-socket/`                     | the installed dependency tree (`socket ci`)                                                                                                       | No                                                           | JSON (`SecuritySocketEvidence`)        | `security-socket`        |
| AI-assisted review           | Has a CodeRabbit `review --agent` pass run locally on the working tree, or is its non-execution recorded?   | CodeRabbit CLI (`--agent` event stream) + `scripts/coderabbitai/`      | uncommitted, tracked edits (`coderabbit review --agent --uncommitted`)                                                                            | No                                                           | JSON (`CoderabbitEvidence`)            | `coderabbitai`           |
| Dead-code detection          | Does knip report an unused dependency/export/file with no reviewed record justifying it?                    | knip + `scripts/dead-code/`                                            | this repository's own full project graph (`knip --reporter json`, no config-time exemptions)                                                      | No                                                           | JSON (`DeadCodeEvidence`)              | `dead-code`              |

Rows with their own `###` section below are detailed there, including the exact command to run each
alone (`npm run test:unit`, etc.; see "Execution layers"). Mutation, Coverage, and API compatibility
have no separate `###` section. For them, the table row plus the check's own source (`checks/*.ts`,
`scripts/*/`) and its ADR are the description. Coverage's aggregation mechanism is documented under
"Coverage architecture" below. API compatibility's commit-based gate is
[ADR 0009](decisions/0009-conventional-commits-versioning-and-local-gates.md).

`security-socket` and `coderabbitai` were added after this taxonomy's original expansion. They came
in the same release that introduced the `repo-contract/helpers` exception-policy primitive
([ADR 0013](decisions/0013-reusable-exception-policy-helper.md)). Both clear the admission rule
above on the "materially different semantic question" test:

- `security-socket` asks a _behavioral_ supply-chain question that `security-deps`'s known-CVE
  advisories and `security-secrets`'s committed-secret scan do not. An example is a dependency that
  newly gains install scripts, shell/network/filesystem access, or obfuscated code.
- `coderabbitai` is the one check whose finding source is an LLM opinion rather than a reproducible
  tool result. So what it establishes is its own _presence and self-reporting_, not its pass/fail
  outcome ([ADR 0014](decisions/0014-coderabbit-as-a-surfaced-check.md)).

All six exception-policy-backed checks share the same reviewed-waiver machinery: `security-socket`,
`coderabbitai`, `security-network`, `preset-commands`, `suppression-governance`, `dead-code`. See
"Reviewed exceptions" at the end of this section.

### Unit: `test-unit`

- **Establishes**: that an individual module's behavior matches its documented examples/contracts,
  in isolation. This repository's house style prefers real behavior over mocking: real subprocesses,
  real timers, real signals (see `test/unit/execution/spawn-check.test.ts`). So "isolated" means
  "one module under test," not "every dependency replaced with a test double."
- **Does not establish**: that modules compose correctly together (Integration) or that generalized
  invariants hold across an input space (Property). Nor does it establish that the built package
  works for a real consumer (E2E).
- **Files executed**: `test/unit/**/*.test.ts`, exercising `src/**` and `scripts/**`.
- **Run alone**: `npm run test:unit`.
- **Coverage**: yes, `coverage/unit/coverage-final.json`.
- **Evidence**: Vitest's own JSON reporter, parsed by `evaluateVitestJsonPolicy` in
  `src/presets/shared/vitest-json-policy.ts`.
- **Policy**: the `test-unit` check's own policy fails on any failing test or unparseable Vitest
  output, and passes otherwise. The two failure kinds are distinguished from each other, never
  conflated (see "Infrastructure vs. substantive failure" below).
- **CI**: part of `npm run test:coverage`, which the `verify` job runs across the full OS × Node
  matrix.

### Integration: `test-integration`

- **Establishes**: that multiple real internal modules, composed together, behave correctly. This
  covers the full `runRepoContract` pipeline (`test/integration/run-repo-contract.test.ts`). It also
  covers this repository's own real-git-fixture suites (`test/integration/adr-governance/`: real
  git, real filesystem, all in-process). The equivalent real-git-fixture integration coverage for
  the api-contract subsystem now lives in `internal-package-contract`'s own test suite. It sits
  alongside the rest of that engine; see `repo-contract.config.ts`'s own module doc comment.
- **Does not establish**: single-module correctness in isolation. That is Unit, still the bulk of
  what would fail first if this failed too. Nor does it establish that the package works from
  _outside_ its own source tree, crossing the package boundary as a real consumer does (E2E).
- **Files executed**: `test/integration/**/*.test.ts`.
- **Run alone**: `npm run test:integration`.
- **Coverage**: yes, `coverage/integration/coverage-final.json`.
- **Evidence/Policy**: identical shape and mechanism to Unit's.
- **CI**: part of `npm run test:coverage`.

### Property-based (incl. model-based): `test-property`

- **Establishes**: that a stated invariant holds across a _generated_ input space, not only
  hand-picked examples. It covers round-trip correctness (`tokenize-command.property.test.ts`,
  `parse-output.property.test.ts`). It covers ordering/scheduling invariants
  (`dependency-scheduler.property.test.ts`, `concurrency-pool.property.test.ts`). It also includes
  one **model-based** test, `spawn-check.status.property.test.ts`.

  That test is an explicit predictive model of `CheckStatus`'s documented priority ordering. It is
  checked against the real system for every scenario in a small, curated, exhaustively-run set via
  `it.each`. It does not use `fc.constantFrom` + a matching `numRuns`, which samples independently
  with replacement. Such sampling may not draw every scenario in a given run, as this file's own doc
  comment discovered empirically.

  This section used to cite comparison-invariant property coverage (`semver.property.test.ts`, part
  of the api-contract engine). That coverage moved to `internal-package-contract`'s own property
  test suite, alongside the rest of that engine.

- **Does not establish**: a blanket claim of "no bugs" or "secure against injection". Each property
  states a precise, narrow claim. An example is "malformed/adversarial input cannot produce
  unintended argv-boundary splitting," not "the tokenizer is secure". Determinism properties are
  written only for functions whose contract explicitly promises determinism (`tokenizeRunString`).
  They are never a blanket `f(x) === f(x)` over arbitrary functions, since some evidence (e.g.
  `CheckEvidence.durationMs`) is intentionally nondeterministic.
- **Resource boundaries** (required, not optional; this governs AI-authored property tests too):
  every property test sets an explicit, bounded `numRuns`. Every property test uses size-bounded
  arbitrary generators. There are no unbounded string/graph/array generators risking pathological
  memory/time use. The one real-subprocess-racing model-based test uses a small, curated scenario
  set with generous timing gaps (≥200ms). It uses that set rather than free random generation, to
  avoid CI flakiness from real OS timing.
- **Files executed**: `test/property/**/*.test.ts`.
- **Run alone**: `npm run test:property`.
- **Coverage**: yes, `coverage/property/coverage-final.json`.
- **Evidence/Policy**: same Vitest JSON-reporter mechanism as Unit/Integration. Because fast-check
  runs inside ordinary `it()`/`test()` blocks, Vitest's own reporter already captures pass/fail and
  failure messages. That includes fast-check's own shrunk-counterexample output, so no separate
  evidence type was introduced for this.
- **CI**: part of `npm run test:coverage`.

### End-to-end / package-acceptance: `test-e2e`

- **Establishes**: that the _built, published_ package actually works for a real consumer. The test
  crosses the real package boundary via `npm pack` → `npm install` into a scratch consumer →
  `require`/`import`. It covers both supported entry points (`dist/index.js` ESM and
  `dist/index.cjs` CommonJS). It also checks that the `./schema` export resolves to real, valid JSON
  Schema files.

  This is a deliberately narrow definition: _black-box consumer/package acceptance specifically_. It
  is not a general "test that starts a subprocess" or "any workflow spanning multiple things".
  Internal multi-module composition is Integration, not E2E, even when it uses real subprocesses
  too. Unit's execution-engine tests do that constantly.

- **Does not establish**: source-level branch/statement coverage (see "Coverage contribution"
  below). Nor does it establish anything about behavior _inside_ the package's own source tree.
  Every other category already covers that, in-process, more precisely.
- **Files executed**: `test/e2e/**/*.test.ts`. Requires `dist/` to already be built (skipped with a
  clear message otherwise).
- **Run alone**: `npm run test:e2e`.
- **Coverage contribution**: **no**. E2E executes `dist/` (tsup-bundled output) inside a genuinely
  separate child-process boundary, not instrumented `src/` in-process. Collecting V8 coverage there
  would need sourcemap-based re-instrumentation of bundled output. That complexity is
  disproportionate to what this category actually proves: packaging/installability/consumption, not
  branch coverage. This is a deliberate, documented absence, not an oversight. See the Coverage
  section below for how the aggregate stays honest about it.
- **Evidence/Policy**: same Vitest JSON-reporter mechanism as the other three.
- **CI**: its own explicit step in the `verify` job (see `.github/workflows/ci.yml`). It is not
  folded into `test:coverage`, since E2E doesn't contribute to it.

### Architecture: `architecture`

- **Establishes**: two distinct, purely static facts, reported as two clearly separate evidence
  sections. They are combined into one check for practical reasons: both are cheap, static,
  no-execution checks about the shape of the repository.
  1. **`dependencyGraph`**: does the production `src/**/*.ts` module graph obey this repository's
     architectural constraints (`.dependency-cruiser.cjs`)? At minimum: no circular dependencies and
     no unresolved imports (both hard failures). `execution/` never imports `evidence/`/`policy/`,
     which protects ADR 0001's "strictly phased execution/policy" guarantee. `config/` never imports
     `execution/`/`evidence/`/`policy/`, and `src/` never imports `scripts/`.
  2. **`testCategoryBoundaries`**: does every verification category's own Vitest config
     (`vitest.unit.config.ts`, etc.) stay strictly inside its own directory? This is a permanent,
     mechanically enforced guardrail (`scripts/check-test-boundaries.mjs`). It is not a one-time
     assumption verified only at implementation time.
- **Does not establish**: per-file style/correctness (ESLint), unused exports/dependencies (knip),
  or anything about runtime behavior. dependency-cruiser never executes application code.
- **Rule quality, not only rule existence**: `test/unit/architecture/rules.test.ts` validates
  `.dependency-cruiser.cjs`'s rules against a true positive and a true negative. The true positive
  is a fixture import that _should_ be flagged; the true negative is a legitimate import that should
  _not_ be. This proves the rules correctly discriminate, not merely that they exist and run.
- **Files executed**: none, in the runtime sense. The check reads `src/**/*.ts`'s import graph
  (static analysis) and each `vitest.*.config.ts`'s `include` array (read as text).
- **Run alone**: `npm run test:architecture`.
- **Coverage contribution**: no. Static analysis; nothing executes.
- **Evidence**: `ArchitectureEvidence` (`scripts/architecture/evidence-types.ts`). Its shape is
  genuinely different from Vitest's JSON reporter. That is exactly what repo-contract's
  execution/evidence/policy model is designed to accommodate, so using a non-Vitest tool for this
  category is not a limitation.
- **Policy**: `evaluateArchitecturePolicy` fails on any dependency-cruiser tool-infrastructure
  failure, any error-severity dependency-graph violation, or any test-category-boundary violation.
  It warns on warn/info-only dependency-graph findings and passes otherwise.
- **CI**: its own explicit step, early in the `verify` job (cheap, no build required).

### Commit-message format: `commitlint`

- **Establishes**: is every commit on `origin/main..HEAD` a valid Conventional Commit? Conventional
  Commits are still this repository's own commit-message convention. They are also the sole input
  for a changeset auto-generated from a PR's title when no hand-written one exists. Changesets
  derives the bump + changelog from whichever changeset results (see
  specs/decisions/0009-conventional-commits-versioning-and-local-gates.md's own amendments). So a
  malformed message is a real defect, not a style nit. `api-contract` itself now gates on the bump
  the branch's `.changeset/*.md` files declare directly, not on commit messages. See the "API
  compatibility" row above.
- **Does not establish**: whether the subject actually describes the user-visible impact (a
  human-review concern). Nor whether the declared bump is _sufficient_ for the API change; that is
  `api-contract`'s job.
- **Files executed**: none in the runtime sense. `commitlint --from origin/main --to HEAD` reads git
  history.
- **Run alone**: `npm run contract -- commitlint`.
- **Coverage contribution**: no. No test execution, nothing to instrument.
- **Evidence**: exit code only. commitlint has no stable JSON output, so the `commitlint` preset
  reads its plain-text report the same way the `format`/`typecheck` presets do.
- **Policy**: `commitlint()` preset. It passes on exit 0 and fails on a non-zero exit, with the
  tool's own report as the rationale.
- **CI**: part of `npm run contract` in the `contract` job, which checks out with `fetch-depth: 0`
  so `origin/main` resolves. A direct push to `main` post-merge yields an empty range and passes
  trivially. The PR title is also linted by a separate GitHub Action (`pr-title` job) as a
  squash-merge safeguard.

### Suppression governance: `suppression-governance`

- **Establishes**: whether every ESLint/TypeScript/etc. suppression comment in the repository is
  centrally inventoried in `disable-comments.json`. It also checks that each one carries enough
  named justification to satisfy a repository-owned, per-domain/per-rule policy. This is a
  materially different semantic question from every static-analysis category above (see
  specs/decisions/0006-suppression-governance.md). Inline disable comments remain allowed. What this
  check ensures is that none of them can silently bypass a guardrail without leaving a durable,
  reviewable, policy-gated record.

  It has two strictly separated layers, the same split as `architecture`. First,
  `scripts/suppression-governance/check.ts` discovers every suppression directive. It uses the
  TypeScript compiler's own scanner rather than shelling out to ESLint. This check must be able to
  audit a suppression that caused ESLint itself to be bypassed.

  The script derives one semantic id per directive (`suppression:<domain>:<rule>:<file>:<line>`). It
  reconciles that id set against the on-disk registry via `repo-contract/helpers`'
  `reconcileExceptions`. (See ADR 0013's "The exception registry is the review surface" amendment.)
  A matched record is preserved verbatim. An unmatched directive gets a fresh blank stub written to
  disk. By contrast, **a record whose id matches no directive is surfaced as stale and never
  auto-removed** (retiring it is an explicit human edit).

  Second, `checks/suppression-governance.ts` reads that already-reconciled evidence. It evaluates
  the evidence against `suppressionPolicy` (`scripts/suppression-governance/policy-config.ts`). Each
  rule resolves to one of three modes:
  - `"forbidden"`: never permitted.
  - `"allowed"`: permitted unconditionally.
  - `"exception"`: permitted once every field named in its `requirements` list is non-empty.

  The mode is resolved per rule via exact match, then wildcard pattern, then domain default. The
  last fallback is a global default requiring `justification`/`category`/`verificationMethod`.

  This replaces an earlier numeric "N justification entries required" design (see ADR 0006's "not a
  numeric threshold" section). That design was dropped because a plain count is trivially satisfied
  by generating N generic-sounding entries. Generating them takes none of the underlying work the
  count was meant to prove happened.

  `justification` is the one human-authored prose field. It absorbed the older model's separate
  `alternatives`/`remediation`. `category`/`verificationMethod` (see
  [ADR 0006](decisions/0006-suppression-governance.md)) are hand-authored the same way. They are
  closed enumerations rather than free prose, though. They let a reviewer or report triage a
  suppression's kind and evidentiary basis without reading the full prose. The `stryker` domain
  additionally requires a non-empty `reason` on the _finding_ (the text a recognizer extracts from
  the directive comment).

  ADR 0006's 2026-09-07 amendment added a `verifiedBy`/`verifiedContentHash` content-bound sign-off
  block. That block was **removed** with the registry unification. It was deferred, with ADR 0013's
  PR-approval attestation gate, to a post-0.4.0 release.

- **Does not establish**: whether a suppression is _technically justified_. The check never invents
  or evaluates the truth of `justification`. It checks only whether the fields a policy requires are
  non-empty; that judgment is left entirely to whoever writes the prose. The same applies to
  `category`/`verificationMethod`. The check verifies a classification is _present and a valid
  member of its enum_, never that it is _correct_. It also does not establish whether
  ESLint/TypeScript itself currently passes. Discovery is fully independent of any other check's
  outcome.
- **Files executed**: none in the runtime sense. The check statically scans every governed source
  file via the TypeScript compiler's scanner. The governed set follows
  `scripts/suppression-governance/find-source-files.ts`'s own exclusion rules. Those rules are
  deliberately not inherited from `eslint.config.js`/`.gitignore`/`.jscpd.json`.
- **Run alone**: `tsx scripts/suppression-governance/check.ts`.
- **Coverage contribution**: no. Static analysis; nothing executes.
- **Evidence**: `SuppressionGovernanceEvidence` (`scripts/suppression-governance/evidence-types.ts`)
  has these fields:
  - `findings`: every raw directive (`id`, `domain`, `rule`, `file`, `line`, `content`, `reason`).
  - `activeExceptions`: the reconciled live record per finding, keyed by id. It holds the
    `id`/`version`/`justification` core plus
    `category`/`domain`/`file`/`line`/`rule`/`verificationMethod` metadata.
  - `staleExceptions`: records whose directive is gone.
  - `scaffoldedIds`: the stubs freshly created this run.
- **Policy**: `evaluateSuppressionGovernancePolicy` fails on any of the following:
  - A script-level tool-infrastructure failure: an unreadable source file, an invalid pre-existing
    `disable-comments.json`, a `deriveId` collision, or a failed write. An invalid registry file is
    left untouched on disk rather than overwritten.
  - Evidence that independently re-fails registry validation or breaks the
    `findings ↔ activeExceptions` bijection.
  - Any stale exception.
  - Any suppression resolved as forbidden or under-justified.

  It passes otherwise, with a summary of how many suppressions are tracked, newly scaffolded, and
  stale.

- **CI**: part of `npm run contract`. `mutation` declares a genuine
  `dependsOn: ["suppression-governance"]`. Its policy reads this check's evidence to verify every
  Stryker-domain suppression before trusting a comment-ignored mutant (ADR 0006). `mutation`'s
  separate need to run alone, last, is expressed by `isolated` (ADR 0002), not `dependsOn`.

### Security (no network): `security-network`

- **Establishes**: that the package's entire shipped surface (`src/**/*.ts`; see
  [ADR 0007](decisions/0007-no-network-surface.md)) has no network-capable import and no
  network-capable global usage. This check is the second of two independent layers enforcing this
  invariant. The first is an ESLint rule (`eslint.config.js`) scoped to the same surface. Unlike
  ESLint's own layer, this one cannot be silenced by an `eslint-disable` comment or a weakened lint
  config.

  Since ADR 0007's 2026-09 amendment, this check is built on the `repo-contract/helpers`
  exception-policy primitive. Since the 2026-09 v0.4.0 unification (PR 3), its scan script
  reconciles `.repo-contract/exceptions/security-network.json` against what it found. It writes a
  blank stub per unmatched finding; stale records are surfaced and failed, never removed.

  The default posture is unchanged and absolute: `securityNetworkPolicy`'s group `default` is
  `forbidden`. A reviewed exception is a finding-specific record bound to
  `security-network:<capability>:<file>:<line>:<column>`. It is complete only with `justification` /
  `alternatives` / `remediation` / `method` / `exceptionType` all filled in (see "Reviewed
  exceptions" below).

  Preset-command review (what a published preset's `run:` property may spawn) moved to its own
  `preset-commands` check. That move came with the 2026-09 v0.4.0 unification (PR 4); see below.

- **Does not establish**: that a dependency's own internal code never makes a network call. Nor that
  a consumer's own configured checks/presets never do. Executing what the repository's own
  configuration says is the tool's entire purpose. See ADR 0007's Decision section for the exact
  boundary.
- **Files executed**: none. The check is a static AST scan of every `.ts` file under `src/`. It uses
  the TypeScript compiler API, the same approach `suppression-governance` uses.
- **Run alone**: `tsx scripts/security-network/scan.ts`, or `npm run contract -- security-network`.
- **Coverage contribution**: no. Static analysis; nothing executes.
- **Evidence**: `NetworkScanEvidence` (`scripts/security-network/evidence-types.ts`). It records how
  many files were scanned and every finding (`file`, `line`, `column`, `capability`, `detail`)
  across all of them.
- **Policy**: `evaluateSecurityNetworkPolicy` validates `securityNetworkPolicy` and the exception
  registry first, on every run. It then fails on a zero-file scan: a clean result from an empty scan
  is not evidence of a network-free surface. It also fails on any finding not backed by a
  finding-specific, still-verified exception record. It passes when every finding is either absent
  or covered by such a record.
- **CI**: part of `npm run contract`. No `dependsOn`: independent of every other check.

### Security (reviewed preset commands): `preset-commands`

- **Establishes**: that every external command a published preset (`src/presets/*.ts`) spawns has
  its own reviewed record. The command is the first token of the preset's `run:` property. The
  record lives in `.repo-contract/exceptions/preset-commands.json`.

  This replaces the former manually-maintained `ALLOWED_PRESET_COMMANDS` allowlist (ADR 0007's
  2026-09 v0.4.0 amendment, PR 4). A command no longer passes by silent construction (present in a
  list). Now _every_ command needs its own written capability assessment, including ones spawned
  since before this check existed. The id is keyed by command name alone
  (`preset-command:<command>`), so one review covers a command however many presets spawn it.

  `scripts/preset-commands/scan.ts` discovers every `run:` in `src/presets/**` and reconciles the
  registry against the deduped set. It adds a blank stub per new command, then writes the registry
  back. A stale record whose command is gone fails and is never auto-removed. A `run:` first token
  that isn't a statically-resolvable string literal fails outright (never silently passed).

- **Does not establish**: that the resolved binary is actually trustworthy at the machine level.
  None of these tools is bundled by repo-contract; a consumer installs and trusts each one
  separately. Nothing here can see what is actually on `PATH` when a preset runs. What it
  establishes is narrower: _this repository's own source_ never introduces an unreviewed command. It
  also establishes that the review exists and is visible in the same folder every other guardrail
  exception lives in.
- **Files executed**: none. The check is a static AST scan of every file under `src/presets/`.
- **Run alone**: `tsx scripts/preset-commands/scan.ts`, or `npm run contract -- preset-commands`.
- **Coverage contribution**: no. Static analysis; nothing executes.
- **Evidence**: `PresetCommandsEvidence` (`scripts/preset-commands/evidence-types.ts`). It holds
  every discovered command finding, any non-literal `run:` properties, the reconciled
  `activeExceptions`/`staleExceptions`, and which ids were freshly scaffolded.
- **Policy**: `evaluatePresetCommandsPolicy` is a pure evidence->verdict function. It fails on any
  non-literal `run:` property, any command whose record has a blank `justification`, or any stale
  record. It passes once every discovered command is backed by a non-empty `justification`.
- **CI**: part of `npm run contract`. No `dependsOn`: independent of every other check.

### GitHub Actions: `github-actions`

- **Establishes**: that this repository's own workflow files (`.github/workflows/*.{yml,yaml}`) pass
  [actionlint](https://github.com/rhysd/actionlint). actionlint covers workflow syntax and
  semantics, expression and `if:` correctness, and `shellcheck` of `run:` blocks. It also covers
  script-injection patterns (untrusted `github.event.*` / `github.head_ref` used directly in
  `run:`).

  This check integrates a mature external analyzer into the evidence/verdict model rather than
  reimplementing a workflow scanner. That is the general pattern ADR 0010
  (`decisions/0010-review-driven-contracts-and-shared-internal-system-contracts.md`) describes for
  adopting an established capability. The tool itself is a local choice, not fixed by that ADR. The
  actionlint tool performs the analysis; this check only decides how its findings participate in the
  verdict.

- **Does not establish**: that a workflow's _intent_ is correct, or that a third-party action is
  trustworthy. Nor does it add the deeper security posture a dedicated security analyzer (e.g.
  `zizmor`) would. A repository-specific workflow requirement that actionlint does not cover (a
  concurrency-group policy, say) would be its own explicit `repo-contract` rule. It would not be
  part of this check.
- **Files executed**: none of this repository's code. `actionlint` statically analyzes the workflow
  YAML. It is a Go binary the `github-actionlint` devDependency resolves and caches on first use,
  keeping the toolchain `npm install`-only.
- **Run alone**: `node scripts/github-actions/lint.mjs` (prints the JSON evidence).
- **Coverage contribution**: no. External static analysis; none of this package's code runs.
- **Evidence**: `GitHubActionsEvidence` (`scripts/github-actions/evidence-types.ts`). It holds `ok`
  (whether actionlint ran at all), how many workflow files were scanned, and every finding (`file`,
  `line`, `column`, `kind`, `message`).
- **Policy**: `evaluateGitHubActionsPolicy` fails on any actionlint tool-infrastructure failure or
  any finding. It passes when the scan ran clean (or there are no workflow files).
- **CI**: part of `npm run contract`. A pure reader: no `dependsOn`, needs no build.

### Security (supply-chain alerts): `security-socket`

- **Establishes**: that no installed dependency trips a Socket.dev supply-chain alert above a medium
  ("middle") rating. It also establishes that every lower-rated alert is covered by a
  finding-specific, content-bound _verified_ exception.

  This is a materially different semantic question from `security-deps` (known-CVE advisories, via
  `npm audit`) and `security-secrets` (committed secrets). Socket's analysis is _behavioral_: it
  flags a dependency that newly gains install scripts, shell access, network access, filesystem
  access, or obfuscated code. So it catches a compromised or typosquatted package that carries no
  CVE at all.

  `@socketsecurity/cli` runs the scan (`socket ci --json`). `scripts/security-socket/scan.ts`
  normalizes its output into `NormalizedSocketAlert[]`; repo-contract owns the evidence contract,
  never the raw tool JSON. `checks/security-socket.ts` evaluates that against `socketPolicy`
  (`scripts/security-socket/policy-config.ts`). It uses the `repo-contract/helpers` exception-policy
  primitive ([ADR 0013](decisions/0013-reusable-exception-policy-helper.md)), classified purely on
  each alert's normalized severity.

- **Does not establish**: that a dependency is safe in any absolute sense, or that Socket's own
  heuristics are complete. Nor does it establish anything about a dependency's _runtime_ behavior on
  a consumer's machine. This is a static, pre-install-time signal about capability changes and known
  bad patterns. It also makes no claim at all when it did not actually run (see the policy's `warn`,
  below).
- **The reviewed-exception shape**: a record in `.repo-contract/exceptions/socket.json`, bound to
  `socket:<package>@<version>:<type>` (`scripts/security-socket/registry.ts`). It carries the four
  `SecurityExceptionFields` root fields (`alternatives` / `remediation` / `method` /
  `exceptionType`) plus `justification` (see "Reviewed exceptions" below). The scan script
  reconciles the registry only when the CLI actually produced an alert assessment. Anything rated
  above "middle" is `forbidden` outright: no record can permit it.
- **Files executed**: none of this repository's code. `socket ci` analyzes the dependency tree
  server-side. It is spawned through `cross-spawn`, with a 5-minute hard timeout.
- **Run alone**: `tsx scripts/security-socket/scan.ts` (prints the JSON evidence), or
  `npm run contract -- security-socket`.
- **Coverage contribution**: no. External analysis; none of this package's code runs.
- **Evidence**: `SecuritySocketEvidence` (`scripts/security-socket/evidence-types.ts`) is a closed
  state machine:
  - `passed`: 0 alerts.
  - `failed`: with the normalized `alerts`.
  - `unavailable`: `cli-not-installed` / `not-authenticated` / `network-unreachable`.
  - `error`: a malformed or unrecognized report. It fails closed, exactly like `mutation` does for a
    malformed Stryker report.
- **Policy**: `evaluateSecuritySocketPolicy` validates `socketPolicy` and the registry _first_, on
  every run. So a malformed `.repo-contract/exceptions/socket.json` fails CI even on an
  otherwise-clean or never-ran scan. It maps `unavailable` to **`warn`**. This repository's own CI
  holds no Socket org token. So the check cannot distinguish "genuinely clean" from "never ran", and
  says so rather than claiming a pass. `error` fails closed. A clean scan, or one where every alert
  is permitted, passes. Any `forbidden`/`insufficient` verdict or unmatched alert fails, listed
  individually.
- **CI**: part of `npm run contract`. No `dependsOn`: independent of every other check.

### AI-assisted review: `coderabbitai`

- **Establishes**: that this repository's own working tree has been through a CodeRabbit
  `review --agent` pass locally. Or, and this is the actual promise, that the fact it has **not** is
  recorded on this run as a `warn`.

  This category differs from every deterministic check above: the finding source is an LLM opinion,
  not a reproducible tool result. So what the check promises is its _presence and consistent
  self-reporting_, never its pass/fail outcome (see
  [ADR 0014](decisions/0014-coderabbit-as-a-surfaced-check.md)). It promotes the former local-only
  `.githooks/pre-push` `coderabbit review --agent` shell step into the evidence/policy pipeline.
  Every other check participates in that pipeline.

- **Does not establish**: that the code is correct. Nor that CodeRabbit reviewed the _committed_ PR
  diff. That is CodeRabbit's own GitHub App, which posts findings on the PR directly. This check's
  `--uncommitted` scope is the narrower, faster, always-terminating local layer. It also establishes
  nothing at all when `status` is `not-applicable` / `unavailable`. It never invokes an LLM itself;
  it spawns the already-locally-installed `coderabbit` binary.
- **The reviewed-exception shape**: a record in `.repo-contract/exceptions/coderabbit.json`, keyed
  by `coderabbit:<file>:<severity>:<hash of the finding's summary>`. The CLI exposes no native
  finding id and no structured line number, so the summary prose is hashed into the key. A re-review
  whose wording changed re-derives a new id, and the old record goes stale
  (`scripts/coderabbitai/registry.ts`).

  The record carries `justification` / `remediation` / `method` / `exceptionType` plus the finding's
  `summary` at waiver time. `method` **must** be `"independent-human-review"`. Both
  `"mechanical-reverification"` and `exceptionType: "validated-false-positive"` are refused. There
  is no more-authoritative tool to re-run against an AI-generated finding (ADR 0014).

- **Files executed**: none of this repository's code. `coderabbit review --agent --uncommitted`
  (spawned through `cross-spawn`) reviews the uncommitted, tracked working-tree edits.
- **Run alone**: `tsx scripts/coderabbitai/review.ts` (prints the JSON evidence), or
  `npm run contract -- coderabbitai`.
- **Coverage contribution**: no. External analysis; none of this package's code runs.
- **Evidence**: `CoderabbitEvidence` (`scripts/coderabbitai/evidence-types.ts`) is a closed state
  machine:
  - `reviewed`: with the normalized `findings`.
  - `not-applicable`: `reason: "ci"`, carrying `expectedProvider: "coderabbit-github-app"`. That way
    no automation reads "ran in CI" as "review was skipped".
  - `unavailable`: `cli-not-installed` / `git-context-unavailable`.
  - `error`: a malformed event stream or a real CLI failure. It fails closed.
- **Policy**: `evaluateCoderabbitPolicy` validates `coderabbitPolicy` and the registry _first_, on
  every run. In CI `status` is always `not-applicable`, so a broken
  `.repo-contract/exceptions/coderabbit.json` would otherwise never fail CI. It maps
  `not-applicable` / `unavailable` to **`warn`** on every single run, by design. CI, a missing CLI,
  and a bypassed hook must all surface the identical signal. So a local skip can never masquerade as
  "nothing to warn about". `error` fails closed. A clean review, or one where every finding is
  permitted, passes. Any `forbidden`/`insufficient` verdict or unmatched finding fails, listed
  individually.
- **CI**: part of `npm run contract`. It is always `not-applicable` there (review is delegated to
  the CodeRabbit GitHub App); no `dependsOn`.

### Dead-code detection: `dead-code`

- **Establishes**: that every unused-dependency/export/file finding [knip](https://knip.dev) reports
  against this repository's own project graph has its own reviewed record. The record lives in
  `.repo-contract/exceptions/dead-code.json`.

  Among the checks built on published `src/presets/*.ts` factories, this repository's own run is the
  one deliberate exception. It does not consume the published `deadCode` preset, which stays
  published, unchanged, for external consumers. Instead it self-hosts `scripts/dead-code/check.ts`,
  running knip with **no config-time exempt list at all**. A config-time exempt list needs its
  answer before knip ever runs, which a _reconciled_ registry structurally cannot supply. The
  registry that would suppress a finding can only be built from findings that already ran
  unsuppressed. See [ADR 0008](decisions/0008-self-hosting-tool-and-dependency-choices.md)'s 2026-09
  v0.4.0 amendment, PR 5.

  `scripts/dead-code/check.ts` flattens every knip issue category into one `DeadCodeFinding[]` and
  reconciles it against the registry. It adds a blank stub per unmatched finding. A stale record
  whose finding is gone is surfaced and failed, never auto-removed. The script then writes the
  registry back.

- **Does not establish**: that a genuinely dead code path is harmless to delete, or that knip's own
  static reachability analysis is complete. A dynamic `require`, a spawned-by-name CLI, or a GitHub
  Actions workflow reference are all real uses knip cannot see. Explaining those is exactly what a
  record's `justification` exists for.
- **The reviewed-exception shape**: a record in `.repo-contract/exceptions/dead-code.json`, bound to
  `dead-code:<kind>:<name>` (`scripts/dead-code/registry.ts`). The package/export/file `name` is the
  subject, deliberately with no file/line coordinates. So the same symbol or dependency name
  reported unused in two different places is a genuine `deriveId` collision. `reconcileExceptions`
  surfaces it as an integrity failure rather than silently merging.

  The record carries only `justification` plus its own `kind`/`name` identity metadata. It has no
  `alternatives`/`method`/`exceptionType`: the same minimal shape as `preset-commands.json`. An
  unused-dependency exemption isn't a guardrail-loosening waiver the way the security registries'
  findings are.

- **Files executed**: none of this repository's code. `knip --reporter json` statically analyzes the
  project graph. It is spawned through `cross-spawn`, with a 5-minute hard timeout.
- **Run alone**: `tsx scripts/dead-code/check.ts` (prints the JSON evidence), or
  `npm run contract -- dead-code`.
- **Coverage contribution**: no. External static analysis; none of this package's code runs.
- **Evidence**: `DeadCodeEvidence` (`scripts/dead-code/evidence-types.ts`). It holds every raw
  finding (`kind`, `name`, `file`, `location`), the reconciled `activeExceptions`/`staleExceptions`,
  and which ids were freshly scaffolded.
- **Policy**: `evaluateDeadCodePolicy` is a pure evidence->verdict function. It fails in four cases:
  knip itself could not run; any registry load/reconcile error; any finding whose record has a blank
  `justification`; any stale record. It passes once every discovered finding is backed by a
  non-empty `justification`. That includes the trivial case where knip reports 0 issues.
- **CI**: part of `npm run contract`. No `dependsOn`: independent of every other check.

### Reviewed exceptions: `.repo-contract/exceptions/*.json`

Six checks express a reviewed, accepted exception the same way: `suppression-governance`,
`security-network`, `security-socket`, `coderabbitai`, `preset-commands`, and `dead-code`. They use
the shared `repo-contract/helpers` primitives: `reconcileExceptions` / `serializeExceptionRegistry`
/ `writeExceptionRegistry` / the exception-policy resolver
([ADR 0013](decisions/0013-reusable-exception-policy-helper.md)). They also use one check-owned
layer, unpublished: `scripts/shared/exception-record.ts` (`validateExceptionRegistry` + a
per-registry `ExceptionRegistrySchema`). The unification spanned four PRs of the 2026-09 v0.4.0
effort: PR 2 (suppression), PR 3 (the three security checks), PR 4 (preset commands), and PR 5
(dead-code).

- **Where.** All six live under `.repo-contract/exceptions/`: `disable-comments.json`,
  `socket.json`, `coderabbit.json`, `security-network.json`, `preset-commands.json`,
  `dead-code.json`. All use the envelope `{ "exceptions": [ … ] }` and are read via
  `loadExceptionRegistry`. A missing file is a normal empty-registry state, never an error.

  Each registry is owned end-to-end by its check's own scan/review script. That script reconciles it
  against that run's findings via `reconcileExceptions` and rewrites it in place. It creates
  `.repo-contract/exceptions/` first if a fresh tree has none. The Socket / CodeRabbit "the tool
  didn't run" states (`unavailable`/`not-applicable`/`error`) validate the registry but do **not**
  reconcile. With no finding list, no record can be concluded stale.

- **Shape.** Every record carries the three-field core (`id`, `version`, `justification`) plus
  per-registry typed metadata:
  - `disable-comments.json` adds `category`/`verificationMethod` closed enums and
    `domain`/`rule`/`file`/`line`.
  - The three `SecurityExceptionFields` registries (`security-network`, `socket`, `coderabbit`) add
    `alternatives`, `remediation`, `method`, and `exceptionType`. `method` is an `EXCEPTION_METHODS`
    member: how the waiver's claim was substantiated. `exceptionType` is an `EXCEPTION_TYPES`
    member. Each also has its own identity metadata (`capability`/`file`/`line`/`column`;
    `package`/`packageVersion`/`type`/`severity`; `file`/`severity`/`summary`).
  - `preset-commands.json` and `dead-code.json` are the minimal case: `justification` alone, plus
    their own identity metadata (`command`; `kind`/`name`). Neither a preset command nor an
    unused-dependency exemption is a guardrail-loosening waiver the way the security registries'
    findings are. So no `alternatives`/`method`/`exceptionType` applies to either.

  The first four once carried a `verifiedBy`/`verifiedContentHash` content-bound sign-off block. It
  was removed in the 2026-09 unification and deferred with the `exception-governance` PR-approval
  gate.

  Each record's `id` must equal what its registry's schema recomputes from the record's own identity
  metadata. A stored key inconsistent with its own claimed identity is a registry bug, caught at
  load time. Ids: `suppression:<domain>:<rule>:<file>:<line>`,
  `security-network:<capability>:<file>:<line>:<column>`, `socket:<package>@<version>:<type>`,
  `coderabbit:<file>:<severity>:<hash of summary>`, `preset-command:<command>`,
  `dead-code:<kind>:<name>`. "No matching finding" _is_ staleness, and a stale record fails the
  policy (never auto-removed).

- **Validation.** No generated JSON Schema exists for any of the six. `validateExceptionRegistry` +
  each registry's `ExceptionRegistrySchema` is authoritative. It runs on _every_ contract run before
  any findings are evaluated. So a malformed or internally-inconsistent registry fails CI even on a
  clean or never-ran scan.
- **What they never do.** They never loosen a check's default posture:
  - `security-network`'s group default stays `forbidden` (ADR 0007).
  - `security-socket` forbids anything above "middle" outright.
  - `coderabbitai` requires a complete waiver for every finding regardless of severity.
    `coderabbit.json` additionally forbids `exceptionType: "validated-false-positive"` /
    `method: "mechanical-reverification"` (no oracle to re-run against an AI finding).
  - Every published preset's spawned command still needs its own record, regardless of what any
    other preset already has one for.
  - `dead-code` runs knip with no config-time exempt list at all. So every finding needs its own
    record, including one an old exempt list would have silenced before knip ever saw it.

  A record only ever moves a _specific, named_ finding from "fails" to "permitted".

## Coverage

Coverage is a **measurement, not a verification category**. It executes nothing itself; it observes
what the three coverage-producing categories (Unit, Integration, Property) already executed.

### Coverage architecture

```text
test-unit (--coverage)         test-integration (--coverage)      test-property (--coverage)
        |                               |                                 |
coverage/unit/coverage-final.json   coverage/integration/...        coverage/property/...
        \_______________________________|________________________________/
                                         |
                          scripts/aggregate-coverage.mjs
                        (istanbul-lib-coverage merge — a
                         UNION of covered source locations,
                         never a summed/averaged percentage)
                                         |
                        coverage/aggregate/coverage-final.json
                        coverage/aggregate/coverage-summary.json
                                         |
                        repo-contract `coverage` check (reads only)
                                         |
                                    policy (thresholds)
                                         |
                                     `crap` check
                              (reads the same aggregate)
```

- **Not additive**: unit 80% + integration 60% + property 70% does not mean "210% coverage." The
  merge reports, per statement/branch/function/line, whether _any_ contributing run executed it. It
  uses `istanbul-lib-coverage`'s `CoverageMap#merge`, the same mechanism `nyc merge` uses.
- **Canonical scope**: `src/**/*.ts` excluding `src/types.ts`, with identical
  `coverage.include`/`.exclude` on every per-category Vitest config. `src/types.ts` holds
  interfaces/type aliases only, erased at compile time, so it has no coverable runtime statements.
  `scripts/` is intentionally out of scope, as it always has been. It has its own bar via
  typecheck/lint/unit tests, though not the coverage-threshold check.
- **One canonical script does the aggregation** (`scripts/aggregate-coverage.mjs`). It never
  executes tests, never discovers test files, and never enforces thresholds. Adding a future
  coverage-producing category means adding one entry to its `COVERAGE_SOURCES` list. Nothing else
  about the coverage architecture changes.
- **`scripts/report-coverage.mjs`** reads the aggregate and reports it against
  `scripts/coverage-thresholds.mjs`. That file is the single source of truth for the threshold
  numbers. Both this script and `repo-contract.config.ts`'s `coverage` policy import it. The shared
  import replaced what used to be a comment-based "intentionally matches vitest.config.ts"
  convention. The script is report-only: it never fails on a metric below threshold. That judgment
  belongs entirely to the `coverage` check's own policy.
- **`npm run test:coverage`** (`scripts/run-coverage.mjs`) is the only place coverage-producing
  tests are executed by name for the standalone dev/CI workflow. Separately, repo-contract's own
  `test-unit`/`test-integration`/`test-property` checks produce the same artifacts. They do so as a
  side effect of their own `--coverage` evidence-producing run (no duplicate execution either way).
- **`coverage` check** (`checks/coverage.ts`): `run: ["node", "scripts/check-coverage.mjs"]`,
  aggregation + reporting only. Its `dependsOn: ["test-unit", "test-integration", "test-property"]`
  is attached in `repo-contract.config.ts`. That file is the one place every check id is in scope to
  depend on another.
- **`crap` check** consumes the _identical_ canonical aggregate artifact
  (`coverage/aggregate/coverage-final.json`), with `dependsOn: ["coverage"]`. It never uses a
  second, independently-computed coverage map. Its policy gates on two repo-owned numbers: the CRAP
  score (≤ 30) and an independent raw cyclomatic-complexity ceiling (≤ 20). The ceiling exists
  because CRAP collapses toward plain complexity at this repository's coverage floor. There, CRAP on
  its own stops constraining a well-tested but deeply-branchy function (see
  [ADR 0008](decisions/0008-self-hosting-tool-and-dependency-choices.md)).

### Coverage-contribution matrix

| Category                                                          | Executes instrumented `src/`?                                 | Coverage contributor? | Why                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------- |
| Unit                                                              | Yes, in-process                                               | **Yes**               | Direct V8 instrumentation                                                  |
| Integration                                                       | Yes, in-process                                               | **Yes**               | Same instrumentation, multi-module composition                             |
| Property                                                          | Yes, in-process                                               | **Yes**               | Same instrumentation, generated inputs                                     |
| E2E                                                               | Only inside a separate child process, against bundled `dist/` | **No**                | Different process boundary; bundled output isn't 1:1 line-mapped to `src/` |
| Architecture                                                      | No                                                            | **No**                | Static graph analysis only                                                 |
| Mutation, static analysis, dependency analysis, API compatibility | No                                                            | **No**                | Not runtime coverage (unchanged from before this taxonomy)                 |

## Infrastructure vs. substantive failure

Every check in this repository already distinguishes "the tool crashed / produced output we can't
interpret" from "the tool ran and found a real problem". It does so via `CheckStatus`
(`completed`/`timed_out`/`signaled`/`host_terminated`/`spawn_error`/`aborted`) and
`ParsedOutput.success`. This is not a new concept introduced for this taxonomy. Every new check
above reuses it rather than inventing a parallel one.

Concretely, a crashed `depcruise` invocation reports `dependencyGraph: { ok: false, error: "..." }`.
The `architecture` policy then fails with a rationale saying evaluation _could not be performed_.
That result is never silently reinterpreted as "architecture passed" or folded into an ordinary rule
violation.

## Execution layers

There are three distinct layers, each with exactly one canonical implementation (see
`scripts/run-test-category.mjs`'s own header comment). So a change to, say, an `include` glob is
made once, not three times:

```text
Developer / CI:  npm run test:unit          →  node scripts/run-test-category.mjs unit
repo-contract:   test-unit check's `run`    →  ["node","scripts/run-test-category.mjs","unit","--coverage","--reporter=json"]
CI:                                          →  npm run test:unit   (never redefines the command)
```

`repo-contract.config.ts` checks call tools directly, never `npm run <script>`. `npm run`
interleaves npm's own log lines with a tool's stdout, which would break every check's JSON parsing.
That is true of every check in this file, not only the new ones.

`dependsOn` is used only where a check genuinely needs a prior check's evidence. `coverage` needs
the three test-* categories' artifact files. `mutation` needs `suppression-governance`'s registry
evidence (see `repo-contract.config.ts`'s own header comment). `dependsOn` is never used to turn
`repo-contract.config.ts` into a second, hidden orchestration engine. `mutation`'s separate need to
run last, only once every non-isolated check has settled, is scheduling-only. It is expressed via
`isolated` rather than `dependsOn` (ADR 0002). npm/CI runs verification; repo-contract observes and
evaluates it.

`npm run test:watch` is an explicit dev-convenience aggregate (unit+integration+property, e2e
excluded as slow). It is not a sixth verification category.

## Rejected categories

This list does not mean that repo-contract can't support these. It means this repository doesn't
currently need a separate demonstration of them. An accepted category already demonstrates the more
important integration principle involved. Two genuine not-applicable exceptions are noted inline.

- **Contract testing (Pact-style)**: there are no independent network consumers to model, and API
  compatibility already covers it. The one real gap was that runtime `Evidence`/`Verdict` were never
  validated against the _published_ `schemas/*.schema.json`. Ajv-based schema-conformance tests
  close it (`test/unit/schema/schema-conformance.test.ts`), inside the existing **Golden/snapshot
  contracts** category. That question is kept explicitly distinct even though co-located. "Did the
  public contract change?" is API compatibility (static types). "Does runtime output conform to the
  declared contract?" is schema conformance (real values).
- **Security testing**: `security-deps`/`security-secrets` and ESLint's
  `no-eval`/`no-implied-eval`/`no-new-func` already exist. The new value is a narrowly-scoped
  property test on the tokenizer. It proves exactly "malformed input cannot produce unintended
  argument-boundary splitting". It is never a "secure against injection" claim, penetration-test
  coverage, or vulnerability-free claim.
- **~~Accessibility testing~~ (superseded)**: rejected when this list was first written (as a
  table), when no UI/DOM/browser surface existed in this package. It was superseded once `docs/` (a
  real landing page with DOM/browser surface) was added. This repository now runs a real
  `accessibility` check: `pa11y` against `docs/index.html`, driving an actual headless-Chromium
  accessibility tree. See [ADR 0008](decisions/0008-self-hosting-tool-and-dependency-choices.md)'s
  "Accessibility testing" section for why `pa11y` specifically. The "remaining existing categories"
  note in the Verification matrix section above covers this category. It is kept as a struck-through
  entry, not deleted, so the original applicability reasoning and its later reversal both stay
  visible.
- **Fuzz testing**: a scoped rejection specific to this repository, not a universal equivalence
  claim. No native/memory-unsafe parsing boundary exists, and the parsers are already exception-safe
  by design. So a dedicated coverage-guided fuzzing harness isn't justified at the current risk
  profile. Property-based generation already demonstrates the relevant integration principle.
  Revisit if a binary-format parser or native binding is ever added.
- **Concurrency/race-condition testing**: the single-threaded Node event loop has no shared-memory
  data races, only async-ordering bugs. Those are exactly what generated-input property tests over
  `concurrency-pool.ts`/`dependency-scheduler.ts` catch.
- **Resilience/fault-injection testing**: already the default style of this repo's unit tests: real
  timeouts, real SIGTERM, real ENOENT (see `spawn-check.test.ts`, `process-tree.test.ts`,
  `abort-signals.test.ts`).
- **Compatibility/interoperability testing**: achieved by CI's existing OS × Node-version matrix.
  That is an execution-_environment_ concern applied across categories, not a new semantic one. The
  one real gap was that CJS `require()` was never tested, only ESM `import`. A new case inside
  **E2E** closes it (`test/e2e/consumer-install.test.ts`).
- **Serialization/deserialization testing**: round-trip correctness is a property, so this folds
  into **Property-based testing**. It is scoped only to functions whose contract explicitly promises
  round-tripping (`parseJson`/`parseText`). It is not a blanket claim over every parser.
- **Migration/upgrade testing**: not applicable. This package has no persisted state it ever reads
  back and migrates; `Evidence`/`Verdict` are produced fresh every run. Version-literal discipline
  is already enforced by the `api-contract` check's `schema-version-literal-stale` detection.
- **Resource/lifecycle testing**: already the substance of
  `process-tree.test.ts`/`abort-signals.test.ts`'s real-process-cleanup assertions.
- **Determinism/reproducibility testing**: expressed as property tests only where determinism is an
  actual documented contract, such as `tokenizeRunString`. The api-contract classifier's own
  change-id-generation property test now lives in `internal-package-contract`, alongside the rest of
  that engine. Determinism is never tested as a blanket `f(x) === f(x)` over arbitrary functions.
  Some evidence (timestamps, durations) is intentionally nondeterministic. The existing api-contract
  baseline-comparison mechanism (Golden/snapshot contracts) also expresses it.
- **Boundary/validation testing**: a testing _discipline_, not a distinct tool/runner/evidence-shape
  of its own. It is practiced within Unit tests (named edge cases in `validate-config.test.ts`) and
  generalized by Property-based testing.
- **State-machine/model-based testing**: not a separate tool from property-based testing; it is
  fast-check's own `fc.commands` API. One concrete model-based test
  (`spawn-check.status.property.test.ts`) lives inside **Property-based testing**. It is labeled as
  a distinct sub-methodology, not a separate command/category.
- **Compliance/invariant testing**: there is no regulatory scope for this package. "Invariant"
  testing here is unit/property tests aimed at a documented ADR (e.g. ADR 0001). New architecture
  rules are comment-tagged with the ADR they protect instead of inventing a category.

## Complements to existing categories

Two small additions went into categories that already existed; neither is a new top-level category:

- **Golden/snapshot contracts**: `test/unit/schema/schema-conformance.test.ts` validates real,
  runtime `Evidence`/`Verdict` objects against the published `schemas/*.schema.json` via ajv. This
  closes a real gap. Nothing previously checked that runtime _values_ conform to the schema this
  package publishes for external consumers to validate against. API Extractor only analyzes _types_
  statically.
- **End-to-end / package-acceptance**: a CJS `require()` case was added alongside the existing ESM
  `import` case in `test/e2e/consumer-install.test.ts`. The package ships both entry points
  (`dist/index.js` and `dist/index.cjs`), but only the ESM path was previously exercised end-to-end.

## Running the full picture

```sh
npm run test:unit           # only test/unit/**
npm run test:integration    # only test/integration/**
npm run test:property       # only test/property/**
npm run test:e2e            # only test/e2e/** (needs a prior npm run build)
npm run test:architecture   # static; no build needed
npm run test                # test:unit + test:integration + test:property + test:e2e
npm run test:coverage       # the three coverage-producing categories, aggregated, threshold-gated
npm run contract            # repo-contract validating this repository using itself -- the complete
                             # local pre-flight gate, and what CI's `contract` job runs
npm run verify               # bare alias for `npm run contract` (package.json's "verify" script)
```

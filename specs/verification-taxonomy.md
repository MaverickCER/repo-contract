# Verification taxonomy

Canonical reference for every verification category this repository runs, referenced from
README/CONTRIBUTING/`specs/architecture.md`. Companion to `specs/architecture.md` (how the package
itself is built) and `specs/decisions/` (the reasoning trail for load-bearing constraints) — this
document is about what the repository verifies, how, and why each category is distinct.

## Purpose: a self-governing reference implementation

This repository is intentionally a comprehensive **reference implementation of repo-contract's own
intended usage** — it demonstrates, through the package's own operation, how independent,
industry-standard verification systems (Vitest, fast-check, dependency-cruiser, Stryker, API
Extractor, npm audit, secretlint, …) connect to repo-contract's `execution → evidence → policy →
verdict` pipeline without repo-contract owning, replacing, or abstracting any of them:

```text
external verifier → machine-readable result → repo-contract evidence → policy → verdict
```

Every tool used here is a demonstration of that integration pattern, never a prescription. A
consumer can replace Vitest with Jest, fast-check with another property-testing library,
dependency-cruiser with another architecture analyzer, and the pattern still holds — nothing here
requires repo-contract itself to know anything about any of these tools. Avoid special-case APIs or
primitives introduced solely to make this repository's own self-governance easier; if this
repository repeatedly needs a capability the public `repo-contract` API can't naturally express,
that is a signal the API itself may need to mature, not something to silently work around here.

**Automated verification does not replace human review.** Every check and policy below establishes
machine-checkable properties. None of them determine whether a change is appropriate, whether
requirements were correctly understood, or whether product, operational, architectural, legal,
security, or maintenance considerations have been adequately addressed. Human review remains
required wherever this repository's review policy requires it.

## Taxonomy admission rule (category-proliferation guardrail)

A verification category earns independent status because it asks a **materially different semantic
question and produces independently meaningful evidence** — not because it uses a different tool,
config file, directory, or coverage environment. A distinct execution boundary or tool is only
required when it materially contributes to that distinction: Unit and Integration both legitimately
use Vitest; Property-based and model-based testing both legitimately use Vitest + fast-check.

Do not create a new top-level verification category merely because a different tool, config file,
test directory, or coverage environment exists. Prefer a new case, sub-methodology, or evidence
field inside an existing category when the underlying semantic question is unchanged. This rule
is what rejected 14 of the 17 candidate categories evaluated below (see "Rejected categories").

Two further terminology notes that keep the concepts in this document from collapsing into one
another:

- **"test:" is a command namespace, not a claim.** `test:architecture` runs dependency-cruiser, not
  Vitest, and isn't "a test" in the traditional sense — the prefix signals "an independently
  runnable verification level." `npm run test` (the aggregate) therefore covers only the four
  Vitest-based categories (unit/integration/property/e2e); `test:architecture` is invoked separately.
- **`npm run test:watch`** is an explicitly aggregate developer-convenience command (watches
  unit+integration+property together), not a verification category of its own — see "Execution
  layers" below.

## Verification category vs. execution environment vs. test runner vs. evidence vs. policy

These are five different concepts, deliberately kept distinct throughout this repository:

| Concept               | Example                                 | Answers                                                       |
| --------------------- | --------------------------------------- | ------------------------------------------------------------- |
| Verification category | Unit testing                            | What semantic question is being asked?                        |
| Execution environment | Node 20.x on `ubuntu-latest` in CI      | Where/under what conditions does it run?                      |
| Test runner / tool    | Vitest, fast-check, dependency-cruiser  | What executes the check and produces raw output?              |
| Evidence              | `CheckEvidence`, `ArchitectureEvidence` | What happened, captured as structured, machine-readable fact? |
| Policy                | `evaluateArchitecturePolicy`            | Does the repository consider that evidence acceptable?        |

Unit and Integration share a test runner (Vitest) without being the same category. The OS/Node
version matrix in CI is an execution-_environment_ axis applied across categories, not a category of
its own (see "Compatibility/interoperability testing" in the rejected-categories table). Coverage is
a _measurement_, derived from evidence several categories independently produce — not a category
that executes anything itself.

## Verification matrix

The three newly-accepted categories alongside the existing categories most relevant to
source/coverage — Mutation and API compatibility are unchanged by this taxonomy expansion, included
here so the full picture is visible in one table rather than split across documents. The remaining
existing categories (Syntax, Static analysis, Formatting, Dependency analysis, Accessibility,
Performance tests, Golden/snapshot contracts, Git/repository guardrails, Release checks) are
preserved unchanged and not repeated here — see the repo-contract checks list in
`repo-contract.config.ts` for those.

| Verification                 | Semantic question                                                                                           | Tool                                                            | Execution boundary                                                            | Coverage                                                      | Evidence                               | repo-contract check      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------- | ------------------------ |
| Unit                         | Does isolated behavior satisfy its examples/contracts?                                                      | Vitest                                                          | `test/unit/**`                                                                | Yes                                                           | JSON (Vitest `--reporter=json`)        | `test-unit`              |
| Integration                  | Do internal components compose correctly?                                                                   | Vitest                                                          | `test/integration/**`                                                         | Yes                                                           | JSON (Vitest `--reporter=json`)        | `test-integration`       |
| Property (incl. model-based) | Do generalized invariants hold over generated inputs?                                                       | Vitest + fast-check                                             | `test/property/**`                                                            | Yes                                                           | JSON (Vitest `--reporter=json`)        | `test-property`          |
| E2E / package-acceptance     | Does the built package work as a consumer would use it?                                                     | Vitest + real subprocesses, against `dist/`                     | `test/e2e/**`                                                                 | No                                                            | JSON (Vitest `--reporter=json`)        | `test-e2e`               |
| Architecture                 | Does the production dependency graph obey architectural constraints?                                        | dependency-cruiser                                              | `src/**/*.ts` module graph (+ each Vitest config's own boundary)              | No                                                            | JSON (`ArchitectureEvidence`)          | `architecture`           |
| Coverage                     | What proportion of the canonical source surface is exercised by the contributing test categories, in union? | istanbul-lib-coverage (merge) + `@vitest/coverage-v8`           | aggregate (reads only prior categories' artifacts)                            | N/A — this _is_ the measurement                               | JSON (`coverage-summary.json` total)   | `coverage`               |
| Mutation                     | Do tests detect injected behavioral changes?                                                                | Stryker (running the fast Vitest suite per mutant)              | `src/**/*.ts` mutated, `vitest.config.ts`'s dev-aggregate suite as the oracle | No — a separate quality signal, not ordinary runtime coverage | JSON (Stryker's `json` reporter)       | `mutation`               |
| API compatibility            | Did the public API change?                                                                                  | API Extractor + `scripts/api-contract/`                         | package API surface (`src/index.ts`'s curated barrel vs. committed baseline)  | No                                                            | JSON (`ApiContractEvidence`)           | `api-contract`           |
| Changeset documentation      | Is every file this PR changed accounted for with a human-readable description?                              | `scripts/changeset-docs/`                                       | files changed relative to `--base` (default `origin/main`)                    | No                                                            | JSON (`ChangesetDocsEvidence`)         | `changeset-docs`         |
| Suppression governance       | Is every static-analysis suppression directive centrally inventoried and justified against policy?          | TypeScript compiler scanner + `scripts/suppression-governance/` | governed source files (`find-source-files.ts`)                                | No                                                            | JSON (`SuppressionGovernanceEvidence`) | `suppression-governance` |
| Security -- no network       | Does the shipped surface (src/**) avoid network-capable imports, globals, and unreviewed spawned commands?  | TypeScript compiler scanner + `scripts/security-network/`       | `src/**/*.ts`                                                                 | No                                                            | JSON (`NetworkScanEvidence`)           | `security-network`       |

Every row above with its own `###` section below is detailed there, including the exact command to
run it alone (`npm run test:unit`, etc. — see "Execution layers"). Coverage, Mutation, and API compatibility keep
their pre-existing tools, evidence shapes, and policies; only Coverage's _aggregation mechanism_
changed (see "Coverage" below) — its evidence shape and the `coverage` check's policy did not.

### Unit — `test-unit`

- **Establishes**: that an individual module's behavior matches its documented examples/contracts,
  in isolation. This repository's house style prefers real behavior over mocking (real subprocesses,
  real timers, real signals — see `test/unit/execution/spawn-check.test.ts`), so "isolated" means
  "one module under test," not "every dependency replaced with a test double."
- **Does not establish**: that modules compose correctly together (Integration), that generalized
  invariants hold across an input space (Property), or that the built package works for a real
  consumer (E2E).
- **Files executed**: `test/unit/**/*.test.ts`, exercising `src/**` and `scripts/**`.
- **Run alone**: `npm run test:unit`.
- **Coverage**: yes — `coverage/unit/coverage-final.json`.
- **Evidence**: Vitest's own JSON reporter, parsed by `evaluateVitestJsonPolicy` in
  `src/presets/shared/vitest-json-policy.ts`.
- **Policy**: the `test-unit` check's own policy fails on any failing test or unparseable Vitest
  output (distinguished from each other, never conflated — see "Infrastructure vs. substantive
  failure" below); passes otherwise.
- **CI**: part of `npm run test:coverage`, which the `verify` job runs across the full OS × Node
  matrix.

### Integration — `test-integration`

- **Establishes**: that multiple real internal modules, composed together, behave correctly — the
  full `runRepoContract` pipeline (`test/integration/run-repo-contract.test.ts`) and the complete
  api-contract subsystem (`test/integration/api-contract/check.integration.test.ts`: real git, real
  filesystem, real API Extractor, all in-process).
- **Does not establish**: single-module correctness in isolation (Unit — that's still the bulk of
  what would fail first if this failed too), or that the package works from _outside_ its own source
  tree, crossing the package boundary the way a real consumer does (E2E).
- **Files executed**: `test/integration/**/*.test.ts`.
- **Run alone**: `npm run test:integration`.
- **Coverage**: yes — `coverage/integration/coverage-final.json`.
- **Evidence/Policy**: identical shape and mechanism to Unit's.
- **CI**: part of `npm run test:coverage`.

### Property-based (incl. model-based) — `test-property`

- **Establishes**: that a stated invariant holds across a _generated_ input space, not just
  hand-picked examples — round-trip correctness (`tokenize-command.property.test.ts`,
  `parse-output.property.test.ts`), ordering/scheduling invariants
  (`dependency-scheduler.property.test.ts`, `concurrency-pool.property.test.ts`), comparison
  invariants (`semver.property.test.ts`), and one **model-based** test
  (`spawn-check.status.property.test.ts`: an explicit predictive model of `CheckStatus`'s documented
  priority ordering, checked against the real system for every scenario in a small, curated,
  exhaustively-run set via `it.each` — not `fc.constantFrom` + a matching `numRuns`, which samples
  independently with replacement and is not guaranteed to draw every scenario in a given run, as
  this file's own doc comment discovered empirically).
- **Does not establish**: a blanket claim of "no bugs" or "secure against injection" — each property
  states a precise, narrow claim (e.g. "malformed/adversarial input cannot produce unintended
  argv-boundary splitting," not "the tokenizer is secure"). Determinism properties are written only
  for functions whose contract explicitly promises determinism (`tokenizeRunString`, the api-contract
  classifier's change-id generation) — never a blanket `f(x) === f(x)` over arbitrary functions, since
  some evidence (e.g. `CheckEvidence.durationMs`) is intentionally nondeterministic.
- **Resource boundaries** (required, not optional — this governs AI-authored property tests too):
  every property test sets an explicit, bounded `numRuns`, uses size-bounded arbitrary generators
  (no unbounded string/graph/array generators risking pathological memory/time use), and — for the
  one real-subprocess-racing model-based test — uses a small, curated scenario set with generous
  timing gaps (≥200ms) rather than free random generation, to avoid CI flakiness from real OS timing.
- **Files executed**: `test/property/**/*.test.ts`.
- **Run alone**: `npm run test:property`.
- **Coverage**: yes — `coverage/property/coverage-final.json`.
- **Evidence/Policy**: same Vitest JSON-reporter mechanism as Unit/Integration (fast-check runs
  inside ordinary `it()`/`test()` blocks, so Vitest's own reporter already captures pass/fail and
  failure messages, including fast-check's own shrunk-counterexample output — no separate evidence
  type was introduced for this).
- **CI**: part of `npm run test:coverage`.

### End-to-end / package-acceptance — `test-e2e`

- **Establishes**: that the _built, published_ package — crossing the real package boundary via
  `npm pack` → `npm install` into a scratch consumer → `require`/`import` — actually works for a
  real consumer, via both supported entry points (`dist/index.js` ESM and `dist/index.cjs`
  CommonJS), and that the `./schema` export resolves to real, valid JSON Schema files. This is a
  deliberately narrow definition: _black-box consumer/package acceptance specifically_, not a
  general "test that starts a subprocess" or "any workflow spanning multiple things" — internal
  multi-module composition is Integration, not E2E, even when it uses real subprocesses too (Unit's
  execution-engine tests do that constantly).
- **Does not establish**: source-level branch/statement coverage (see "Coverage contribution" below)
  or anything about behavior _inside_ the package's own source tree (every other category already
  covers that, in-process, more precisely).
- **Files executed**: `test/e2e/**/*.test.ts`. Requires `dist/` to already be built (skipped with a
  clear message otherwise).
- **Run alone**: `npm run test:e2e`.
- **Coverage contribution**: **no**. E2E executes `dist/` — tsup-bundled output — inside a genuinely
  separate child-process boundary, not instrumented `src/` in-process. Attempting to collect V8
  coverage there would need sourcemap-based re-instrumentation of bundled output, a level of
  complexity disproportionate to what this category actually proves (packaging/installability/
  consumption, not branch coverage). This is a deliberate, documented absence, not an oversight —
  see the Coverage section below for how the aggregate stays honest about it.
- **Evidence/Policy**: same Vitest JSON-reporter mechanism as the other three.
- **CI**: its own explicit step in the `verify` job (not folded into `test:coverage`, since E2E
  doesn't contribute to it) — see `.github/workflows/ci.yml`.

### Architecture — `architecture`

- **Establishes**: two distinct, purely static facts, combined into one check for practical reasons
  (both are cheap, static, no-execution checks about the shape of the repository) but reported as two
  clearly separate evidence sections:
  1. **`dependencyGraph`** — does the production `src/**/*.ts` module graph obey this repository's
     architectural constraints (`.dependency-cruiser.cjs`)? At minimum: no circular dependencies
     (hard failure), no unresolved imports (hard failure), `execution/` never imports
     `evidence/`/`policy/` (protects ADR 0001's "strictly phased execution/policy" guarantee),
     `config/` never imports `execution/`/`evidence/`/`policy/`, and `src/` never imports `scripts/`.
  2. **`testCategoryBoundaries`** — does every verification category's own Vitest config
     (`vitest.unit.config.ts`, etc.) stay strictly inside its own directory? A permanent, mechanically
     enforced guardrail (`scripts/check-test-boundaries.mjs`), not a one-time assumption verified only
     at implementation time.
- **Does not establish**: per-file style/correctness (ESLint), unused exports/dependencies (knip), or
  anything about runtime behavior — dependency-cruiser never executes application code.
- **Rule quality, not just rule existence**: `.dependency-cruiser.cjs`'s rules are validated in
  `test/unit/architecture/rules.test.ts` against both a true positive (a fixture import that _should_
  be flagged) and a true negative (a legitimate import that should _not_ be) — proving the rules
  correctly discriminate, not merely that they exist and run.
- **Files executed**: none, in the runtime sense — `src/**/*.ts`'s import graph (static analysis) and
  each `vitest.*.config.ts`'s `include` array (read as text).
- **Run alone**: `npm run test:architecture`.
- **Coverage contribution**: no — static analysis, nothing executes.
- **Evidence**: `ArchitectureEvidence` (`scripts/architecture/evidence-types.ts`) — a genuinely
  different shape from Vitest's JSON reporter, which is exactly what repo-contract's
  execution/evidence/policy model is designed to accommodate; using a non-Vitest tool for this
  category is not a limitation.
- **Policy**: `evaluateArchitecturePolicy` — fails on any dependency-cruiser tool-infrastructure
  failure, any error-severity dependency-graph violation, or any test-category-boundary violation;
  warns on warn/info-only dependency-graph findings; passes otherwise.
- **CI**: its own explicit step, early in the `verify` job (cheap, no build required).

### Changeset documentation — `changeset-docs`

- **Establishes**: a deliberately different semantic question from API compatibility's "did the
  public API change" (see specs/decisions/0010-changeset-adr-and-pr-documentation-discipline.md) — is every file this
  PR changed, relative to its base branch, accounted for with a human-readable description? The check
  maintains a `### Changed Files` section inside the same `.changeset/*.md` file `api-contract` may
  also be maintaining (the two agree on which single file via the shared
  `scripts/changeset-file-locator.ts`), one row per changed file, reconciled every run: a row's
  description is preserved verbatim across runs as long as its file is still part of the diff
  (including across a detected rename), added fresh (as a placeholder) for a newly-changed file, and
  dropped entirely once its file is no longer part of the diff.
- **Does not establish**: anything about SemVer or release level -- this check has no opinion on
  release level whatsoever and never touches the frontmatter level api-contract or a human owns; it
  also does not establish anything about the _correctness_ of a description, only its presence.
- **Files executed**: none in the runtime sense -- `git diff --name-status`/`--numstat` against
  `--base` (default `origin/main`), text-level reconciliation of one Markdown file.
- **Run alone**: `tsx scripts/changeset-docs/check.ts --base=origin/main`.
- **Coverage contribution**: no -- no test execution, nothing to instrument.
- **Evidence**: `ChangesetDocsEvidence` (`scripts/changeset-docs/evidence-types.ts`) -- `rows`, each
  with its description (`undefined` while still a placeholder), and `allDescribed`, the single fact
  the policy gates on.
- **Policy**: `evaluateChangesetDocsPolicy` -- fails listing exactly which file paths still carry the
  placeholder description; passes otherwise (including trivially when nothing changed relative to the
  base).
- **CI**: part of `npm run contract`, alongside `api-contract`; a direct push to `main` (post-merge)
  trivially yields zero changed files against itself, so no `pull_request`-only conditional is needed.

### Suppression governance — `suppression-governance`

- **Establishes**: a materially different semantic question from every static-analysis category above
  (see specs/decisions/0007-suppression-governance.md) — is every ESLint/TypeScript/etc. suppression
  comment in the repository centrally inventoried in `disable-comments.json`, and does each one carry
  enough named justification to satisfy a repository-owned, per-domain/per-rule policy? Inline disable
  comments remain allowed; what this check guarantees is that none of them can silently bypass a
  guardrail without leaving a durable, reviewable, policy-gated record. Two strictly separated layers,
  the same split as `architecture`/`changeset-docs`: `scripts/suppression-governance/` discovers
  suppression comments (via the TypeScript compiler's own scanner, not by shelling out to ESLint — this
  check must be able to audit a suppression that caused ESLint itself to be bypassed) and synchronizes
  the registry (new suppressions get empty `justification`/`alternatives`/`remediation`/`category`/
  `verificationMethod` fields, removed ones are dropped, unambiguous line-moves preserve those fields,
  ambiguous ones never guess); `checks/suppression-governance.ts` reads that already-synchronized
  registry and evaluates it against `suppressionPolicy` (`scripts/suppression-governance/policy-config.ts`)
  — each rule resolves to one of three modes: `"forbidden"` (never permitted), `"allowed"` (permitted
  unconditionally), or `"exception"` (permitted once every field named in its `requirements` list is
  non-empty), resolved per rule via exact match, then wildcard pattern, then domain default, then a
  global default requiring `justification`/`alternatives`/`remediation`/`category`/`verificationMethod`.
  This replaces an earlier numeric "N justification entries required" design, dropped because a plain
  count is trivially satisfied by generating N generic-sounding entries without doing any of the
  underlying work the count was meant to prove happened (see ADR 0007's "not a numeric threshold"
  section). `category`/`verificationMethod` (see
  [ADR 0007](decisions/0007-suppression-governance.md)) are hand-authored
  the same way as `justification`/`alternatives`/`remediation`, but are closed enumerations rather than
  free prose, letting a reviewer or report triage a suppression's kind and evidentiary basis without
  reading the full prose.
- **Does not establish**: whether a suppression is _technically justified_ — the check never invents or
  evaluates the truth of `justification`/`alternatives`/`remediation`, only whether the fields a policy
  requires are non-empty; that judgment is left entirely to whoever writes the prose. The same applies to
  `category`/`verificationMethod`: the check verifies a classification is _present and a valid member of
  its enum_, never that it is _correct_. It also does not establish anything about whether ESLint/TypeScript
  itself currently passes — discovery is fully independent of any other check's outcome.
- **Files executed**: none in the runtime sense — a static scan of every governed source file
  (`scripts/suppression-governance/find-source-files.ts`'s own exclusion rules, deliberately not
  inherited from `eslint.config.js`/`.gitignore`/`.jscpd.json`) via the TypeScript compiler's scanner.
- **Run alone**: `tsx scripts/suppression-governance/check.ts`.
- **Coverage contribution**: no — static analysis, nothing executes.
- **Evidence**: `SuppressionGovernanceEvidence`
  (`scripts/suppression-governance/evidence-types.ts`) — every synchronized record (`file`, `line`,
  `domain`, `rule`, `content`, `justification`, `alternatives`, `remediation`, `category`,
  `verificationMethod`, `reason`, plus this run's `new`/`existing`/`moved` status), and
  `newCount`/`movedCount`/`removedCount` for the run as a whole.
- **Policy**: `evaluateSuppressionGovernancePolicy` — fails on a script-level tool-infrastructure failure
  (an unreadable source file, or a pre-existing `disable-comments.json` that fails validation — left
  untouched on disk rather than overwritten), on evidence that independently re-fails registry
  validation, or on any suppression resolved as forbidden or under-justified; passes otherwise, with a
  summary of how many suppressions are tracked/new/moved/removed.
- **CI**: part of `npm run contract`. `mutation` declares a genuine `dependsOn: ["suppression-governance"]`
  -- its policy reads this check's evidence to verify every Stryker-domain suppression before trusting
  a comment-ignored mutant (ADR 0007); `mutation`'s separate need to run alone, last, is expressed by
  `isolated` (ADR 0003), not `dependsOn`.

### Security — no network — `security-network`

- **Establishes**: that the package's entire shipped surface (`src/**/*.ts` -- see
  [ADR 0013](decisions/0013-no-network-surface.md)) contains no network-capable import, no
  network-capable global usage, and no preset spawning a command outside a small, reviewed
  allowlist. The second of two independent layers enforcing this invariant -- the first is an
  ESLint rule (`eslint.config.js`) scoped to the same surface. Both cover the same core imports/
  globals; this check additionally covers the preset-command allowlist and, unlike ESLint, cannot
  be silenced by an `eslint-disable` comment or a weakened lint config.
- **Does not establish**: that a dependency's own internal code never makes a network call, or that
  a consumer's own configured checks/presets never do (that's the tool's entire purpose -- execute
  what the repository's own configuration says; see ADR 0013's Decision section for the exact
  boundary, including why `linkinator`, an allowlisted preset command, legitimately does make HTTP
  requests on a consumer's own explicit behalf).
- **Files executed**: none -- a static AST scan (TypeScript compiler API, the same approach
  `suppression-governance` uses) of every `.ts` file under `src/`.
- **Run alone**: `tsx scripts/security-network/scan.ts`.
- **Coverage contribution**: no — static analysis, nothing executes.
- **Evidence**: `NetworkScanEvidence` (`scripts/security-network/evidence-types.ts`) -- how many
  files were scanned, and every finding (`file`, `line`, `column`, `capability`, `detail`) across
  all of them.
- **Policy**: `evaluateSecurityNetworkPolicy` -- passes only when `findings` is empty; fails
  otherwise, listing every finding's location and explanation.
- **CI**: part of `npm run contract`. No `dependsOn` -- independent of every other check.

## Coverage

Coverage is a **measurement, not a verification category** — it executes nothing itself; it observes
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
  merge (`istanbul-lib-coverage`'s `CoverageMap#merge`, the same mechanism `nyc merge` uses) reports,
  per statement/branch/function/line, whether _any_ contributing run executed it.
- **Canonical scope**: `src/**/*.ts` excluding `src/types.ts` (interfaces/type aliases only, erased
  at compile time — no coverable runtime statements) — identical `coverage.include`/`.exclude` on
  every per-category Vitest config. `scripts/` is intentionally out of scope, as it always has been
  — it has its own bar via typecheck/lint/unit tests, just not the coverage-threshold check.
- **One canonical script does the aggregation** (`scripts/aggregate-coverage.mjs`) — it never
  executes tests, never discovers test files, and never enforces thresholds. Adding a future
  coverage-producing category means adding one entry to its `COVERAGE_SOURCES` list; nothing else
  about the coverage architecture changes.
- **`scripts/report-coverage.mjs`** reads the aggregate and reports it against
  `scripts/coverage-thresholds.mjs` (the single source of truth for the threshold numbers, imported
  by both this script and `repo-contract.config.ts`'s `coverage` policy — replacing what used to be a
  comment-based "intentionally matches vitest.config.ts" convention with an actual shared import).
  It is report-only — it never fails on a metric below threshold; that judgment belongs entirely to
  the `coverage` check's own policy.
- **`npm run test:coverage`** (`scripts/run-coverage.mjs`) is the only place coverage-producing tests
  are executed by name for the standalone dev/CI workflow; repo-contract's own `test-unit`/
  `test-integration`/`test-property` checks separately produce the same artifacts as a side effect of
  their own `--coverage` evidence-producing run (no duplicate execution either way).
- **`coverage` check** (`checks/coverage.ts`, with `dependsOn: ["test-unit", "test-integration",
"test-property"]` attached in `repo-contract.config.ts`, the one place every check id is in scope
  to depend on another): `run: ["node", "scripts/check-coverage.mjs"]` — aggregation + reporting
  only.
- **`crap` check** consumes the _identical_ canonical aggregate artifact
  (`coverage/aggregate/coverage-final.json`), `dependsOn: ["coverage"]` — never a second,
  independently-computed coverage map.

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
interpret" from "the tool ran and found a real problem," via `CheckStatus`
(`completed`/`timed_out`/`signaled`/`host_terminated`/`spawn_error`/`aborted`) and `ParsedOutput.success` — this is not
a new concept introduced for this taxonomy, and every new check above reuses it rather than inventing
a parallel one. Concretely: a crashed `depcruise` invocation reports `dependencyGraph: { ok: false,
error: "..." }` and the `architecture` policy fails with a rationale saying evaluation _could not be
performed_ — never silently reinterpreted as "architecture passed" or folded into an ordinary rule
violation.

## Execution layers

Three distinct layers, each with exactly one canonical implementation (see
`scripts/run-test-category.mjs`'s own header comment) — a change to, say, an `include` glob is made
once, not three times:

```text
Developer / CI:  npm run test:unit          →  node scripts/run-test-category.mjs unit
repo-contract:   test-unit check's `run`    →  ["node","scripts/run-test-category.mjs","unit","--coverage","--reporter=json"]
CI:                                          →  npm run test:unit   (never redefines the command)
```

`repo-contract.config.ts` checks call tools directly, never `npm run <script>` — `npm run` interleaves
npm's own log lines with a tool's stdout, which would break every check's JSON parsing (true of every
check in this file, not just the new ones). `dependsOn` is used only where a check genuinely needs a
prior check's evidence (`coverage` needs the three test-* categories' artifact files; `mutation`
needs `suppression-governance`'s registry evidence, see `repo-contract.config.ts`'s own header
comment) — never to turn `repo-contract.config.ts` into a second, hidden orchestration engine.
`mutation`'s separate need to run last, only once every non-isolated check has settled, is
scheduling-only, expressed via `isolated` rather than `dependsOn` (ADR 0003). npm/CI runs verification; repo-contract
observes and evaluates
it.

`npm run test:watch` is an explicit dev-convenience aggregate (unit+integration+property, e2e
excluded as slow) — not a sixth verification category.

## Rejected categories

Not "repo-contract can't support these" — "this repository doesn't currently need a separate
demonstration of them, because an accepted category already demonstrates the more important
integration principle involved," with two genuine not-applicable exceptions noted inline.

| Candidate                              | Redirect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract testing (Pact-style)          | No independent network consumers to model; already covered by API compatibility. The one real gap — runtime `Evidence`/`Verdict` never validated against the _published_ `schemas/*.schema.json` — is closed by ajv-based schema-conformance tests (`test/unit/schema/schema-conformance.test.ts`) inside the existing **Golden/snapshot contracts** category, kept as an explicitly distinct question even though co-located: "did the public contract change?" (API compatibility, static types) vs. "does runtime output conform to the declared contract?" (schema conformance, real values).                                                                                                                                                                             |
| Security testing                       | `security-deps`/`security-secrets` and ESLint's `no-eval`/`no-implied-eval`/`no-new-func` already exist. New value: a narrowly-scoped property test on the tokenizer proving exactly "malformed input cannot produce unintended argument-boundary splitting" — never a "secure against injection" claim, penetration-test coverage, or vulnerability-free claim.                                                                                                                                                                                                                                                                                                                                                                                                              |
| ~~Accessibility testing~~ (superseded) | Rejected at the time this table was first written, when no UI/DOM/browser surface existed in this package. Superseded once `docs/` (a real landing page with DOM/browser surface) was added: this repository now runs a real `accessibility` check (`pa11y` against `docs/index.html`, driving an actual headless-Chromium accessibility tree — see [ADR 0009](decisions/0009-self-hosting-tool-and-dependency-choices.md)'s "Accessibility testing" section for why `pa11y` specifically, and the verification matrix above's category list, which this file's "remaining existing categories" note in the Verification matrix section covers). Kept as a struck-through row, not deleted, so the original applicability reasoning and its later reversal both stay visible. |
| Fuzz testing                           | Scoped rejection specific to this repository (not a universal equivalence claim): no native/memory-unsafe parsing boundary exists, and the parsers are already exception-safe by design, so a dedicated coverage-guided fuzzing harness isn't justified at the current risk profile. Property-based generation already demonstrates the relevant integration principle. Revisit if a binary-format parser or native binding is ever added.                                                                                                                                                                                                                                                                                                                                    |
| Concurrency/race-condition testing     | Single-threaded Node event loop — no shared-memory data races, only async-ordering bugs, exactly what generated-input property tests over `concurrency-pool.ts`/`dependency-scheduler.ts` catch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Resilience/fault-injection testing     | Already the default style of this repo's unit tests (real timeouts, real SIGTERM, real ENOENT — see `spawn-check.test.ts`, `process-tree.test.ts`, `abort-signals.test.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Compatibility/interoperability testing | Achieved by CI's existing OS × Node-version matrix (an execution-_environment_ concern applied across categories, not a new semantic one). The one real gap — CJS `require()` never tested, only ESM `import` — is closed as a new case inside **E2E** (`test/e2e/consumer-install.test.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Serialization/deserialization testing  | Round-trip correctness is a property; folds into **Property-based testing**, scoped only to functions whose contract explicitly promises round-tripping (`parseJson`/`parseText`) — not a blanket claim over every parser.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Migration/upgrade testing              | No persisted state this package ever reads back and migrates — `Evidence`/`Verdict` are produced fresh every run. Not applicable. Version-literal discipline is already enforced by the `api-contract` check's `schema-version-literal-stale` detection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Resource/lifecycle testing             | Already the substance of `process-tree.test.ts`/`abort-signals.test.ts`'s real-process-cleanup assertions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Determinism/reproducibility testing    | Expressed as property tests only where determinism is an actual documented contract (`tokenizeRunString`, the api-contract classifier's change-id generation) — never a blanket `f(x) === f(x)` over arbitrary functions, since some evidence (timestamps, durations) is intentionally nondeterministic. Also expressed by the existing api-contract baseline-comparison mechanism (Golden/snapshot contracts).                                                                                                                                                                                                                                                                                                                                                               |
| Boundary/validation testing            | A testing _discipline_, not a distinct tool/runner/evidence-shape of its own — practiced within Unit tests (named edge cases in `validate-config.test.ts`) and generalized by Property-based testing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| State-machine/model-based testing      | Not a separate tool from property-based testing — fast-check's own `fc.commands` API. One concrete model-based test (`spawn-check.status.property.test.ts`) lives inside **Property-based testing**, labeled as a distinct sub-methodology, not a separate command/category.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Compliance/invariant testing           | No regulatory scope for this package. "Invariant" testing here is just unit/property tests aimed at a documented ADR (e.g. ADR 0001) — new architecture rules are comment-tagged with the ADR they protect instead of inventing a category.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Complements to existing categories

Two small additions to categories that already existed, not new top-level categories:

- **Golden/snapshot contracts**: `test/unit/schema/schema-conformance.test.ts` validates real,
  runtime `Evidence`/`Verdict` objects against the published `schemas/*.schema.json` via ajv — closing
  a real gap (nothing previously checked that runtime _values_ conform to the schema this package
  publishes for external consumers to validate against; API Extractor only analyzes _types_
  statically).
- **End-to-end / package-acceptance**: a CJS `require()` case was added alongside the existing ESM
  `import` case in `test/e2e/consumer-install.test.ts`, since the package ships both entry points
  (`dist/index.js` and `dist/index.cjs`) but only the ESM path was previously exercised end-to-end.

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

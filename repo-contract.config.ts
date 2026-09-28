/**
 * repo-contract's own self-hosting contract -- the package validating
 * itself using itself, exercising the real public API against real checks
 * with real policies (see specs/architecture.md and CONTRIBUTING.md). Run
 * via `npm run contract` (scripts/run-contract.mjs).
 *
 * Each check's own `run`/`policy` lives in its own file under checks/, or --
 * for the checks a published preset now covers, see the note further down
 * -- in src/presets/, or -- for `api-contract`/`api-docs-report`, see the note further down still --
 * imported directly from `internal-package-contract` (IPC), the shared devDependency this
 * repository, env-cap, and data-cap all now consume for exactly this kind of fleet-wide check. This
 * file owns only the dependency graph between them, and their
 * declaration order (see specs/decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md):
 * declaration order is the required topological order, and drives real scheduling, not just
 * documentation -- a `dependsOn` id must be declared earlier than the check declaring it, and an
 * `isolated` check is a full barrier at its own declared position.
 *
 * The `checks` object below is organized in three declaration-order phases, relying on that
 * barrier semantics rather than per-check `dependsOn` wiring wherever possible:
 *
 * 1. **Writers** -- `suppression-governance`, `api-docs-report`, `lint`,
 *    `format`, `schema` -- every check that writes to a file other checks (or a human) later reads.
 *    Declared first so nothing reads their output before it's written. `api-docs-report`
 *    (IPC's generic `npmScriptCheck` factory wired to this repo's own `docs:api:report` script --
 *    TypeDoc + typedoc-plugin-markdown, reading `src/**` directly, no build required) genuinely
 *    regenerates `docs/api-report/*.md` on every run, failing only if that regeneration produces a
 *    diff from what's already committed -- a real write, unlike `api-contract` below, which is why
 *    it stays here rather than among the readers.
 *    `lint` (`eslint --fix`/`oxlint --fix`) and `format` (`prettier --write .`) both rewrite the
 *    whole source tree in place, and `schema` regenerates `schemas/*.schema.json` plus
 *    `scripts/suppression-governance/disable-comments.schema.json` from their source types -- all
 *    three belong here, not among the readers below, for the same reason as the original four: a
 *    reader that concurrently reads or lints the same files (`test-unit`'s
 *    `test/unit/schema/schema-conformance.test.ts` parsing the generated schemas, `typecheck`/
 *    `architecture`/`crap`/`duplication`/`security-secrets`/`dead-code`/`security-network` all
 *    reading `src/**`) must never race an in-place rewrite of that same content -- confirmed safe
 *    to co-locate with the original four writers: `lint`/`format` never touch any of
 *    suppression-governance's/api-docs-report's/schema's own generated output
 *    (`.prettierignore`/each ESLint `files` glob excludes every one of them by path or extension),
 *    and `schema` only ever reads its own TypeScript source types, never another writer's output.
 *    `lint` and `format` do rewrite the same files as each other, though, so `format` carries an
 *    explicit `dependsOn: ["lint"]` -- phase co-location alone does not serialize two writers.
 * 2. **`build`** (`isolated: true`) -- verifies the writers' output still compiles (now including
 *    whatever `lint --fix`/`format --write` just rewrote, not just the original four writers'
 *    output). Because it's declared right after every writer and is itself a scheduling barrier, it
 *    automatically depends on all of them (nothing is declared before it except writers) and every
 *    check declared after it automatically waits for it -- zero per-check `dependsOn` wiring needed
 *    on either side.
 * 3. **Readers** -- everything else: every check that only reads and reports, run concurrently
 *    against the now-built, now-written state. `api-contract` (also IPC-sourced -- see the note
 *    further down) is declared first among them, immediately after the build barrier, because
 *    unlike `api-docs-report` above it needs a fresh `dist/.dts/` (diffed against each entry
 *    point's committed baseline under `.repo-contract/api-contract/<target>/`), not source read
 *    directly -- the same reasoning IPC's own `contract.ts` documents for its identical placement.
 *    It can still write, rarely: bootstrapping a target's baseline the first time it's ever checked
 *    (see internal-package-contract's `scripts/api-contract/update-baseline.ts`), the one case this
 *    repository's own former copy of this engine also called out; its position here remains
 *    conservative for that reason even though nothing else reads its output afterward. `coverage`,
 *    `crap`, and `mutation` still attach their own genuine evidence dependencies via `dependsOn`
 *    (see each one's own note below) --
 *    `isolated`/declaration order alone only ever expresses "wait for the build," never a specific
 *    sibling's evidence. `test-unit` and `test-integration` are also `isolated: true`, for the same
 *    pure-scheduling, resource-contention reason as `mutation` below -- see their own note at their
 *    declaration site.
 *
 * - `coverage` depends on `test-unit`/`test-integration`/`test-property` --
 *   it only aggregates+reports the coverage artifacts those three already
 *   produced (see scripts/check-coverage.mjs); it never executes a test
 *   itself.
 * - `crap` depends on `coverage` -- it reads that same aggregate coverage
 *   artifact, never a separately-computed one.
 * - `mutation` depends on `suppression-governance` -- its own policy reads
 *   that check's evidence to verify every Stryker-domain suppression in the
 *   registry before trusting a comment-ignored mutant (see
 *   specs/decisions/0006-suppression-governance.md).
 *   Separately, `mutation` is also `isolated: true` (declared in its own
 *   check file, checks/mutation.ts, not here -- unlike `dependsOn` it names
 *   no other check, so it needs no assembly-time context): Stryker spawns
 *   its own concurrent worker processes internally, and running it
 *   alongside this repository's own full concurrent test suite starves
 *   timing margins elsewhere under heavy load -- a real, observed flake in
 *   run-checks.test.ts's SIGINT-cleanup test, caused by resource contention
 *   rather than a logic bug. `isolated` is pure scheduling, not a data
 *   dependency on any other check's evidence -- see
 *   specs/decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md. `mutation` is declared near the
 *   end of the readers so its barrier blocks as little as possible.
 *   `test-unit`/`test-integration` earn the identical `isolated: true` treatment for the identical
 *   reason -- both spawn real, heavy child processes per test (`tsc`, real `git`) on top of
 *   Vitest's own internal worker pool, and running either concurrently with the rest of this
 *   phase's reader fleet reproduced the same class of flake `mutation` was isolated for, this time
 *   surfacing as a generic Vitest `STACK_TRACE_ERROR` on a different, unrelated handful of cases
 *   each run -- see their own declaration-site comment.
 *
 * `coverage`, `crap`, and `mutation` therefore attach their `dependsOn`
 * here, at assembly, rather than in their own check file -- this is the one
 * place every check id is actually in scope to depend on.
 *
 * `typecheck`, `format`, `license`, `publint`, `arethetypeswrong`,
 * `security-secrets`, and `duplication` are NOT defined under checks/ --
 * they're consumed directly from `src/presets/`, the same published preset
 * catalog an outside consumer would import via `repo-contract/presets` (see
 * specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md). This repository dogfoods
 * its own public presets rather than maintaining a parallel private copy;
 * where a value needs to differ from a preset's generic default
 * (`duplication`'s scanned path), it's supplied via factory options, the
 * preferred mechanism. `arethetypeswrong` goes further still -- see that
 * check's own inline comment below -- because this repository's multiple
 * entrypoints trigger a real upstream attw bug no `run`-spread override
 * alone could work around.
 *
 * `api-contract` and `api-docs-report` are likewise NOT defined under checks/ -- they're imported
 * directly from `internal-package-contract` (`internal-package-contract/checks/api-contract`,
 * `internal-package-contract/checks/npm-script`'s generic factory). This repository used to host
 * both engines itself (`checks/api-contract.ts` + `scripts/api-contract/*`, `checks/api-docs.ts` +
 * `scripts/api-docs/*` + `scripts/api-docs-html/*`); they moved out to IPC once this repository's
 * own migration off release-please onto Changesets meant every repo in the fleet -- repo-contract,
 * env-cap, data-cap -- needed the identical "does this branch's declared semver bump cover its real
 * API diff" rule, not a Conventional-Commits-flavored original here and a Changesets-flavored port
 * there. IPC's own `contract.ts` documents the mirror image of this note: repo-contract is the one
 * fleet member whose *published* runtime code IPC itself imports and wraps (every `checks/*.ts` in
 * IPC calls real `defineRepoContract`/`runRepoContract`), which is why that direction's own sync
 * workflow (`sync-repo-contract-version.yml`) adds a changeset on every bump and this repository's
 * own listener (`sync-internal-package-contract.yml`, added alongside this migration) does not --
 * see that workflow's own comment. `api-docs-report` replaces the committed API-Extractor-format
 * `docs/api-report/*.api.md` reports with TypeDoc + `typedoc-plugin-markdown` output instead (see
 * `typedoc.json`/`typedoc.markdown.json`); `api-contract` replaces API Extractor's own contract
 * diffing with the identical engine, still API-Extractor-backed under the hood, just no longer a
 * private copy of it.
 *
 * `dead-code` and `security-deps` are the two deliberate exceptions: neither
 * uses its own published preset (both still published, unchanged, for
 * external consumers) -- each self-hosts a `checks/*.ts` instead, reconciling
 * a `.repo-contract/exceptions/*.json` registry against every raw finding.
 * `dead-code` (`checks/dead-code.ts` / `scripts/dead-code/check.ts`) runs
 * knip with no config-time exempt list at all; see that check's own doc
 * comment and specs/decisions/0008-self-hosting-tool-and-dependency-choices.md's
 * amendment for why: a preset's `exemptUnusedDevDependencies` option needs
 * its exempt list before knip ever runs, which a *reconciled* registry
 * structurally cannot supply (the registry that would suppress a finding can
 * only be built from findings that already ran unsuppressed). `security-deps`
 * (`checks/security-deps.ts`) exists for the identical structural reason,
 * generalized: the published `securityDeps` preset only ever reports a raw
 * `npm audit` count, with no way to accept a specific, justified, reviewable
 * finding at all -- the earlier alternative (silently filtering a
 * hardcoded in-source package-name Set before the preset ever saw the
 * report) is exactly the unreviewable shortcut `security-socket.ts`'s own
 * exception-policy model exists to replace; `security-deps.ts` reuses that
 * identical model (see specs/decisions/0013-reusable-exception-policy-helper.md)
 * instead of a second one-off.
 */
import crossSpawn, { sync as crossSpawnSync } from "cross-spawn"
import { apiContract } from "internal-package-contract/checks/api-contract"
import { npmScriptCheck } from "internal-package-contract/checks/npm-script"
import { accessibility } from "./checks/accessibility.js"
import { adrGovernance } from "./checks/adr-governance.js"
import { coderabbitai } from "./checks/coderabbitai.js"
import { architecture } from "./checks/architecture.js"
import { build } from "./checks/build.js"
import { coverage } from "./checks/coverage.js"
import { crap } from "./checks/crap.js"
import { deadCode } from "./checks/dead-code.js"
import { docs } from "./checks/docs.js"
import { githubActions } from "./checks/github-actions.js"
import { lint } from "./checks/lint.js"
import { iso12207Alignment } from "./checks/iso-12207-alignment.js"
import { mutation } from "./checks/mutation.js"
import { openssfScorecard } from "./checks/openssf-scorecard.js"
import { presetCommands } from "./checks/preset-commands.js"
import { schema } from "./checks/schema.js"
import { securityDeps } from "./checks/security-deps.js"
import { securityNetwork } from "./checks/security-network.js"
import { securitySocket } from "./checks/security-socket.js"
import { size } from "./checks/size.js"
import { suppressionGovernance } from "./checks/suppression-governance.js"
import { testE2e } from "./checks/test-e2e.js"
import { testIntegration } from "./checks/test-integration.js"
import { testProperty } from "./checks/test-property.js"
import { testUnit } from "./checks/test-unit.js"
import { defineRepoContract } from "./src/index.js"
import type { PolicyContext } from "./src/index.js"
import type { AttwReport } from "./src/presets/arethetypeswrong.js"
import { evaluateAttwReport } from "./src/presets/arethetypeswrong.js"
import { readJsonReport } from "./src/presets/shared/read-json-report.js"
import {
  commitlint,
  duplication,
  format,
  license,
  publint,
  securitySecrets,
  typecheck,
} from "./src/presets/index.js"

export default defineRepoContract({
  // repo-contract's own checks are exactly the kind of npm-installed CLI
  // tools (eslint, tsc, vitest, prettier, ...) that resolve to `.cmd` shims
  // on Windows -- cross-spawn is the right choice *here*, as a devDependency
  // of this repository's own self-hosting tooling, even though the
  // published library no longer carries it as a runtime dependency of its
  // own. See specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md.
  spawn: crossSpawn,
  // eslint-disable-next-line n/no-process-env -- this is the top-level self-hosting config, not published library code (see package.json's "files"); supplying the real ambient environment to repo-contract's own checks is exactly what this repository, as a consumer, is supposed to do.
  env: process.env,
  // Windows-only: lets a timed-out/aborted/host-SIGINT-killed check's full process tree (not just
  // its immediate process) actually get cleaned up on the windows-latest CI runner -- see
  // RepoContractConfig.killProcessTree's own doc comment. cross-spawn's own `sync` export matches
  // node:child_process.spawnSync's shape.
  killProcessTree: crossSpawnSync,
  checks: {
    // -- Writers --
    "suppression-governance": suppressionGovernance,
    // IPC's generic npm-script factory, wired to this repo's own `docs:api:report` script
    // (TypeDoc + typedoc-plugin-markdown, reading src/** directly -- no dist/ dependency).
    // `mustNotChange: ["docs/api-report"]` reruns that generation through a hash-diff wrapper and
    // fails if it regenerates anything, i.e. the committed report is stale. See module doc comment.
    "api-docs-report": npmScriptCheck({
      script: "docs:api:report",
      label: "API docs report",
      mustNotChange: ["docs/api-report"],
    }),
    // Rewrites the whole source tree in place (`eslint --fix`/`oxlint --fix`) -- a writer, not a
    // reader, for the same reason format/schema below are: a reader that concurrently lints or
    // reads the same files it's rewriting must never race that rewrite. See module doc comment.
    lint,
    // Rewrites the whole source tree in place (`prettier --write .`) -- same reasoning as `lint`
    // above. `.prettierignore` already excludes every other writer's own generated output
    // (schemas/*.schema.json, .repo-contract -- which now also holds the suppression registry
    // .repo-contract/exceptions/disable-comments.json -- docs/api-report), so co-locating it here
    // introduces no new race against those. `dependsOn: ["lint"]` because
    // `lint` and `format` are the only two writers that rewrite the *same* files (`src/**`):
    // co-location in this phase keeps readers off that content but does not serialize the two
    // writers against each other, so an explicit edge does.
    format: { ...format, dependsOn: ["lint"] },
    // Regenerates schemas/*.schema.json and disable-comments.schema.json from their source types
    // -- a writer `test-unit` (test/unit/schema/schema-conformance.test.ts parses the generated
    // files) and `security-secrets` (scans them for secrets) both read. Declared here, not among
    // the readers below, for the same "don't race a concurrent rewrite" reason as `lint`/`format`
    // above -- confirmed safe: `schema` only ever reads its own TypeScript source types, never
    // another writer's output, so it has nothing to wait on within this phase.
    schema,

    // -- Build barrier -- verifies the writers' output still compiles; every reader below
    // automatically waits for it purely by declaration order (see module doc comment above).
    build: { ...build, isolated: true },

    // -- Readers --
    // IPC-sourced (internal-package-contract/checks/api-contract); needs a fresh dist/.dts/, unlike
    // api-docs-report above -- see module doc comment for why it's declared here, first among the
    // readers, rather than back among the writers. Diffs every entry point's real, current public
    // surface (index/presets/helpers) against its own committed baseline under
    // `.repo-contract/api-contract/<target>/` and fails when this branch's changesets under-declare
    // the resulting bump.
    "api-contract": apiContract,
    typecheck,
    // `isolated: true` on both `test-unit` and `test-integration` below is the same pure-scheduling
    // fix already applied to `mutation` (see that check's own comment and
    // specs/decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md), extended here
    // once this repository's own local runs started reproducing the identical symptom: both spawn
    // real, heavy child processes per test (`tsc`, real `git`) on top of Vitest's own internal
    // worker pool, and running either concurrently with the rest of this phase's reader fleet
    // (`accessibility`'s real headless Chrome, `dead-code`'s whole-project `knip` walk,
    // `coderabbitai`'s and `arethetypeswrong`'s own real subprocess spawns, etc.) oversubscribes the
    // machine -- confirmed by three consecutive full `npm run contract` runs each failing a
    // different, unrelated handful of `test-unit`/`test-integration` cases with a generic
    // `STACK_TRACE_ERROR`, every one of which passed cleanly when the same file was run alone.
    // Isolating both removes that contention exactly the way it already does for `mutation`; it
    // says nothing about either needing any other check's evidence.
    "test-unit": { ...testUnit, isolated: true },
    // `test/integration/suppression-governance/real-source.integration.test.ts`
    // reads disable-comments.json and asserts it's already synchronized with
    // real source; `suppression-governance`'s own check writes that same
    // file as a side effect of running. With no ordering between them, the
    // two race on that file concurrently -- confirmed: passed every time run
    // in isolation, failed when run concurrently with a stale registry (see
    // specs/decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md).
    // This dependsOn makes the registry write settle first, always, instead
    // of by scheduling luck -- the same fix already applied for `mutation`
    // below, which reads this same check's evidence for the same reason.
    // `dependsOn` stays even though `isolated` below already forces this check to run after every
    // earlier one (including `suppression-governance`) in a *full* run: `isolated` alone gives no
    // such guarantee on a partial `options.checks` run (e.g. `npm run contract -- test-integration`
    // by itself) -- only `dependsOn` pulls a required check into that run's transitive closure. See
    // this same distinction in `mutation`'s own comment below.
    "test-integration": {
      ...testIntegration,
      dependsOn: ["suppression-governance"],
      isolated: true,
    },
    // `isolated: true` here too, for a distinct but related reason discovered
    // running this repository's own contract end to end: `test-property` and
    // `test-integration` both real-git-fixture-test adr-governance and
    // diff-files.ts (mkdtemp'd, disposable repos, real `execFileSync("git",
    // ...)` calls -- see each test file's own doc comment; this list also
    // covered api-contract's own real-git integration test before it moved to
    // internal-package-contract's own suite alongside the rest of that engine
    // -- see module doc comment) -- concurrently-scheduled real git subprocess spawning was
    // observed, once, to write a fixture's own commits onto this checkout's
    // actual local branch instead of its intended scratch directory (a
    // handful of "establish baseline"/"add baseline"-style commits authored
    // `Test <test@example.com>`, never pushed, fully reproducible only under
    // a full, unfiltered `npm run contract` -- every individual check and
    // every partial combination tried in isolation, including `mutation`
    // alone despite its own concurrency: 4 Stryker workers, ran clean). Exact
    // mechanism unconfirmed (a real OS/Node-level `cwd` race under extreme
    // concurrent subprocess load is suspected, not a single fixture's own
    // isolation bug -- test/integration/install-hooks/install-hooks.integration.test.ts's
    // two calls missing GIT_CEILING_DIRECTORIES were a real, separate,
    // already-fixed bug, and every git-fixture test's own git() helper now
    // sets it too, but the corruption still reproduced afterward). Isolating
    // every real-git-fixture-spawning check removes the concurrent-subprocess
    // load implicated either way, the same defense already applied to
    // `test-unit`/`test-integration`/`mutation` for their own oversubscription
    // symptom above.
    "test-property": { ...testProperty, isolated: true },
    architecture,
    // GitHub Actions correctness + security via actionlint (see checks/github-actions.ts). A pure
    // reader -- lints `.github/workflows/*` and touches nothing; needs no build, declared here only
    // to keep it in the concurrently-scheduled reader phase.
    "github-actions": githubActions,
    coverage: { ...coverage, dependsOn: ["test-unit", "test-integration", "test-property"] },
    crap: { ...crap, dependsOn: ["coverage"] },
    "test-e2e": { ...testE2e, isolated: true },
    size,
    duplication: duplication({ path: "src" }),
    publint,
    // Redirects to a file rather than spreading the preset's stdout-based
    // `run`/`policy` -- see scripts/run-attw-to-file.mjs for why (a real,
    // reproducible attw bug this repository's own multiple entrypoints
    // trigger). `evaluateAttwReport` (exported from the preset module for
    // exactly this situation) keeps the interpretation logic itself
    // identical to the published preset's own policy.
    arethetypeswrong: {
      run: ["node", "scripts/run-attw-to-file.mjs"],
      policy: async () => {
        const { readFile } = await import("node:fs/promises")
        const parsed = await readJsonReport<AttwReport>(
          () => readFile("reports/arethetypeswrong.json", "utf8"),
          "@arethetypeswrong/cli did not produce its expected JSON report.",
          "@arethetypeswrong/cli produced invalid JSON evidence.",
        )
        return parsed.ok ? evaluateAttwReport(parsed.value) : parsed.result
      },
    },
    // `run` override (README's "Preset options are the preferred way..., a direct run override is
    // an escape hatch"): the published `license` preset's default `run` is `--osi`-only.
    // `minimatch` (src/helpers/exception-policy.ts's real, first runtime `dependencies` entry --
    // see specs/decisions/0013-reusable-exception-policy-helper.md) declares SPDX `BlueOak-1.0.0`,
    // which `licensee`'s own OSI classification does not recognize as approved, even though it is
    // Blue Oak Council Gold-rated (a permissive, MIT-equivalent license by design; Blue Oak
    // deliberately did not pursue OSI approval, treating it as unnecessary bureaucracy for an
    // already-simple, already-permissive license). `licensee` ships first-class support for
    // exactly this distinction via `--blueoak=<rating>`, added here as an additional acceptance
    // criterion alongside (not instead of) `--osi` -- this repository's own self-hosting config
    // only, not a change to the published preset's default behavior for other consumers.
    license: {
      ...license,
      run: ["licensee", "--production", "--osi", "--blueoak=gold", "--errors-only", "--ndjson"],
      // The published preset's own pass rationale ("...non-OSI-approved license") is worded for
      // its default --osi-only `run` -- `--blueoak=gold` above widens the acceptance criterion, so
      // a dependency accepted via Blue Oak Gold rather than OSI approval (minimatch, per this
      // entry's own comment above) must never be described by a rationale implying OSI was the
      // only test applied; a reader trusting that rationale alone would wrongly conclude every
      // production dependency is specifically OSI-approved. Wraps the preset's own policy (which
      // still does all the real stdout parsing/interpretation) and rewrites only that one known,
      // exact stock string -- every other outcome (fail, missing dependency, abnormal termination)
      // passes through unchanged.
      // Explicitly typed (rather than left for contextual inference, like every other check
      // below) -- an untyped `async (ctx) =>` here previously widened `defineRepoContract`'s own
      // `TChecks` inference for the *entire* `checks` object, surfacing as spurious `Type 'string'
      // is not assignable to type 'never'` errors on unrelated `dependsOn` arrays elsewhere in this
      // same file. `PolicyContext` is the exact type `license.policy` (imported above) itself
      // expects.
      policy: async (ctx: PolicyContext) => {
        const result = await license.policy(ctx)
        if (
          result.outcome === "pass" &&
          result.rationale ===
            "licensee found 0 production dependencies with a non-OSI-approved license."
        ) {
          return {
            outcome: "pass",
            rationale:
              "licensee found 0 production dependencies without an OSI-approved or Blue Oak Gold-rated license.",
          }
        }
        // The preset's own failure heading has the identical --osi-only wording problem as its
        // pass rationale above -- a failed run here would otherwise report a stricter policy
        // ("without an OSI-approved license") than the one actually enforced (also accepting Blue
        // Oak Gold), leaving a reader unable to tell from the rationale alone whether a listed
        // dependency's license was rejected by both criteria or just misreported. The dynamic
        // per-dependency detail lines that follow are untouched.
        if (result.outcome === "fail") {
          return {
            ...result,
            rationale: result.rationale.replace(
              "without an OSI-approved license:",
              "without an OSI-approved or Blue Oak Gold-rated license:",
            ),
          }
        }
        return result
      },
    },
    docs,
    accessibility,
    "security-deps": securityDeps(),
    "security-secrets": securitySecrets,
    "dead-code": deadCode,
    "adr-governance": adrGovernance,
    // Conventional Commits are the sole versioning input (Changesets derives the bump +
    // changelog from them); commitlint enforces the format across `origin/main..HEAD`. See
    // specs/decisions/0009-conventional-commits-versioning-and-local-gates.md. A pure reader -- it runs the
    // `commitlint` binary against git history and touches nothing.
    commitlint: commitlint(),
    "security-network": securityNetwork,
    // The reconciled successor to network-surface.mjs's former ALLOWED_PRESET_COMMANDS allowlist
    // (ADR 0007's amendment): every external command a published preset spawns is held to a
    // reviewed record in .repo-contract/exceptions/preset-commands.json.
    "preset-commands": presetCommands,
    // New security check built on the repo-contract/helpers exception-policy primitive (see
    // specs/decisions/0013-reusable-exception-policy-helper.md) -- `unavailable` (the CLI isn't
    // installed, or this environment holds no Socket org token, as is the case for this
    // repository's own CI today) is a warn, not a hard dependency on real Socket credentials
    // existing everywhere this contract runs.
    "security-socket": securitySocket,
    // Promotes the former local-only `coderabbit review --agent` pre-push shell step (see
    // .githooks/pre-push and specs/decisions/0014-coderabbit-as-a-surfaced-check.md) into a real,
    // always-declared check -- `not-applicable`/`unavailable` (CI, no CLI installed, a detached
    // checkout) is a warn on every single run, by design: a local skip must surface the exact same
    // warning CI always shows, never a silent pass.
    coderabbitai,
    // `dependsOn: ["security-deps"]` here (not in checks/openssf-scorecard.ts) --
    // see this file's own doc comment on why `coverage`/`crap`/`mutation`
    // attach `dependsOn` at assembly instead of in their own check file. A
    // genuine evidence dependency: `policy` reads
    // `dependencies["security-deps"]` for the Vulnerabilities sub-check
    // rather than re-running `npm audit` a second, potentially-divergent time.
    "openssf-scorecard": { ...openssfScorecard, dependsOn: ["security-deps"] },
    // Declared last among the readers so its own scheduling barrier (see checks/mutation.ts and
    // this file's own doc comment) blocks as little else as possible.
    mutation: { ...mutation, dependsOn: ["suppression-governance"] },
    // Declared after `mutation`, and `dependsOn: ["coverage", "mutation"]` --
    // pure scheduling, the same kind `coverage`/`crap` already use above,
    // not a `dependencies[...]` evidence read: this check's own "run"
    // script reads coverage/aggregate/coverage-summary.json and
    // reports/mutation/mutation.json straight off disk (see
    // scripts/iso-12207-alignment/gather-evidence.ts), and those files are
    // only fresh once `coverage` and `mutation` have actually run this pass
    // -- without this ordering, the report could silently cite a PREVIOUS
    // run's stale numbers instead of this run's.
    "iso-12207-alignment": { ...iso12207Alignment, dependsOn: ["coverage", "mutation"] },
  },
})

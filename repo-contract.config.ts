/**
 * repo-contract's self-hosting contract: the package checks itself through its own public API,
 * with real checks and real policies (see specs/architecture.md and CONTRIBUTING.md). Run it with
 * `npm run contract` (scripts/run-contract.mjs).
 *
 * Checks come from three places. Most have a `run` and `policy` under checks/. Checks a published
 * preset covers come from src/presets/. Shared fleet checks come from `internal-package-contract`
 * (IPC), the devDependency this repository, env-cap and data-cap all consume.
 *
 * This file owns the dependency graph and the declaration order. Declaration order is the
 * topological order and drives scheduling (see
 * specs/decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md). A `dependsOn` id
 * must be declared before the check that names it. An `isolated` check is a full barrier at its
 * position.
 *
 * The `checks` object uses three phases, so barriers replace most per-check `dependsOn` wiring:
 *
 * 1. **Writers** (`suppression-governance`, `api-docs-report`, `sbom`, `lint`, `format`,
 *    `schema`) write files that other checks or people read, so they come first.
 *    - `api-docs-report` regenerates `docs/api-report/*.md` from `src/**` with TypeDoc and fails
 *      on a diff. It needs no build, unlike `api-contract`.
 *    - `sbom` regenerates `docs/sbom.cdx.json` with `@cyclonedx/cyclonedx-npm`. The output is
 *      byte-identical run to run, so the clean-tree CI step needs no exclusion for it. It reads
 *      no other check's evidence, unlike `openssf-scorecard`, so it can sit here.
 *    - `lint` and `format` rewrite the source tree in place, and `schema` regenerates
 *      `schemas/*.schema.json`. A reader of the same files (`test-unit`'s schema-conformance test,
 *      `typecheck`, `architecture`, `crap` and others) must never race those rewrites.
 *    - `.prettierignore` and the ESLint `files` globs exclude every other writer's output, and
 *      `schema` reads only its own source types. So the writers do not race each other, except
 *      `lint` and `format`, which rewrite the same files: `format` has `dependsOn: ["lint"]`.
 * 2. **`build`** (`isolated: true`) proves the writers' output still compiles. As a barrier
 *    declared after every writer, it waits for all of them, and every later check waits for it.
 * 3. **Readers** (everything else) only read and report, concurrently.
 *    - `api-contract` comes first. It needs a fresh `dist/.dts/` to diff against each entry
 *      point's baseline under `.repo-contract/api-contract/<target>/`. It writes only when it
 *      bootstraps a missing baseline (IPC's `scripts/api-contract/update-baseline.ts`).
 *    - `coverage`, `crap` and `mutation` attach evidence dependencies with `dependsOn`, because
 *      declaration order only expresses "wait for the build".
 *    - `test-unit`, `test-integration` and `mutation` are `isolated: true` for resource
 *      contention, not data. Each spawns heavy child processes. Running them beside the other
 *      readers caused real flakes: the SIGINT-cleanup test in run-checks.test.ts, and Vitest
 *      `STACK_TRACE_ERROR`s. `mutation` sets `isolated` in checks/mutation.ts and is declared near
 *      the end, so its barrier blocks as little as possible.
 *
 * The evidence dependencies:
 *
 * - `coverage` depends on `test-unit`, `test-integration` and `test-property`. It only
 *   aggregates the coverage those three produced (scripts/check-coverage.mjs).
 * - `crap` depends on `coverage` and reads that same aggregate.
 * - `mutation` depends on `suppression-governance`. Its policy checks each Stryker suppression
 *   against the registry before it trusts an ignored mutant
 *   (specs/decisions/0006-suppression-governance.md).
 *
 * They are attached here, not in each check file, because this is the one place every check id is
 * in scope.
 *
 * `typecheck`, `format`, `license`, `publint`, `arethetypeswrong`, `security-secrets` and
 * `duplication` come from `src/presets/`, the catalog a consumer imports from `repo-contract/presets`
 * (specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md). This
 * repository uses its own presets instead of a private copy. Where a value differs from a preset's
 * default (`duplication`'s scanned path), a factory option supplies it. `arethetypeswrong` also
 * overrides `run`, because this repository's several entry points trigger an upstream attw bug (see
 * its inline comment).
 *
 * `api-contract` and `api-docs-report` come from IPC. This repository hosted both engines until
 * the fleet moved from release-please to Changesets. Then repo-contract, env-cap and data-cap all
 * needed the same rule: the declared semver bump must cover the real API diff. `api-contract` still
 * uses API Extractor underneath. `api-docs-report` writes TypeDoc Markdown (`typedoc.json`,
 * `typedoc.markdown.json`) in place of API Extractor reports. IPC imports repo-contract's runtime,
 * so IPC's `sync-repo-contract-version.yml` adds a changeset on every bump. This repository's
 * `sync-internal-package-contract.yml` does not (see that workflow's comment).
 *
 * `dead-code` and `security-deps` do not use their published presets, which stay unchanged for
 * consumers. Each runs a `checks/*.ts` that reconciles a `.repo-contract/exceptions/*.json`
 * registry against every raw finding. A preset's `exemptUnusedDevDependencies` list must exist
 * before knip runs, and a reconciled registry is built from findings, so it cannot supply one
 * (specs/decisions/0008-self-hosting-tool-and-dependency-choices.md, amendment). The `securityDeps`
 * preset reports only a raw `npm audit` count, with no way to accept a justified finding. So
 * `security-deps` reuses the exception-policy model of `security-socket.ts`
 * (specs/decisions/0013-reusable-exception-policy-helper.md).
 */
import crossSpawn, { sync as crossSpawnSync } from "cross-spawn"
import { agentSkillCheck } from "internal-package-contract/checks/agent-skill"
import { ambientCapabilitiesCheck } from "internal-package-contract/checks/ambient-capabilities"
import { apiContract } from "internal-package-contract/checks/api-contract"
import { gitHygiene } from "internal-package-contract/checks/git-hygiene"
import { promptBlocksCheck } from "internal-package-contract/checks/prompt-blocks"
import { engineMatrixCheck } from "internal-package-contract/checks/engine-matrix"
import { noMinify } from "internal-package-contract/checks/no-minify"
import { packedConsumerCheck } from "internal-package-contract/checks/packed-consumer"
import { docsFragments } from "internal-package-contract/checks/docs-fragments"
import { cleanCheckoutCheck } from "internal-package-contract/checks/clean-checkout"
import { landingPageCheck } from "internal-package-contract/checks/landing-page"
import { branchProtection } from "internal-package-contract/checks/branch-protection"
import { benchmarkGuides } from "internal-package-contract/checks/benchmark-guides"
import { benchmarkComplexityCheck } from "internal-package-contract/checks/benchmark-complexity"
import { securityDevDeps } from "internal-package-contract/checks/security-dev-deps"
import { codeScanning } from "internal-package-contract/checks/code-scanning"
import { envContractCheck } from "internal-package-contract/checks/env-contract"
import { generatedRegionsCheck } from "internal-package-contract/checks/generated-regions"
import { managedFilesCheck } from "internal-package-contract/checks/managed-files"
import { npmScriptCheck } from "internal-package-contract/checks/npm-script"
import { pinConsistency } from "internal-package-contract/checks/pin-consistency"
import { proseCheck } from "internal-package-contract/checks/prose"
import { readmeStructureCheck } from "internal-package-contract/checks/readme-structure"
import { scorecardWorkflowCheck } from "internal-package-contract/checks/scorecard-workflow"
import { surfaceContract } from "internal-package-contract/checks/surface-contract"
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
import { mutation } from "./checks/mutation.js"
import { openssfScorecard } from "./checks/openssf-scorecard.js"
import { presetCommands } from "./checks/preset-commands.js"
import { sbom } from "./checks/sbom.js"
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
  distNoUrls,
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
  // on Windows: cross-spawn is the right choice *here*, as a devDependency
  // of this repository's own self-hosting tooling, even though the
  // published library no longer carries it as a runtime dependency of its
  // own. See specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md.
  spawn: crossSpawn,
  // eslint-disable-next-line n/no-process-env -- this is the top-level self-hosting config, not published library code (see package.json's "files"); supplying the real ambient environment to repo-contract's own checks is exactly what this repository, as a consumer, is supposed to do.
  env: process.env,
  // Windows-only: lets a timed-out/aborted/host-SIGINT-killed check's full process tree (not just
  // its immediate process) actually get cleaned up on the windows-latest CI runner; see
  // RepoContractConfig.killProcessTree's own doc comment. cross-spawn's own `sync` export matches
  // node:child_process.spawnSync's shape.
  killProcessTree: crossSpawnSync,
  checks: {
    // (Writers)
    "suppression-governance": suppressionGovernance,
    // IPC's generic npm-script factory, wired to this repo's own `docs:api:report` script
    // (TypeDoc + typedoc-plugin-markdown, reading src/** directly: no dist/ dependency).
    // `mustNotChange: ["docs/api-report"]` reruns that generation through a hash-diff wrapper and
    // fails if it regenerates anything, i.e. the committed report is stale. See module doc comment.
    "api-docs-report": npmScriptCheck({
      script: "docs:api:report",
      label: "API docs report",
      mustNotChange: ["docs/api-report"],
    }),
    // Regenerates docs/sbom.cdx.json (a real CycloneDX SBOM for this repository's own npm
    // dependency graph) on every run via @cyclonedx/cyclonedx-npm: a real write, and, thanks to
    // `--output-reproducible` (scripts/sbom/spawn.ts), a byte-identical one given an unchanged
    // package-lock.json, so it needs no special exclusion from the "working tree is clean" CI gate
    // the way docs/OpenSSF-Scorecard.md does. Declared here rather than among the readers below
    // (where `openssf-scorecard`, which also writes a doc, lives) because it reads no other
    // check's evidence via `dependsOn`: see checks/sbom.ts's own module doc comment.
    sbom,
    // Rewrites the whole source tree in place (`eslint --fix`/`oxlint --fix`): a writer, not a
    // reader, for the same reason format/schema below are: a reader that concurrently lints or
    // reads the same files it's rewriting must never race that rewrite. See module doc comment.
    lint,
    // Rewrites the whole source tree in place (`prettier --write .`): same reasoning as `lint`
    // above. `.prettierignore` already excludes every other writer's own generated output
    // (schemas/*.schema.json, .repo-contract (which now also holds the suppression registry
    // .repo-contract/exceptions/disable-comments.json) docs/api-report), so co-locating it here
    // introduces no new race against those. `dependsOn: ["lint"]` because
    // `lint` and `format` are the only two writers that rewrite the *same* files (`src/**`):
    // co-location in this phase keeps readers off that content but does not serialize the two
    // writers against each other, so an explicit edge does.
    format: { ...format, dependsOn: ["lint"] },
    // Regenerates schemas/*.schema.json and disable-comments.schema.json from their source types:
    // a writer `test-unit` (test/unit/schema/schema-conformance.test.ts parses the generated
    // files) and `security-secrets` (scans them for secrets) both read. Declared here, not among
    // the readers below, for the same "don't race a concurrent rewrite" reason as `lint`/`format`
    // above: confirmed safe: `schema` only ever reads its own TypeScript source types, never
    // another writer's output, so it has nothing to wait on within this phase.
    schema,

    // (Build barrier) verifies the writers' output still compiles; every reader below
    // automatically waits for it purely by declaration order (see module doc comment above).
    build: { ...build, isolated: true },

    // (Readers)
    // IPC-sourced (internal-package-contract/checks/api-contract); needs a fresh dist/.dts/, unlike
    // api-docs-report above: see module doc comment for why it's declared here, first among the
    // readers, rather than back among the writers. Diffs every entry point's real, current public
    // surface (index/presets/helpers/affected/metrics) against its own committed baseline under
    // `.repo-contract/api-contract/<target>/` and fails when this branch's changesets under-declare
    // the resulting bump.
    "api-contract": apiContract,
    // IPC-sourced: diffs the CLI help (top level and every listed command) and the exported JSON
    // Schemas against .repo-contract/surface-contract/baseline.json, so a removed command, flag or
    // schema constraint needs a changeset at the right level. Needs the built bin, so it reads here.
    "surface-contract": surfaceContract(),
    typecheck,
    // `isolated: true` on both `test-unit` and `test-integration` below is the same pure-scheduling
    // fix already applied to `mutation` (see that check's own comment and
    // specs/decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md), extended here
    // once this repository's own local runs started reproducing the identical symptom: both spawn
    // real, heavy child processes per test (`tsc`, real `git`) on top of Vitest's own internal
    // worker pool, and running either concurrently with the rest of this phase's reader fleet
    // (`accessibility`'s real headless Chrome, `dead-code`'s whole-project `knip` walk,
    // `coderabbitai`'s and `arethetypeswrong`'s own real subprocess spawns, etc.) oversubscribes the
    // machine; confirmed by three consecutive full `npm run contract` runs each failing a
    // different, unrelated handful of `test-unit`/`test-integration` cases with a generic
    // `STACK_TRACE_ERROR`, every one of which passed cleanly when the same file was run alone.
    // Isolating both removes that contention exactly the way it already does for `mutation`; it
    // says nothing about either needing any other check's evidence.
    "test-unit": { ...testUnit, isolated: true },
    // `test/integration/suppression-governance/real-source.integration.test.ts`
    // reads disable-comments.json and asserts it's already synchronized with
    // real source; `suppression-governance`'s own check writes that same
    // file as a side effect of running. With no ordering between them, the
    // two race on that file concurrently. Confirmed: passed every time run
    // in isolation, failed when run concurrently with a stale registry (see
    // specs/decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md).
    // This dependsOn makes the registry write settle first, always, instead
    // of by scheduling luck: the same fix already applied for `mutation`
    // below, which reads this same check's evidence for the same reason.
    // `dependsOn` stays even though `isolated` below already forces this check to run after every
    // earlier one (including `suppression-governance`) in a *full* run: `isolated` alone gives no
    // such guarantee on a partial `options.checks` run (e.g. `npm run contract -- test-integration`
    // by itself): only `dependsOn` pulls a required check into that run's transitive closure. See
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
    // ...)` calls; see each test file's own doc comment; this list also
    // covered api-contract's own real-git integration test before it moved to
    // internal-package-contract's own suite alongside the rest of that engine:
    // see module doc comment); concurrently-scheduled real git subprocess spawning was
    // observed, once, to write a fixture's own commits onto this checkout's
    // actual local branch instead of its intended scratch directory (a
    // handful of "establish baseline"/"add baseline"-style commits authored
    // `Test <test@example.com>`, never pushed, fully reproducible only under
    // a full, unfiltered `npm run contract`; every individual check and
    // every partial combination tried in isolation, including `mutation`
    // alone despite its own concurrency: 4 Stryker workers, ran clean). Exact
    // mechanism unconfirmed (a real OS/Node-level `cwd` race under extreme
    // concurrent subprocess load is suspected, not a single fixture's own
    // isolation bug: test/integration/install-hooks/install-hooks.integration.test.ts's
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
    // reader: lints `.github/workflows/*` and touches nothing; needs no build, declared here only
    // to keep it in the concurrently-scheduled reader phase.
    "github-actions": githubActions,
    coverage: { ...coverage, dependsOn: ["test-unit", "test-integration", "test-property"] },
    crap: { ...crap, dependsOn: ["coverage"] },
    "test-e2e": { ...testE2e, isolated: true },
    size,
    duplication: duplication({ path: "src" }),
    publint,
    // Redirects to a file rather than spreading the preset's stdout-based
    // `run`/`policy`: see scripts/run-attw-to-file.mjs for why (a real,
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
    // A `run` override, the escape hatch GUIDE.md's "Preset options are the preferred way" section
    // allows. Without a `.licensee.json`, the published `license` preset passes `--osi` only.
    // There are no runtime `dependencies` today (ADR 0017 replaced `minimatch` with the
    // dependency-free `globMatch`), but the acceptance criterion stays wider than `--osi` alone:
    // Blue Oak Council Gold-rated licenses such as `BlueOak-1.0.0` are permissive, MIT-equivalent
    // licenses that deliberately never sought OSI approval, and `licensee` ships first-class
    // support for exactly that distinction via `--blueoak=<rating>`. It is added here as an
    // additional acceptance criterion alongside (not instead of) `--osi`, so a future dependency
    // under such a license is judged on its terms: this repository's own self-hosting config
    // only, not a change to the published preset's default behavior for other consumers.
    license: {
      ...license,
      run: ["licensee", "--production", "--osi", "--blueoak=gold", "--errors-only", "--ndjson"],
      // The published preset's own pass rationale ("...non-OSI-approved license") is worded for
      // its default --osi-only `run`: `--blueoak=gold` above widens the acceptance criterion, so
      // a dependency accepted via Blue Oak Gold rather than OSI approval (none today, per this
      // entry's own comment above) must never be described by a rationale implying OSI was the
      // only test applied; a reader trusting that rationale alone would wrongly conclude every
      // production dependency is specifically OSI-approved. Wraps the preset's own policy (which
      // still does all the real stdout parsing/interpretation) and rewrites only that one known,
      // exact stock string: every other outcome (fail, missing dependency, abnormal termination)
      // passes through unchanged.
      // Explicitly typed (rather than left for contextual inference, like every other check
      // below): an untyped `async (ctx) =>` here previously widened `defineRepoContract`'s own
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
        // pass rationale above: a failed run here would otherwise report a stricter policy
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
    // Reads the build output the Build barrier above just produced: no URL (not even in
    // JSDoc, declarations or sourcemaps) may ship, so supply-chain scanners have nothing to flag.
    "dist-no-urls": distNoUrls(),
    "dead-code": deadCode,
    "adr-governance": adrGovernance,
    // Conventional Commits drive the generated changesets (the shared workflow writes one per
    // releasable commit type) and the changelog; commitlint enforces the format across `origin/main..HEAD`. See
    // specs/decisions/0009-conventional-commits-versioning-and-local-gates.md. A pure reader: it runs the
    // `commitlint` binary against git history and touches nothing.
    commitlint: commitlint(),
    "security-network": securityNetwork,
    // The reconciled successor to network-surface.mjs's former ALLOWED_PRESET_COMMANDS allowlist
    // (ADR 0007's amendment): every external command a published preset spawns is held to a
    // reviewed record in .repo-contract/exceptions/preset-commands.json.
    "preset-commands": presetCommands,
    // New security check built on the repo-contract/helpers exception-policy primitive (see
    // specs/decisions/0013-reusable-exception-policy-helper.md): `unavailable` (the CLI isn't
    // installed, or this environment holds no Socket org token, as is the case for this
    // repository's own CI today) is a warn, not a hard dependency on real Socket credentials
    // existing everywhere this contract runs.
    "security-socket": securitySocket,
    // Promotes the former local-only `coderabbit review --agent` pre-push shell step (see
    // .githooks/pre-push and specs/decisions/0014-coderabbit-as-a-surfaced-check.md) into a real,
    // always-declared check: `not-applicable`/`unavailable` (CI, no CLI installed, a detached
    // checkout) is a warn on every single run, by design: a local skip must surface the exact same
    // warning CI always shows, never a silent pass.
    coderabbitai,
    // `dependsOn: ["security-deps"]` here (not in checks/openssf-scorecard.ts):
    // see this file's own doc comment on why `coverage`/`crap`/`mutation`
    // attach `dependsOn` at assembly instead of in their own check file. A
    // genuine evidence dependency: `policy` reads
    // `dependencies["security-deps"]` for the Vulnerabilities sub-check
    // rather than re-running `npm audit` a second, potentially-divergent time.
    "openssf-scorecard": { ...openssfScorecard, dependsOn: ["security-deps"] },
    // Reads the tarball npm would publish and fails if it spawns a process, reads `process.env` or depends on
    // `cross-spawn` itself (specs/decisions/0011-...md): both are consumer-supplied capabilities here. The
    // settings are in package.json under "internal-package-contract"."ambientCapabilities". It packs what
    // the tests just exercised, so it waits for them.
    "ambient-capabilities": { ...ambientCapabilitiesCheck(), dependsOn: ["test-unit"] },
    // The agent skill is written from docs/skill.json and what the package already says about itself; this
    // fails when what is committed is not what would be written now, or is over its word budget.
    "agent-skill": agentSkillCheck(),
    // Facts a document states that package.json already holds (what installing the package adds) are
    // written by `internal-package-contract generate` from docs/surface.json; this fails when a region is
    // stale, so ADOPTION.md cannot drift from package.json the way hand-written dependency notes did.
    "generated-regions": generatedRegionsCheck(),
    // IPC standard checks this repository runs as they are. checks/standard-coverage.ts maps every
    // standard check to the check here that covers it, or says why none does, and
    // test/unit/config/standard-coverage.test.ts fails when a standard check is in neither list.
    "readme-structure": readmeStructureCheck(),
    "code-scanning": codeScanning(),
    "scorecard-workflow": scorecardWorkflowCheck(),
    "pin-consistency": pinConsistency(),
    "managed-files": managedFilesCheck(),
    "env-contract": envContractCheck(),
    "git-hygiene": gitHygiene,
    "prompt-blocks": promptBlocksCheck(),
    "engine-matrix": engineMatrixCheck(),
    "no-minify": noMinify(),
    "packed-consumer": { ...packedConsumerCheck(), dependsOn: ["test-unit"] },
    "docs-fragments": docsFragments,
    prose: proseCheck(),
    "clean-checkout": cleanCheckoutCheck(),
    "landing-page": landingPageCheck(),
    "branch-protection": branchProtection,
    "benchmark-guides": benchmarkGuides(),
    "benchmark-complexity": benchmarkComplexityCheck(),
    "security-dev-deps": securityDevDeps(),
    // Declared last among the readers so its own scheduling barrier (see checks/mutation.ts and
    // this file's own doc comment) blocks as little else as possible.
    mutation: { ...mutation, dependsOn: ["suppression-governance"] },
  },
})

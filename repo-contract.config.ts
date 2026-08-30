/**
 * repo-contract's own self-hosting contract -- the package validating
 * itself using itself, exercising the real public API against real checks
 * with real policies (see specs/architecture.md and CONTRIBUTING.md). Run
 * via `npm run contract` (scripts/run-contract.mjs).
 *
 * Each check's own `run`/`policy` lives in its own file under checks/, or --
 * for the checks a published preset now covers, see the note further down
 * -- in src/presets/. This file owns only the dependency graph between them, and their
 * declaration order (see specs/decisions/0003-dependson-and-isolated-are-two-scheduling-primitives.md):
 * declaration order is the required topological order, and drives real scheduling, not just
 * documentation -- a `dependsOn` id must be declared earlier than the check declaring it, and an
 * `isolated` check is a full barrier at its own declared position.
 *
 * The `checks` object below is organized in three declaration-order phases, relying on that
 * barrier semantics rather than per-check `dependsOn` wiring wherever possible:
 *
 * 1. **Writers** -- `suppression-governance`, `api-contract`, `api-docs`, `lint`,
 *    `format`, `schema` -- every check that writes to a file other checks (or a human) later reads.
 *    Declared first so nothing reads their output before it's written. `api-contract` only ever
 *    writes on the one-time baseline bootstrap (see scripts/api-contract/check.ts); it is
 *    otherwise a pure reader, and its position here is conservative.
 *    `lint` (`eslint --fix`/`oxlint --fix`) and `format` (`prettier --write .`) both rewrite the
 *    whole source tree in place, and `schema` regenerates `schemas/*.schema.json` plus
 *    `scripts/suppression-governance/disable-comments.schema.json` from their source types -- all
 *    three belong here, not among the readers below, for the same reason as the original four: a
 *    reader that concurrently reads or lints the same files (`test-unit`'s
 *    `test/unit/schema/schema-conformance.test.ts` parsing the generated schemas, `typecheck`/
 *    `architecture`/`crap`/`duplication`/`security-secrets`/`dead-code`/`security-network` all
 *    reading `src/**`) must never race an in-place rewrite of that same content -- confirmed safe
 *    to co-locate with the original four writers: `lint`/`format` never touch any of
 *    suppression-governance's/api-contract's/api-docs's/schema's own generated output
 *    (`.prettierignore`/each ESLint `files` glob excludes every one of them by path or extension),
 *    and `schema` only ever reads its own TypeScript source types, never another writer's output.
 * 2. **`build`** (`isolated: true`) -- verifies the writers' output still compiles (now including
 *    whatever `lint --fix`/`format --write` just rewrote, not just the original four writers'
 *    output). Because it's declared right after every writer and is itself a scheduling barrier, it
 *    automatically depends on all of them (nothing is declared before it except writers) and every
 *    check declared after it automatically waits for it -- zero per-check `dependsOn` wiring needed
 *    on either side.
 * 3. **Readers** -- everything else: every check that only reads and reports, run concurrently
 *    against the now-built, now-written state. `coverage`, `crap`, and `mutation` still attach
 *    their own genuine evidence dependencies via `dependsOn` (see each one's own note below) --
 *    `isolated`/declaration order alone only ever expresses "wait for the build," never a specific
 *    sibling's evidence.
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
 *   specs/decisions/0007-suppression-governance.md).
 *   Separately, `mutation` is also `isolated: true` (declared in its own
 *   check file, checks/mutation.ts, not here -- unlike `dependsOn` it names
 *   no other check, so it needs no assembly-time context): Stryker spawns
 *   its own concurrent worker processes internally, and running it
 *   alongside this repository's own full concurrent test suite starves
 *   timing margins elsewhere under heavy load -- a real, observed flake in
 *   run-checks.test.ts's SIGINT-cleanup test, caused by resource contention
 *   rather than a logic bug. `isolated` is pure scheduling, not a data
 *   dependency on any other check's evidence -- see
 *   specs/decisions/0003-dependson-and-isolated-are-two-scheduling-primitives.md. `mutation` is declared near the
 *   end of the readers so its barrier blocks as little as possible.
 *
 * `coverage`, `crap`, and `mutation` therefore attach their `dependsOn`
 * here, at assembly, rather than in their own check file -- this is the one
 * place every check id is actually in scope to depend on.
 *
 * `typecheck`, `format`, `license`, `publint`, `arethetypeswrong`,
 * `security-deps`, `security-secrets`, `dead-code`, and `duplication` are
 * NOT defined under checks/ -- they're consumed directly from
 * `src/presets/`, the same published preset catalog an outside consumer
 * would import via `repo-contract/presets` (see
 * specs/decisions/0005-public-surface-stays-narrow-no-cli-experimental-presets.md). This repository dogfoods
 * its own public presets rather than maintaining a parallel private copy;
 * where a value needs to differ from a preset's generic default
 * (`dead-code`'s exempt list, `duplication`'s scanned path), it's supplied
 * via factory options, the preferred mechanism. `arethetypeswrong` goes
 * further still -- see that check's own inline comment below -- because
 * this repository's multiple entrypoints trigger a real upstream attw bug
 * no `run`-spread override alone could work around.
 */
import { accessibility } from "./checks/accessibility.js"
import { adrGovernance } from "./checks/adr-governance.js"
import { apiContract } from "./checks/api-contract.js"
import { apiDocs } from "./checks/api-docs.js"
import { architecture } from "./checks/architecture.js"
import { build } from "./checks/build.js"
import { coverage } from "./checks/coverage.js"
import { crap } from "./checks/crap.js"
import { docs } from "./checks/docs.js"
import { lint } from "./checks/lint.js"
import { mutation } from "./checks/mutation.js"
import { schema } from "./checks/schema.js"
import { securityNetwork } from "./checks/security-network.js"
import { size } from "./checks/size.js"
import { suppressionGovernance } from "./checks/suppression-governance.js"
import { testE2e } from "./checks/test-e2e.js"
import { testIntegration } from "./checks/test-integration.js"
import { testProperty } from "./checks/test-property.js"
import { testUnit } from "./checks/test-unit.js"
import { EXEMPT_UNUSED_DEV_DEPENDENCIES } from "./scripts/lint-config.mjs"
import { defineRepoContract } from "./src/index.js"
import type { AttwReport } from "./src/presets/arethetypeswrong.js"
import { evaluateAttwReport } from "./src/presets/arethetypeswrong.js"
import {
  commitlint,
  deadCode,
  duplication,
  format,
  license,
  publint,
  securityDeps,
  securitySecrets,
  typecheck,
} from "./src/presets/index.js"

export default defineRepoContract({
  checks: {
    // -- Writers --
    "suppression-governance": suppressionGovernance,
    "api-contract": apiContract,
    "api-docs": apiDocs,
    // Rewrites the whole source tree in place (`eslint --fix`/`oxlint --fix`) -- a writer, not a
    // reader, for the same reason format/schema below are: a reader that concurrently lints or
    // reads the same files it's rewriting must never race that rewrite. See module doc comment.
    lint,
    // Rewrites the whole source tree in place (`prettier --write .`) -- same reasoning as `lint`
    // above. `.prettierignore` already excludes every other writer's own generated output
    // (schemas/*.schema.json, disable-comments.json, .repo-contract, docs/api-report), so
    // co-locating it here introduces no new race against those.
    format,
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
    typecheck,
    "test-unit": testUnit,
    // `test/integration/suppression-governance/real-source.integration.test.ts`
    // reads disable-comments.json and asserts it's already synchronized with
    // real source; `suppression-governance`'s own check writes that same
    // file as a side effect of running. With no ordering between them, the
    // two race on that file concurrently -- confirmed: passed every time run
    // in isolation, failed when run concurrently with a stale registry (see
    // specs/decisions/0012-contract-orchestration-races-are-fixed-with-dependson-not-retries.md).
    // This dependsOn makes the registry write settle first, always, instead
    // of by scheduling luck -- the same fix already applied for `mutation`
    // below, which reads this same check's evidence for the same reason.
    "test-integration": { ...testIntegration, dependsOn: ["suppression-governance"] },
    "test-property": testProperty,
    architecture,
    coverage: { ...coverage, dependsOn: ["test-unit", "test-integration", "test-property"] },
    crap: { ...crap, dependsOn: ["coverage"] },
    "test-e2e": testE2e,
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

        let raw: string

        try {
          raw = await readFile("reports/arethetypeswrong.json", "utf8")
        } catch {
          return {
            outcome: "fail",
            rationale: "@arethetypeswrong/cli did not produce its expected JSON report.",
          }
        }

        let report: AttwReport

        try {
          report = JSON.parse(raw) as AttwReport
        } catch {
          return {
            outcome: "fail",
            rationale: "@arethetypeswrong/cli produced invalid JSON evidence.",
          }
        }

        return evaluateAttwReport(report)
      },
    },
    license,
    docs,
    accessibility,
    "security-deps": securityDeps,
    "security-secrets": securitySecrets,
    "dead-code": deadCode({ exemptUnusedDevDependencies: EXEMPT_UNUSED_DEV_DEPENDENCIES }),
    "adr-governance": adrGovernance,
    // Conventional Commits are the sole versioning input (release-please derives the bump +
    // changelog from them); commitlint enforces the format across `origin/main..HEAD`. See
    // specs/decisions/0008-api-contract-compatibility-gate.md. A pure reader -- it runs the
    // `commitlint` binary against git history and touches nothing.
    commitlint: commitlint(),
    "security-network": securityNetwork,
    // Declared last among the readers so its own scheduling barrier (see checks/mutation.ts and
    // this file's own doc comment) blocks as little else as possible.
    mutation: { ...mutation, dependsOn: ["suppression-governance"] },
  },
})

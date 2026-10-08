// Entry point for repo-contract's `mutation` check (see checks/mutation.ts).
// Deletes Stryker's own incremental-analysis cache before every run --
// stryker.config.mjs's `incremental: true` lets Stryker skip re-testing
// mutants it believes are unaffected by a source change, reusing their
// previous run's status from `incrementalFile`. That's a reasonable speed
// tradeoff for a developer manually iterating with `npx stryker run`, but
// this check's own policy (checks/mutation.ts) requires every applicable
// mutant to carry a *current* "Killed" status -- a stale reused status
// (observed in practice: a mutant reported "Timed out" from a much earlier
// run, unchanged across two later runs that took 160s and then 9s, even
// after the exercising test file changed) would silently misreport what
// this run of the test suite actually proved. Deleting the cache file first
// guarantees the check's own evidence always reflects a full, fresh
// analysis; a developer who wants incremental speed for local iteration can
// still invoke `npx stryker run` directly, which this script's deletion
// never touches until the *next* time this check itself runs.

import spawn from "cross-spawn"
import { rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { ensureStrykerVitest5Compat } from "../node_modules/internal-package-contract/scripts/stryker-vitest5-compat.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

rmSync(path.join(root, "reports", "mutation", "stryker-incremental.json"), { force: true })

// Vitest 5 changed how test names are matched; until the Stryker runner ships its own fix every mutant
// would run zero tests and survive (stryker-js#6210). The shared compatibility step aligns the runner.
const compat = ensureStrykerVitest5Compat(root)
if (compat.status === "patched") {
  console.error(
    `[run-mutation] Vitest ${compat.vitestVersion}: aligned @stryker-mutator/vitest-runner's test-name separator with Vitest 5 (stryker-js#6210).`,
  )
} else if (compat.status === "unrecognised") {
  console.error(
    `[run-mutation] Vitest ${compat.vitestVersion} with an @stryker-mutator/vitest-runner this package does not recognise: if every mutant survives having run 0 tests, see stryker-js#6210.`,
  )
}

const child = spawn("stryker", ["run", "--reporters", "json"], {
  cwd: root,
  stdio: "inherit",
})

child.once("error", (error) => {
  console.error(`[run-mutation] failed to spawn stryker: ${error.message}`)
  process.exit(1)
})

child.once("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1))
})

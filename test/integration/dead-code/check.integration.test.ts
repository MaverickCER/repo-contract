import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { runDeadCodeCheck } from "../../../scripts/dead-code/check.js"

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const runningInsideMutationSandbox = REPO_ROOT.split(path.sep).includes(".stryker-tmp")

/**
 * Runs `runDeadCodeCheck()` for real -- no mocking of `cross-spawn` or the `knip` binary -- against
 * this repository's own real source tree, exercising the exact self-hosted path
 * `checks/dead-code.ts` spawns in CI (see `scripts/dead-code/check.ts`'s own doc comment for why
 * this repository's own run does not use the published `deadCode` preset). Real-behavior-over-
 * mocking, this repository's own house style (see
 * `test/integration/preset-commands/scan.integration.test.ts`).
 */
describe("runDeadCodeCheck -- full real path", () => {
  it.runIf(!runningInsideMutationSandbox)(
    "runs knip against this repository and its registry reconciles clean (read-only)",
    async () => {
      const evidence = await runDeadCodeCheck(REPO_ROOT)

      expect(evidence.ok).toBe(true)
      if (!evidence.ok) return
      expect(evidence.registryError).toBeUndefined()

      // A fully-governed tree scaffolds nothing and carries no stale record -- every finding
      // knip reports right now already has a justified record in the committed registry.
      expect(evidence.scaffoldedIds).toEqual([])
      expect(evidence.staleExceptions).toEqual([])

      for (const finding of evidence.findings) {
        expect(evidence.activeExceptions[finding.id]?.justification.trim().length).toBeGreaterThan(
          0,
        )
      }
    },
    // knip walks the whole project graph; give it real headroom above its own 5-minute internal
    // deadline rather than risking an ambiguous Vitest 20s cutoff mid-spawn.
    6 * 60 * 1000,
  )
})

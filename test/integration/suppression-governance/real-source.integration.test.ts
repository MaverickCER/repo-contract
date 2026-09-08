import path from "node:path"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { toPersistedRecord } from "../../../scripts/suppression-governance/check.js"
import { discoverSuppressions } from "../../../scripts/suppression-governance/discover-suppressions.js"
import { listSourceFiles } from "../../../scripts/suppression-governance/find-source-files.js"
import {
  serializeRegistry,
  validateSuppressionRegistry,
} from "../../../scripts/suppression-governance/registry.js"
import { synchronize } from "../../../scripts/suppression-governance/synchronize.js"

/**
 * Proves the committed disable-comments.json is currently synchronized with this repository's own
 * real source -- previously only ever verified as a side effect of actually running the full
 * `suppression-governance` check via `npm run contract`, never as part of `npm test`.
 *
 * Deliberately calls the execution-layer functions directly (listSourceFiles -> discoverSuppressions
 * -> synchronize) rather than `runSuppressionGovernanceCheck`, which has a real `writeFile` side
 * effect on disagreement -- calling that against the real repo root inside `npm test` (run far more
 * often than `npm run contract`) would let a failing test silently rewrite the committed registry.
 * This composition has no write path at all.
 */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url))

// A real, on-disk Stryker mutation-testing sandbox (stryker.config.mjs's `tempDirName`) is a
// *temporary, deliberately-mutated copy* of this repository -- Stryker's own dry run instruments
// every `mutate`-scope file with mutant-switch code (real, added lines, shifting every later line
// number in that file) as an intrinsic, unavoidable part of establishing per-test mutant coverage.
// This test's own premise -- "the committed registry has zero drift against the current source
// tree" -- is about the real, committed repository; it is neither true nor meaningful to assert
// against a sandbox copy Stryker has already begun rewriting by design. Detected structurally (a
// ".stryker-tmp" path segment in this test file's own resolved location -- true for any file
// inside any sandbox Stryker ever creates, since Stryker always copies the whole project,
// including this very test file, into the sandbox it runs against), not via an environment
// variable Stryker does not document as stable API.
const runningInsideMutationSandbox = REPO_ROOT.split(path.sep).includes(".stryker-tmp")

describe("disable-comments.json stays synchronized with real source", () => {
  it.runIf(!runningInsideMutationSandbox)(
    "the committed registry has zero new/moved/removed suppressions against the real, current source tree",
    async () => {
      const registryUrl = new URL(
        "../../../.repo-contract/exceptions/disable-comments.json",
        import.meta.url,
      )
      const currentContent = await readFile(registryUrl, "utf8")
      const rawRegistry = JSON.parse(currentContent) as unknown

      const validated = validateSuppressionRegistry(rawRegistry)
      // A malformed registry must fail this test loudly, never be silently read as "zero
      // differences" -- see the module doc comment above.
      expect(validated.ok, validated.ok ? undefined : JSON.stringify(validated.errors)).toBe(true)
      if (!validated.ok) return

      const files = await listSourceFiles(REPO_ROOT)
      const discovered = await discoverSuppressions(REPO_ROOT, files)
      const { records, newCount, movedCount, removedCount } = synchronize(
        validated.records,
        discovered,
      )

      expect({ newCount, movedCount, removedCount }).toEqual({
        newCount: 0,
        movedCount: 0,
        removedCount: 0,
      })

      // The three counts above can each independently be zero while the committed file is still
      // byte-different from what `synchronize` would (re-)produce today -- a `reason`
      // re-extraction, sort-order, or serialization-formatting regression changes none of the
      // three counts (see synchronize.ts's own doc comment: `reason` is never preserved
      // verbatim, and is retaken fresh on every run even for an "existing" record). This is the
      // exact comparison scripts/suppression-governance/check.ts's own `run()` uses to decide
      // whether to rewrite the file on disk -- replicated here (read-only, never writing) so a
      // mismatch fails this test instead of only being caught by actually running
      // `npm run contract`.
      const serialized = serializeRegistry(records.map(toPersistedRecord))
      expect(currentContent).toBe(serialized)
    },
  )
})

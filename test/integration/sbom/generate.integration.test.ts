import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { generateSbom } from "../../../scripts/sbom/generate.js"

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const runningInsideMutationSandbox = REPO_ROOT.split(path.sep).includes(".stryker-tmp")

/**
 * Runs `generateSbom()` for real (no mocking of `cross-spawn` or the `cyclonedx-npm` binary)
 * against this repository's own real package-lock.json, exercising the exact path
 * `checks/sbom.ts` spawns in CI (see `scripts/sbom/spawn.ts`'s own doc comment). Real-behavior-
 * over-mocking, this repository's own house style (see
 * `test/integration/dead-code/check.integration.test.ts`,
 * `test/integration/security-socket/scan.integration.test.ts`). Unlike those two siblings,
 * `cyclonedx-npm` is a real devDependency of this repository (not an optionally-installed external
 * CLI), so there is no "unavailable" outcome to branch on here: a real, well-formed SBOM is the
 * only outcome this test accepts.
 *
 * Skipped inside Stryker's mutation sandbox, mirroring the dead-code integration test's guard. That
 * sandbox is a copy of this repository under `.stryker-tmp/`. Stryker's `mutate` glob only covers
 * `src/` (see stryker.config.mjs), so `checks/sbom.ts` and the sbom scripts are never mutated.
 * Re-running a ~1.5s `cyclonedx-npm` invocation there would add wall time for no mutation-detection
 * value.
 */
describe("generateSbom: real @cyclonedx/cyclonedx-npm", () => {
  it.runIf(!runningInsideMutationSandbox)(
    "generates a real, well-formed CycloneDX document for this repository's own dependency graph",
    async () => {
      const evidence = await generateSbom(REPO_ROOT)

      expect(evidence.ok).toBe(true)
      if (!evidence.ok) return

      expect(evidence.bomFormat).toBe("CycloneDX")
      expect(evidence.specVersion).toBe("1.6")
      expect(evidence.toolVersion).toMatch(/^\d+\.\d+\.\d+/)
      // This repository's own real tree carries well over a thousand direct + transitive npm
      // dependencies: a generous, loose floor that would still catch a scan that silently
      // scoped down to almost nothing (e.g. a flag regression that re-narrowed to --omit=dev).
      expect(evidence.componentCount).toBeGreaterThan(100)

      // The runtime inventory is separate and tiny: this package installs no dependencies.
      expect(evidence.productionComponentCount).toBe(0)
      const production = JSON.parse(
        await readFile(path.join(REPO_ROOT, evidence.productionOutputPath), "utf8"),
      ) as { components?: unknown[] }
      expect(production.components ?? []).toHaveLength(0)

      const written = await readFile(path.join(REPO_ROOT, evidence.outputPath), "utf8")
      const parsed: unknown = JSON.parse(written)
      expect(parsed).toMatchObject({ bomFormat: "CycloneDX", specVersion: "1.6" })
      // The `--output-reproducible` flag strips time-/random-based values: confirmed here, not
      // assumed.
      expect((parsed as { metadata?: { timestamp?: unknown } }).metadata?.timestamp).toBeUndefined()
      expect((parsed as { serialNumber?: unknown }).serialNumber).toBeUndefined()
    },
    // The `npm ls` walk inside cyclonedx-npm over this repository's large dev+prod tree takes a
    // couple of seconds. Generous headroom avoids an ambiguous Vitest 20s cutoff mid-spawn. The
    // other subprocess integration tests use the same reasoning.
    60 * 1000,
  )

  it.runIf(!runningInsideMutationSandbox)(
    "is deterministic: two consecutive runs against the same package-lock.json write byte-identical output",
    async () => {
      const first = await generateSbom(REPO_ROOT)
      expect(first.ok).toBe(true)
      const firstBytes = await readFile(path.join(REPO_ROOT, "docs/sbom.cdx.json"), "utf8")

      const second = await generateSbom(REPO_ROOT)
      expect(second.ok).toBe(true)
      const secondBytes = await readFile(path.join(REPO_ROOT, "docs/sbom.cdx.json"), "utf8")

      expect(secondBytes).toBe(firstBytes)
      expect(second).toEqual(first)
    },
    60 * 1000,
  )
})

import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

interface Manifest {
  "internal-package-contract"?: { ambientCapabilities?: Record<string, string[]> }
  bin?: Record<string, string>
}

const manifest = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../../package.json"), "utf8"),
) as Manifest

// specs/decisions/0011-*.md (2026-11-01 amendment): the library bundles must never reach a process
// spawner or the environment, and only the `bin` entry point may. AmbientCapabilities enforces only
// the capabilities written here, so leaving them out silently disables the check for them.
describe("package.json ambientCapabilities", () => {
  const config = manifest["internal-package-contract"]?.ambientCapabilities

  it.each(["child_process", "env"])(
    "forbids %s everywhere except the bin entry point",
    (capability) => {
      expect(config?.[capability]).toEqual(["bin"])
    },
  )

  it("keeps forbidding cross-spawn as a dependency", () => {
    expect(config?.forbiddenDependencies).toContain("cross-spawn")
  })

  it("has a bin entry point for the exemption to name", () => {
    expect(Object.values(manifest.bin ?? {})).toEqual(["./bin/repo-contract.mjs"])
  })
})

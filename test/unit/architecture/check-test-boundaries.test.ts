import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { checkTestBoundaries } from "../../../scripts/check-test-boundaries.mjs"

/**
 * True positive / true negative for scripts/check-test-boundaries.mjs -- this guardrail's own
 * verification was previously only a one-time manual check during implementation, never a
 * permanent regression test. This closes that gap the same way rules.test.ts already does for the
 * dependency-cruiser layering rules: real fixture files, for each of the script's two independent
 * sub-checks (file ownership, config `include` scoping), plus a clean tree proving neither
 * sub-check is falsely triggered.
 */

let root: string

const CATEGORY_DIRS = {
  unit: "test/unit",
  integration: "test/integration",
  property: "test/property",
  e2e: "test/e2e",
}

async function writeConfig(name: string, includeDir: string): Promise<void> {
  await writeFile(
    path.join(root, `vitest.${name}.config.ts`),
    `export default { test: { include: ["${includeDir}/**/*.test.ts"] } }\n`,
    "utf8",
  )
}

async function writeCorrectTree(): Promise<void> {
  for (const [name, dir] of Object.entries(CATEGORY_DIRS)) {
    await mkdir(path.join(root, dir), { recursive: true })
    await writeFile(path.join(root, dir, "example.test.ts"), "// fixture\n", "utf8")
    await writeConfig(name, dir)
  }
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-test-boundaries-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("checkTestBoundaries -- true positive / true negative", () => {
  it("reports zero violations on a correctly-shaped tree", async () => {
    await writeCorrectTree()

    const result = checkTestBoundaries(root)

    expect(result).toEqual({ ok: true, filesScanned: 4, violations: [] })
  })

  it("flags a vitest config whose include array escapes its own category directory", async () => {
    await writeCorrectTree()
    await writeConfig("unit", "test/integration")

    const result = checkTestBoundaries(root)

    expect(result.ok).toBe(true)
    expect(result.ok && result.violations).toContainEqual(
      expect.stringContaining(
        'vitest.unit.config.ts\'s "include" pattern "test/integration/**/*.test.ts" does not stay within test/unit/',
      ),
    )
  })

  it("flags a *.test.ts file that belongs to zero category directories", async () => {
    await writeCorrectTree()
    await mkdir(path.join(root, "test"), { recursive: true })
    await writeFile(path.join(root, "test", "stray.test.ts"), "// fixture\n", "utf8")

    const result = checkTestBoundaries(root)

    expect(result.ok).toBe(true)
    expect(result.ok && result.violations).toContainEqual(
      expect.stringContaining("test/stray.test.ts belongs to 0 category director"),
    )
  })

  it("reports a tool-infrastructure failure, not a violation, when a category's own config is missing", async () => {
    await writeCorrectTree()
    await rm(path.join(root, "vitest.e2e.config.ts"), { force: true })

    const result = checkTestBoundaries(root)

    expect(result.ok).toBe(false)
  })
})

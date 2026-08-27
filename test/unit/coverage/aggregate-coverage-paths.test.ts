import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { aggregateCoverage } from "../../../scripts/aggregate-coverage.mjs"
import { AGGREGATE_COVERAGE_FINAL_PATH } from "../../../scripts/aggregate-coverage-paths.mjs"
import { crap } from "../../../checks/crap.js"

/**
 * Proves the shared-path contract for both consumers of the aggregate coverage artifact: the
 * writer (aggregateCoverage()) and the reader (the `crap` check's own `run` command) must agree on
 * the exact same path, imported from one shared module rather than each restating its own literal
 * -- see specs/decisions/0006-independent-verification-boundaries-coverage-is-a-union.md.
 */

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "code-contract-aggregate-coverage-paths-"))
  for (const category of ["unit", "integration", "property"]) {
    await mkdir(path.join(root, "coverage", category), { recursive: true })
    await writeFile(path.join(root, "coverage", category, "coverage-final.json"), "{}", "utf8")
  }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("crap and coverage read the byte-identical aggregate coverage artifact", () => {
  it("aggregateCoverage() actually writes to the path AGGREGATE_COVERAGE_FINAL_PATH names, for a real root", async () => {
    const { finalPath } = aggregateCoverage(root)

    expect(path.relative(root, finalPath).split(path.sep).join("/")).toBe(
      AGGREGATE_COVERAGE_FINAL_PATH,
    )
    // Not just a claimed path -- the file must actually exist there, real and unmocked, and
    // contain real, valid coverage-map JSON, not merely some non-empty (possibly garbage) text.
    const written = await readFile(finalPath, "utf8")
    const parsed: unknown = JSON.parse(written)
    expect(parsed).toEqual(expect.any(Object))
    expect(parsed).not.toBeNull()
  })

  it("checks/crap.ts's run array names the exact shared AGGREGATE_COVERAGE_FINAL_PATH constant", () => {
    expect(crap.run).toContain(AGGREGATE_COVERAGE_FINAL_PATH)
  })
})

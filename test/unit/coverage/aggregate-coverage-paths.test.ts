import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { aggregateCoverage } from "../../../scripts/aggregate-coverage.mjs"
import { AGGREGATE_COVERAGE_FINAL_PATH } from "../../../scripts/aggregate-coverage-paths.mjs"
import config from "../../../repo-contract.config.js"

/**
 * Proves the shared-path contract for both consumers of the aggregate coverage artifact. The writer
 * (aggregateCoverage()) and the reader (the `crap` check's `run` command) must agree on the same
 * path. Both import it from one shared module rather than each restating a literal. See
 * specs/decisions/0005-independent-verification-boundaries-coverage-is-a-union.md.
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
    // Not just a claimed path: the file must actually exist there, real and unmocked, and
    // contain real, valid coverage-map JSON, not merely some non-empty (possibly garbage) text.
    const written = await readFile(finalPath, "utf8")
    const parsed: unknown = JSON.parse(written)
    expect(parsed).toEqual(expect.any(Object))
    expect(parsed).not.toBeNull()
  })

  it("the config's crap check scores against the exact shared AGGREGATE_COVERAGE_FINAL_PATH", () => {
    const run = config.checks.crap.run as readonly string[]
    expect(run[run.indexOf("--coverage") + 1]).toBe(AGGREGATE_COVERAGE_FINAL_PATH)
  })

  it("the config's crap report lands in the aggregate directory the coverage check creates", () => {
    const run = config.checks.crap.run as readonly string[]
    expect(run[run.indexOf("--output") + 1]).toBe("coverage/aggregate/crap4ts-report.json")
  })
})

import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runApiContractCheck } from "../../../scripts/api-contract/check.js"
import { writeFixtureSource } from "../../helpers/api-contract/build-fixture-package.js"

/**
 * The complete real path: source -> API Extractor -> API JSON -> historical comparison (from a
 * real git repo's HEAD) -> evidence -> (changeset maintenance). No subprocess is spawned --
 * `runApiContractCheck` is called in-process against a scratch fixture repository, per the
 * project's real-behavior-over-mocking house style.
 */

let root: string

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
}

function commitAll(message: string): void {
  git("add", "-A")
  git("commit", "-m", message)
}

const V1_SOURCE = `
/** @public */
export function getUsers(): string[] {
  return []
}
`

const V1_PLUS_COMPATIBLE_SOURCE = `
/** @public */
export function getUsers(): string[] {
  return []
}

/** @public */
export function getUserById(id: string): string {
  return id
}
`

const NO_EXPORTS_SOURCE = `
export {}
`

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-check-integration-"))
  git("init", "-q")
  git("config", "user.email", "test@example.com")
  git("config", "user.name", "Test")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("runApiContractCheck -- full real path", () => {
  it("establishes the initial baseline on the first run and writes committable baseline files", async () => {
    await writeFixtureSource(root, V1_SOURCE, "fixture-pkg", "0.1.0")

    const evidence = await runApiContractCheck(root, "public")

    expect(evidence.initialBaseline).toBe(true)
    expect(evidence.impact).toBe("unchanged")
    expect(evidence.diff).toEqual([])
    expect(evidence.minimumRequiredVersion).toBe("0.1.0")
    expect(evidence.changeset).toEqual({ action: "none", generatedSectionUpdated: false })

    const baselineMeta = JSON.parse(
      await readFile(path.join(root, ".repo-contract/api-contract/baseline.meta.json"), "utf8"),
    ) as { packageName: string }
    expect(baselineMeta.packageName).toBe("fixture-pkg")
  }, 30_000)

  it("reports an unchanged contract deterministically on a rerun with no source changes", async () => {
    await writeFixtureSource(root, V1_SOURCE, "fixture-pkg", "0.1.0")
    await runApiContractCheck(root, "public")
    commitAll("establish baseline")

    const first = await runApiContractCheck(root, "public")
    const second = await runApiContractCheck(root, "public")

    expect(first.initialBaseline).toBe(false)
    expect(first.impact).toBe("unchanged")
    expect(first.diff).toEqual([])
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  }, 30_000)

  it("detects a compatible addition, computes a minor minimum version, and creates a changeset", async () => {
    await writeFixtureSource(root, V1_SOURCE, "fixture-pkg", "0.1.0")
    await runApiContractCheck(root, "public")
    commitAll("establish baseline")

    await writeFixtureSource(root, V1_PLUS_COMPATIBLE_SOURCE, "fixture-pkg", "0.1.0")
    const evidence = await runApiContractCheck(root, "public")

    expect(evidence.impact).toBe("compatible")
    expect(evidence.requiredLevel).toBe("minor")
    expect(evidence.minimumRequiredVersion).toBe("0.2.0")
    expect(evidence.changeset.action).toBe("created")

    const changesetContent = await readFile(path.join(root, evidence.changeset.path ?? ""), "utf8")
    expect(changesetContent).toContain('"fixture-pkg": minor')
    expect(changesetContent).toContain("getUserById")

    // The baseline itself must remain exactly as committed -- only npm run contract:baseline
    // (update-baseline.ts) is allowed to change it, never the check. (current.* is expected to
    // show as modified every run -- it's regenerated, ephemeral working state, not part of this
    // assertion; the real repository's own .gitignore excludes it entirely.)
    const status = git("status", "--porcelain", ".repo-contract/api-contract/baseline.api.json")
    expect(status.trim()).toBe("")
  }, 30_000)

  it("is idempotent: rerunning after a compatible addition with no further changes updates nothing further", async () => {
    await writeFixtureSource(root, V1_SOURCE, "fixture-pkg", "0.1.0")
    await runApiContractCheck(root, "public")
    commitAll("establish baseline")

    await writeFixtureSource(root, V1_PLUS_COMPATIBLE_SOURCE, "fixture-pkg", "0.1.0")
    const first = await runApiContractCheck(root, "public")
    expect(first.changeset.action).toBe("created")

    const second = await runApiContractCheck(root, "public")
    expect(second.changeset.action).toBe("unchanged")
    expect(second.changeset.generatedSectionUpdated).toBe(false)
  }, 30_000)

  it("detects a breaking removal and computes a major minimum version", async () => {
    await writeFixtureSource(root, V1_PLUS_COMPATIBLE_SOURCE, "fixture-pkg", "0.2.0")
    await runApiContractCheck(root, "public")
    commitAll("establish baseline")

    await writeFixtureSource(root, V1_SOURCE, "fixture-pkg", "0.2.0")
    const evidence = await runApiContractCheck(root, "public")

    expect(evidence.impact).toBe("breaking")
    expect(evidence.requiredLevel).toBe("major")
    expect(evidence.minimumRequiredVersion).toBe("1.0.0")
    expect(evidence.diff.some((c) => c.kind === "export-removed")).toBe(true)
    expect(evidence.changeset.action).toBe("created")
    expect(evidence.changeset.requiredReleaseLevel).toBe("major")
  }, 30_000)

  it("never touches the committed baseline when a later run's analysis fails", async () => {
    await writeFixtureSource(root, V1_SOURCE, "fixture-pkg", "0.1.0")
    await runApiContractCheck(root, "public")
    commitAll("establish baseline")

    const baselineBefore = await readFile(
      path.join(root, ".repo-contract/api-contract/baseline.meta.json"),
      "utf8",
    )

    // Corrupt the compiled entry point so API Extractor itself fails, without touching the
    // committed baseline.
    await writeFile(
      path.join(root, "dist", "index.d.ts"),
      "this is not valid TypeScript {{{",
      "utf8",
    )

    await expect(runApiContractCheck(root, "public")).rejects.toThrow()

    const baselineAfter = await readFile(
      path.join(root, ".repo-contract/api-contract/baseline.meta.json"),
      "utf8",
    )
    expect(baselineAfter).toBe(baselineBefore)
    const status = git("status", "--porcelain", ".repo-contract")
    expect(status.trim()).toBe("")
  }, 30_000)

  it("cleans up a stale changeset when the contract is reverted back to the baseline within the same PR", async () => {
    await writeFixtureSource(root, V1_SOURCE, "fixture-pkg", "0.1.0")
    await runApiContractCheck(root, "public")
    commitAll("establish baseline")

    await writeFixtureSource(root, V1_PLUS_COMPATIBLE_SOURCE, "fixture-pkg", "0.1.0")
    const withChange = await runApiContractCheck(root, "public")
    expect(withChange.changeset.action).toBe("created")

    await writeFixtureSource(root, V1_SOURCE, "fixture-pkg", "0.1.0")
    const reverted = await runApiContractCheck(root, "public")

    expect(reverted.impact).toBe("unchanged")
    expect(reverted.changeset.action).toBe("removed")
    await expect(
      readFile(path.join(root, withChange.changeset.path ?? ""), "utf8"),
    ).rejects.toThrow()
  }, 30_000)

  it("surfaces an @internal-only change as informational lowerTierDiff without affecting impact/version or creating a changeset", async () => {
    const V1_WITH_INTERNAL = `
/** @public */
export function getUsers(): string[] {
  return []
}

/** @internal */
export function _internalHelper(): void {}
`
    await writeFixtureSource(root, V1_SOURCE, "fixture-pkg", "0.1.0")
    await runApiContractCheck(root, "public")
    commitAll("establish baseline")

    await writeFixtureSource(root, V1_WITH_INTERNAL, "fixture-pkg", "0.1.0")
    const evidence = await runApiContractCheck(root, "public")

    expect(evidence.impact).toBe("unchanged")
    expect(evidence.requiredLevel).toBe("none")
    expect(evidence.minimumRequiredVersion).toBe("0.1.0")
    expect(evidence.diff).toEqual([])
    expect(evidence.lowerTierDiff.length).toBeGreaterThan(0)
    expect(evidence.lowerTierDiff.some((c) => c.path.includes("_internalHelper"))).toBe(true)
    expect(evidence.changeset).toEqual({ action: "none", generatedSectionUpdated: false })
  }, 30_000)

  it("keeps the diff stably ordered across independent runs over the same inputs", async () => {
    await writeFixtureSource(root, NO_EXPORTS_SOURCE, "fixture-pkg", "0.1.0")
    await runApiContractCheck(root, "public")
    commitAll("establish baseline")

    const multiExportSource = `
/** @public */
export function b(): void {}
/** @public */
export function a(): void {}
/** @public */
export function m(): void {}
`
    await writeFixtureSource(root, multiExportSource, "fixture-pkg", "0.1.0")

    const expectedIds = [
      "fixture-pkg!a:function(1)",
      "fixture-pkg!b:function(1)",
      "fixture-pkg!m:function(1)",
    ]

    // Two genuinely independent calls over the identical on-disk inputs -- "across independent
    // runs" is the property under test, not just "within one call's own output" (a stale
    // `evidence.diff` from a first run being silently reused would pass a single-run assertion
    // just as easily as a correctly-recomputed one).
    const firstRun = await runApiContractCheck(root, "public")
    const secondRun = await runApiContractCheck(root, "public")

    for (const evidence of [firstRun, secondRun]) {
      const ids = evidence.diff.map((c) => c.id)
      // Asserts the three expected changes are actually present, not just that whatever came
      // back happens to be sorted -- an empty (or partial) diff from a detection regression would
      // otherwise satisfy a sortedness-only assertion just as vacuously as a correct one.
      expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(expectedIds)
      expect(ids).toEqual(expectedIds)
    }
  }, 30_000)
})

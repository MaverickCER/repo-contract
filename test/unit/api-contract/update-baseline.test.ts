import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runApiContractCheck } from "../../../scripts/api-contract/check.js"
import { runUpdateBaseline } from "../../../scripts/api-contract/update-baseline.js"
import { writeFixtureSource } from "../../helpers/api-contract/build-fixture-package.js"
import { removeTempDir } from "../../helpers/remove-temp-dir.js"

let root: string

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
}

function commitAll(message: string): void {
  git("add", "-A")
  git("commit", "-m", message)
}

const SOURCE = `
/** @public */
export function getUsers(): string[] {
  return []
}
`

// Same public surface as SOURCE plus one added export -- a real API change.
const SOURCE_WITH_EXTRA_EXPORT = `
/** @public */
export function getUsers(): string[] {
  return []
}

/** @public */
export function getGroups(): string[] {
  return []
}
`

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-update-baseline-"))
  git("init", "-q")
  git("config", "user.email", "test@example.com")
  git("config", "user.name", "Test")
})

afterEach(async () => {
  await removeTempDir(root)
})

describe("runUpdateBaseline", () => {
  it("succeeds unconditionally when no baseline exists yet", async () => {
    await writeFixtureSource(root, SOURCE, "fixture-pkg", "0.1.0")

    const outcome = await runUpdateBaseline(root)

    expect(outcome.status).toBe("updated")
    const meta = JSON.parse(
      await readFile(path.join(root, ".repo-contract/api-contract/baseline.meta.json"), "utf8"),
    ) as { packageVersion: string }
    expect(meta.packageVersion).toBe("0.1.0")
  }, 30_000)

  it("reports 'current' (a no-op, not an error) when the baseline already carries package.json's version and contents match", async () => {
    await writeFixtureSource(root, SOURCE, "fixture-pkg", "0.1.0")
    await runApiContractCheck(root, "public")
    commitAll("establish baseline")

    // No version bump, no API change -- still 0.1.0. This is the shape every
    // re-run of the api-baseline workflow after the first sees, so it must not
    // fail.
    const before = await readFile(
      path.join(root, ".repo-contract/api-contract/baseline.meta.json"),
      "utf8",
    )
    const outcome = await runUpdateBaseline(root)

    expect(outcome.status).toBe("current")
    expect(outcome.message).toContain("0.1.0")
    const after = await readFile(
      path.join(root, ".repo-contract/api-contract/baseline.meta.json"),
      "utf8",
    )
    expect(after).toBe(before)
  }, 30_000)

  it("regenerates at the same version when the public API changed without a version bump", async () => {
    await writeFixtureSource(root, SOURCE, "fixture-pkg", "1.0.0")
    await runApiContractCheck(root, "public")
    commitAll("establish baseline")
    const before = await readFile(
      path.join(root, ".repo-contract/api-contract/baseline.meta.json"),
      "utf8",
    )

    // API grows an export; version stays 1.0.0 (e.g. a fix: that merged while a
    // Release PR sat open).
    await writeFixtureSource(root, SOURCE_WITH_EXTRA_EXPORT, "fixture-pkg", "1.0.0")
    const outcome = await runUpdateBaseline(root)

    expect(outcome.status).toBe("updated")
    const after = JSON.parse(
      await readFile(path.join(root, ".repo-contract/api-contract/baseline.meta.json"), "utf8"),
    ) as { packageVersion: string; apiJsonHash: string }
    expect(after.packageVersion).toBe("1.0.0")
    expect(after.apiJsonHash).not.toBe((JSON.parse(before) as { apiJsonHash: string }).apiJsonHash)
    const dts = await readFile(path.join(root, ".repo-contract/api-contract/baseline.d.ts"), "utf8")
    expect(dts).toContain("getGroups")
  }, 30_000)

  it("refuses when package.json's version is older than the baseline's (regenerating would roll it backwards)", async () => {
    await writeFixtureSource(root, SOURCE, "fixture-pkg", "1.0.0")
    await runApiContractCheck(root, "public")
    commitAll("establish baseline")

    await writeFixtureSource(root, SOURCE, "fixture-pkg", "0.9.0")
    const before = await readFile(
      path.join(root, ".repo-contract/api-contract/baseline.meta.json"),
      "utf8",
    )

    const outcome = await runUpdateBaseline(root)

    expect(outcome.status).toBe("refused")
    expect(outcome.message).toContain("older")
    const after = await readFile(
      path.join(root, ".repo-contract/api-contract/baseline.meta.json"),
      "utf8",
    )
    expect(after).toBe(before)
  }, 30_000)

  it("refuses an unparseable package.json version even when no baseline exists yet", async () => {
    await writeFixtureSource(root, SOURCE, "fixture-pkg", "not-a-version")

    const outcome = await runUpdateBaseline(root)

    expect(outcome.status).toBe("refused")
    expect(outcome.message).toContain("not-a-version")
    await expect(
      readFile(path.join(root, ".repo-contract/api-contract/baseline.meta.json"), "utf8"),
    ).rejects.toThrow()
  }, 30_000)

  it("succeeds once package.json's version is strictly greater than the existing baseline, and updates it", async () => {
    await writeFixtureSource(root, SOURCE, "fixture-pkg", "0.1.0")
    await runApiContractCheck(root, "public")
    commitAll("establish baseline")

    await writeFixtureSource(root, SOURCE, "fixture-pkg", "1.0.0")
    const outcome = await runUpdateBaseline(root)

    expect(outcome.status).toBe("updated")
    const meta = JSON.parse(
      await readFile(path.join(root, ".repo-contract/api-contract/baseline.meta.json"), "utf8"),
    ) as { packageVersion: string }
    expect(meta.packageVersion).toBe("1.0.0")
  }, 30_000)

  it("writes nothing when API Extractor itself fails (a sufficiently malformed entry point makes API Extractor throw rather than return a clean error result -- either way, no baseline write happens)", async () => {
    await writeFixtureSource(root, SOURCE, "fixture-pkg", "0.1.0")
    await runApiContractCheck(root, "public")
    commitAll("establish baseline")

    await writeFixtureSource(root, SOURCE, "fixture-pkg", "1.0.0")
    await writeFile(
      path.join(root, "dist", "index.d.ts"),
      "this is not valid TypeScript {{{",
      "utf8",
    )

    const before = await readFile(
      path.join(root, ".repo-contract/api-contract/baseline.meta.json"),
      "utf8",
    )

    // API Extractor may either throw or return a clean `status: "failed"` here,
    // depending on how badly the entry point is malformed (and its own version).
    // Both are acceptable; the invariant under test is that no baseline is written.
    const outcome = await runUpdateBaseline(root).then(
      (result) => ({ threw: false as const, result }),
      (error: unknown) => ({ threw: true as const, error }),
    )
    if (!outcome.threw) {
      expect(outcome.result.status).toBe("failed")
    }

    const after = await readFile(
      path.join(root, ".repo-contract/api-contract/baseline.meta.json"),
      "utf8",
    )
    expect(after).toBe(before)
  }, 30_000)
})

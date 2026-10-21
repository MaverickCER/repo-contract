import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { license } from "../../../src/presets/license.js"
import { runRepoContract } from "../../../src/run-repo-contract.js"
import { removeTempDir } from "../../helpers/remove-temp-dir.js"
import { testEnv } from "../../helpers/test-env.js"
import { testSpawn } from "../../helpers/test-spawn.js"

/**
 * Runs the real `license` preset -- its `node -e` launcher included -- against a temporary
 * project whose `node_modules/licensee` is a stand-in CLI that records the arguments it was
 * given. Only the stand-in replaces licensee itself; the launcher's own resolution, `.licensee.json`
 * detection and in-process loading all run for real.
 */
describe("license preset launcher", () => {
  let project: string | undefined

  afterEach(async () => {
    await removeTempDir(project)
    project = undefined
  })

  /**
   * Creates a temporary project with a stand-in licensee whose CLI writes its argv to `argv.json`.
   * @param bin - the stand-in's `package.json` `bin` field.
   * @returns the project directory.
   */
  async function projectWithStandIn(bin: string | Record<string, string>): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "repo-contract-license-"))
    const pkg = path.join(dir, "node_modules", "licensee")
    await mkdir(pkg, { recursive: true })
    await writeFile(path.join(pkg, "package.json"), JSON.stringify({ name: "licensee", bin }))
    await writeFile(
      path.join(pkg, "cli.js"),
      `require("node:fs").writeFileSync("argv.json", JSON.stringify(process.argv.slice(2)))\n`,
    )
    return dir
  }

  async function runIn(cwd: string) {
    const { evidence, verdict } = await runRepoContract({
      checks: { license: { ...license, cwd } },
      spawn: testSpawn,
      env: testEnv,
    })
    return { result: evidence.checks.license, verdict: verdict.checks.license }
  }

  async function recordedArgv(cwd: string): Promise<unknown> {
    return JSON.parse(await readFile(path.join(cwd, "argv.json"), "utf8")) as unknown
  }

  it("passes --osi when the project has no .licensee.json", async () => {
    project = await projectWithStandIn("./cli.js")

    const { verdict } = await runIn(project)

    expect(await recordedArgv(project)).toEqual([
      "--production",
      "--osi",
      "--errors-only",
      "--ndjson",
    ])
    expect(verdict).toEqual({
      outcome: "pass",
      rationale: "licensee found 0 production dependencies with a non-OSI-approved license.",
    })
  })

  it("leaves the policy to .licensee.json when the project has one (regression: --osi made licensee ignore it)", async () => {
    project = await projectWithStandIn({ licensee: "./cli.js" })
    await writeFile(
      path.join(project, ".licensee.json"),
      JSON.stringify({ licenses: { osi: true } }),
    )

    const { verdict } = await runIn(project)

    expect(await recordedArgv(project)).toEqual(["--production", "--errors-only", "--ndjson"])
    expect(verdict).toEqual({
      outcome: "pass",
      rationale:
        "licensee found 0 production dependencies with a license .licensee.json does not approve.",
    })
  })

  it("reports licensee as not installed when it cannot be resolved from the working directory", async () => {
    project = await mkdtemp(path.join(os.tmpdir(), "repo-contract-license-"))

    const { result, verdict } = await runIn(project)

    expect(result.exitCode).toBe(127)
    expect(verdict.outcome).toBe("fail")
    expect(verdict.rationale).toContain("`licensee` is required by this preset but was not found.")
  })
})

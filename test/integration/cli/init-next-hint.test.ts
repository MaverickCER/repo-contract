import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { distBuilt } from "../../helpers/dist-built.js"

// The real bin in a scratch project with no tsx. `init --preset` reads the tier's checks from
// dist/tiers.js, so the tier cases need a build.
const root = path.resolve(__dirname, "../../..")
const bin = path.join(root, "bin", "repo-contract.mjs")
const tiersBuilt = distBuilt(["tiers.js"])

const scratch: string[] = []
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function initWithoutTsx(args: string[]) {
  const dir = mkdtempSync(path.join(tmpdir(), "rc-init-next-"))
  scratch.push(dir)
  writeFileSync(path.join(dir, "package.json"), `${JSON.stringify({ name: "p" })}\n`)
  return spawnSync("node", [bin, "init", ...args], { cwd: dir, encoding: "utf8" })
}

/** The lines after "Next:", without their indent. */
function nextSteps(stdout: string): string[] {
  return stdout
    .slice(stdout.indexOf("Next:\n") + "Next:\n".length)
    .trimEnd()
    .split("\n")
    .map((line) => line.trim())
}

describe("init's hint when tsx is missing", () => {
  it.skipIf(!tiersBuilt).each([
    [["--preset", "strict"], "npx repo-contract init --preset strict"],
    [["--preset=basic"], "npx repo-contract init --preset=basic"],
  ])("repeats %j in the rerun it suggests", (args, rerun) => {
    const result = initWithoutTsx(args)
    expect(result.status).toBe(0)
    expect(nextSteps(result.stdout)).toEqual([
      "npm install --save-dev tsx",
      rerun,
      "npx repo-contract explain",
      "npm run contract",
    ])
    expect(result.stdout).toContain(
      `install tsx as a devDependency, then run \`${rerun.slice("npx ".length)}\` again.`,
    )
  })

  it("suggests plain init again when it was run without arguments", () => {
    const result = initWithoutTsx([])
    expect(result.status).toBe(0)
    expect(nextSteps(result.stdout)).toEqual([
      "npm install --save-dev tsx",
      "npx repo-contract init",
      "npm run contract",
    ])
    expect(result.stdout).toContain("then run `repo-contract init` again.")
  })
})

import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { distBuilt } from "../../helpers/dist-built.js"

// The real bin in a scratch directory that no repository contains. GIT_CEILING_DIRECTORIES stops
// git's search at the scratch directory's parent, so a checkout above tmpdir cannot be found.
const root = path.resolve(__dirname, "../../..")
const bin = path.join(root, "bin", "repo-contract.mjs")
const dir = mkdtempSync(path.join(tmpdir(), "rc-doctor-no-git-"))
writeFileSync(path.join(dir, "package.json"), '{ "name": "p" }\n')
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

const run = (args: string[]) =>
  spawnSync("node", [bin, "doctor", ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(dir) },
  })

describe.skipIf(!distBuilt(["affected.js"]))(
  "repo-contract doctor outside a git repository",
  () => {
    it("exits 1 and names the cause on stderr", () => {
      const result = run([])
      expect(result.status).toBe(1)
      expect(result.stdout).toBe("")
      expect(result.stderr).toBe(
        "repo-contract doctor: failed: git cannot list the tracked files\n",
      )
    })

    it("with --json, exits 1 and prints the cause as JSON on stdout", () => {
      const result = run(["--json"])
      expect(result.status).toBe(1)
      expect(result.stderr).toBe("")
      expect(JSON.parse(result.stdout)).toEqual({
        schemaVersion: 1,
        error: "git cannot list the tracked files",
      })
    })
  },
)

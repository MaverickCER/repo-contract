import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { mutationExceptionId } from "../../../src/affected/index.js"
import { distBuilt } from "../../helpers/dist-built.js"

// The real bin in a scratch project. `except` and `exceptions` import dist/helpers.js and
// dist/affected.js, so these cases need a build.
const root = path.resolve(__dirname, "../../..")
const bin = path.join(root, "bin", "repo-contract.mjs")
const built = distBuilt(["helpers.js", "affected.js"])

const scratch: string[] = []
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function project(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rc-except-"))
  scratch.push(dir)
  return dir
}

const run = (cwd: string, args: string[]) =>
  spawnSync("node", [bin, ...args], { cwd, encoding: "utf8" })

const report = {
  schemaVersion: "2",
  files: {
    "src/a.ts": {
      source: "export const big = (n: number) => n > 10\n",
      mutants: [
        {
          id: "1",
          mutatorName: "EqualityOperator",
          replacement: "n >= 10",
          status: "Survived",
          location: { start: { line: 1, column: 35 }, end: { line: 1, column: 41 } },
        },
      ],
    },
  },
}
const id = mutationExceptionId({
  file: "src/a.ts",
  mutator: "EqualityOperator",
  original: "n > 10",
  replacement: "n >= 10",
})

const FIELDS = [
  "justification=Equivalent: callers never pass 10.",
  "ruleBroken=A surviving mutant.",
  "attempted=A test at n = 10.",
  "constraint=No caller passes 10.",
  "whyPreferable=A test for an impossible input documents nothing.",
  "residualRisk=A future caller passing 10.",
  "revisitWhen=A caller passes 10.",
  "expires=2027-06-30",
]

describe.skipIf(!built)("repo-contract except and exceptions (real bin)", () => {
  it("builds a mutation record from the report, fills it, and the inventory counts it", () => {
    const dir = project()
    mkdirSync(path.join(dir, "reports", "mutation"), { recursive: true })
    writeFileSync(path.join(dir, "reports", "mutation", "mutation.json"), JSON.stringify(report))

    const stub = run(dir, ["except", id])
    expect(stub.stderr).toBe("")
    expect(stub.status).toBe(1)
    expect(stub.stdout).toContain(`${id}: created in .repo-contract/exceptions/mutation.json.`)
    expect(stub.stdout).toContain("Still blank: justification, ruleBroken")

    const incomplete = JSON.parse(run(dir, ["exceptions", "--json"]).stdout) as {
      total: number
      incomplete: number
    }
    expect(incomplete).toMatchObject({ total: 1, incomplete: 1 })

    const filled = run(dir, ["except", id, ...FIELDS.flatMap((pair) => ["--set", pair])])
    expect(filled.status).toBe(0)
    expect(filled.stdout).toContain("updated")
    expect(filled.stdout).toContain("Complete.")

    const text = readFileSync(
      path.join(dir, ".repo-contract", "exceptions", "mutation.json"),
      "utf8",
    )
    const [record] = (JSON.parse(text) as { exceptions: Record<string, unknown>[] }).exceptions
    expect(Object.keys(record ?? {}).slice(0, 3)).toEqual(["id", "version", "justification"])
    expect(record).toMatchObject({ id, version: 2, original: "n > 10", expires: "2027-06-30" })

    const inventory = run(dir, ["exceptions"])
    expect(inventory.status).toBe(0)
    expect(inventory.stdout).toContain("- mutation: 1")
    expect(inventory.stdout).not.toContain("incomplete;")
  })

  it("leaves the registry untouched when the edit would be invalid", () => {
    const dir = project()
    writeFileSync(path.join(dir, "m.json"), JSON.stringify(report))
    expect(run(dir, ["except", id, "--report", "m.json"]).status).toBe(1)
    const file = path.join(dir, ".repo-contract", "exceptions", "mutation.json")
    const before = readFileSync(file, "utf8")
    const bad = run(dir, ["except", id, "--set", "expires=next year", "--json"])
    expect(bad.status).toBe(1)
    expect(JSON.parse(bad.stdout)).toMatchObject({ schemaVersion: 1, id, state: "error" })
    expect(readFileSync(file, "utf8")).toBe(before)
  })

  it("exits 2 on a usage error and 1 on an id nothing holds", () => {
    const dir = project()
    expect(run(dir, ["except"])).toMatchObject({ status: 2, stdout: "" })
    expect(run(dir, ["exceptions", "--bogus"])).toMatchObject({ status: 2, stdout: "" })
    const missing = run(dir, ["except", "dead-code:nothing"])
    expect(missing.status).toBe(1)
    expect(missing.stderr).toContain("run the contract first")
  })

  it("lists explain, except and exceptions in the top-level help", () => {
    const help = run(root, ["--help"]).stdout
    for (const command of ["explain", "except <id>", "exceptions"]) {
      expect(help).toContain(`repo-contract ${command}`)
    }
  })
})

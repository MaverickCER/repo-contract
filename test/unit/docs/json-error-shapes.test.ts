import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, it } from "vitest"
import { runDoctor } from "../../../bin/doctor-cli.mjs"
import { runMutation } from "../../../bin/mutation-cli.mjs"

/**
 * `doctor --json` and `mutation run --json` report a failure in two shapes. GUIDE.md names the
 * keys of each; these tests read those keys and compare them with what each command prints.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const guide = readFileSync(path.join(root, "GUIDE.md"), "utf8")
const scratch = mkdtempSync(path.join(tmpdir(), "rc-json-error-shapes-"))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/**
 * @param lead - The words that open the GUIDE.md sentence.
 * @returns The keys of the first `{ a, b }` shape after them.
 */
function documentedKeys(lead: string): string[] {
  const at = guide.indexOf(lead)
  expect(at, `GUIDE.md says "${lead}"`).toBeGreaterThan(-1)
  const shape = /`\{ ([^}]+) \}`/.exec(guide.slice(at))?.[1]
  expect(shape, `GUIDE.md shows a \`{ ... }\` shape after "${lead}"`).toBeDefined()
  return (shape ?? "").split(", ")
}

/** Fails the test if a command touches a capability the failure path never needs. */
const unused = (): never => {
  throw new Error("not used on this path")
}

describe("the JSON failure shapes GUIDE.md documents", () => {
  it("doctor --json prints { schemaVersion, error }", async () => {
    const out: string[] = []
    const code = await runDoctor({
      argv: ["--json", "-C", "missing"],
      cwd: scratch,
      version: "1",
      stdout: (text: string) => out.push(text),
      stderr: () => undefined,
      engine: {},
      createCapabilities: unused,
    })
    expect(code).toBe(1)
    const printed = JSON.parse(out.join("")) as Record<string, unknown>
    expect(Object.keys(printed)).toEqual(documentedKeys("With `--json` it then prints"))
    expect(printed.error).toBe(`the directory ${path.join(scratch, "missing")} does not exist`)
  })

  it('mutation run --json prints its whole report, with state "error"', async () => {
    const out: string[] = []
    const code = await runMutation({
      argv: ["run", "--json"],
      cwd: scratch,
      version: "1",
      stdout: (text: string) => out.push(text),
      stderr: () => undefined,
      affected: {},
      helpers: {},
      stryker: unused,
      git: unused,
      now: () => new Date(0),
    })
    expect(code).toBe(1)
    const printed = JSON.parse(out.join("")) as Record<string, unknown>
    expect(Object.keys(printed)).toEqual(documentedKeys("With `--json`, `run` prints its report"))
    expect(printed.state).toBe("error")
    expect(guide).toContain('nothing it can judge, `state` is `"error"`')
  })
})

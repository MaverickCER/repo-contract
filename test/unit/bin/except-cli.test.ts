import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { mkdir, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { EXCEPT_USAGE, parseExceptArgs, runExcept } from "../../../bin/except-cli.mjs"
import * as affected from "../../../src/affected/index.js"
import * as helpers from "../../../src/helpers/index.js"

const REGISTRY_DIR = ".repo-contract/exceptions"

const scratch: string[] = []
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function project(registries: Record<string, unknown> = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), "rc-except-cli-"))
  scratch.push(root)
  if (Object.keys(registries).length > 0)
    mkdirSync(path.join(root, REGISTRY_DIR), { recursive: true })
  for (const [name, records] of Object.entries(registries)) {
    writeFileSync(
      path.join(root, REGISTRY_DIR, `${name}.json`),
      typeof records === "string" ? records : JSON.stringify({ exceptions: records }, null, 2),
    )
  }
  return root
}

const blankV2 = {
  ruleBroken: "",
  attempted: "",
  constraint: "",
  whyPreferable: "",
  residualRisk: "",
  revisitWhen: "",
  expires: "",
}

const deadCodeStub = {
  id: "dead-code:unused-file:src/a.ts",
  version: 2,
  justification: "",
  kind: "unused-file",
  name: "src/a.ts",
  ...blankV2,
}

const securityStub = {
  id: "security-deps:lodash@<4.17.21",
  version: 2,
  justification: "",
  package: "lodash",
  range: "<4.17.21",
  severity: "high",
  alternatives: "",
  remediation: "",
  method: "",
  exceptionType: "",
  ...blankV2,
}

const SOURCE = ["const a = 1", "if (a > 0) {", "  run(a)", "}"].join("\n")
const mutationReport = {
  schemaVersion: "2",
  files: {
    "src/a.ts": {
      source: SOURCE,
      mutants: [
        {
          id: "1",
          mutatorName: "EqualityOperator",
          replacement: "a >= 0",
          status: "Survived",
          location: { start: { line: 2, column: 5 }, end: { line: 2, column: 10 } },
        },
      ],
    },
  },
}
const mutantId = affected.mutationExceptionId({
  file: "src/a.ts",
  mutator: "EqualityOperator",
  original: "a > 0",
  replacement: "a >= 0",
})

const registry = (root: string, name: string) =>
  (
    JSON.parse(readFileSync(path.join(root, REGISTRY_DIR, `${name}.json`), "utf8")) as {
      exceptions: Record<string, unknown>[]
    }
  ).exceptions

async function invoke(argv: string[], cwd: string, extra: Record<string, unknown> = {}) {
  const out: string[] = []
  const err: string[] = []
  const code = await runExcept({
    argv,
    cwd,
    version: "9.9.9",
    stdout: (text: string) => out.push(text),
    stderr: (text: string) => err.push(text),
    helpers,
    affected,
    readFile: (file: string) => readFile(file, "utf8").catch(() => undefined),
    mkdir: (dir: string) => mkdir(dir, { recursive: true }),
    ...extra,
  })
  const stdout = out.join("")
  return { code, stdout, stderr: err.join(""), json: () => JSON.parse(stdout) as ExceptJson }
}

interface ExceptJson {
  schemaVersion: 1
  id: string
  registry?: string
  state: string
  complete?: boolean
  missing?: string[]
  record?: Record<string, unknown>
  message?: string
}

const allFilled = (root: string, id: string, extra: string[] = []) =>
  invoke(
    [
      id,
      ...[
        "justification=j",
        "ruleBroken=r",
        "attempted=a",
        "constraint=c",
        "whyPreferable=w",
        "residualRisk=rr",
        "revisitWhen=rw",
        ...extra,
      ].flatMap((pair) => ["--set", pair]),
      "--json",
    ],
    root,
  )

describe("parseExceptArgs", () => {
  it("reads the id, each --set and the defaults", () => {
    expect(
      parseExceptArgs(["x:1", "--set", "justification=a=b", "--set=attempted="]),
    ).toStrictEqual({
      kind: "run",
      options: {
        id: "x:1",
        set: [
          { field: "justification", value: "a=b" },
          { field: "attempted", value: "" },
        ],
        dir: REGISTRY_DIR,
        report: "reports/mutation/mutation.json",
        json: false,
      },
    })
    expect(
      parseExceptArgs(["x:1", "--dir", "d", "--report", "r.json", "--json", "-C", "s"]),
    ).toStrictEqual({
      kind: "run",
      options: { id: "x:1", set: [], dir: "d", report: "r.json", json: true, cwd: "s" },
    })
  })

  it.each([
    [[], "give the id of one exception record"],
    [["a:1", "b:2"], "unexpected argument 'b:2'"],
    [["a:1", "--set", "nofield"], "--set needs <field>=<text>, not 'nofield'"],
    [["a:1", "--set", "=text"], "--set needs <field>=<text>, not '=text'"],
    [["a:1", "--set"], "option '--set' needs a value"],
    [["a:1", "--bogus"], "unknown option '--bogus'"],
  ])("rejects %j", (argv, message) => {
    expect(parseExceptArgs(argv)).toEqual({ kind: "error", message })
  })

  it("takes a one-letter field name", () => {
    expect(parseExceptArgs(["a:1", "--set", "j=x"])).toMatchObject({
      options: { set: [{ field: "j", value: "x" }] },
    })
  })
})

describe("R4 repo-contract except", () => {
  it("finds the record by id across the registry directory and sets each --set field", async () => {
    const root = project({ "dead-code": [deadCodeStub], other: [] })
    const result = await invoke(
      [
        deadCodeStub.id,
        "--set",
        "justification=Generated at build time.",
        "--set",
        "expires=2027-01-31",
      ],
      root,
    )
    expect(result.code).toBe(1)
    const [record] = registry(root, "dead-code")
    expect(record).toMatchObject({
      justification: "Generated at build time.",
      expires: "2027-01-31",
      kind: "unused-file",
    })
    expect(result.stdout).toContain(`${deadCodeStub.id}: updated in ${REGISTRY_DIR}/dead-code.json`)
  })

  it("creates a mutation record from reports/mutation/mutation.json when none exists", async () => {
    const root = project()
    mkdirSync(path.join(root, "reports/mutation"), { recursive: true })
    writeFileSync(path.join(root, "reports/mutation/mutation.json"), JSON.stringify(mutationReport))
    const result = await invoke([mutantId, "--json"], root)
    expect(result.code).toBe(1)
    expect(result.json()).toMatchObject({
      schemaVersion: 1,
      id: mutantId,
      registry: `${REGISTRY_DIR}/mutation.json`,
      state: "created",
      complete: false,
    })
    expect(registry(root, "mutation")).toEqual([
      {
        id: mutantId,
        version: 2,
        justification: "",
        ...blankV2,
        file: "src/a.ts",
        mutator: "EqualityOperator",
        original: "a > 0",
        replacement: "a >= 0",
      },
    ])
  })

  it("reads --report for a mutation id and fills the new record in one call", async () => {
    const root = project({ "dead-code": [deadCodeStub] })
    writeFileSync(path.join(root, "shard.json"), JSON.stringify(mutationReport))
    const result = await allFilled(root, mutantId, ["expires=2027-06-30"])
    expect(result.stderr).toBe("")
    expect(result.code).toBe(1)
    expect(result.json().message).toContain("reports/mutation/mutation.json")
    const withReport = await invoke(
      [mutantId, "--report", "shard.json", "--set", "justification=j", "--json"],
      root,
    )
    expect(withReport.json()).toMatchObject({ state: "created", complete: false })
    expect(withReport.json().missing).toEqual([
      "ruleBroken",
      "attempted",
      "constraint",
      "whyPreferable",
      "residualRisk",
      "revisitWhen",
    ])
    expect(registry(root, "mutation")[0]?.justification).toBe("j")
  })

  it("exits 1 when a mutation id matches no mutant in the report", async () => {
    const root = project()
    writeFileSync(path.join(root, "m.json"), JSON.stringify(mutationReport))
    const result = await invoke(
      ["mutation:src/a.ts:EqualityOperator:000000000000", "--report", "m.json", "--json"],
      root,
    )
    expect(result.code).toBe(1)
    expect(result.json()).toMatchObject({ state: "error" })
    expect(result.json().message).toContain("no mutant in m.json")
    writeFileSync(path.join(root, "bad.json"), "{")
    const unreadable = await invoke([mutantId, "--report", "bad.json"], root)
    expect(unreadable.code).toBe(1)
    expect(unreadable.stderr).toContain("bad.json is not valid JSON")
    writeFileSync(path.join(root, "shape.json"), "{}")
    const shapeless = await invoke([mutantId, "--report", "shape.json"], root)
    expect(shapeless.stderr).toContain('"files"')
  })

  it("exits 0 and reports complete when no required field is blank", async () => {
    const root = project({ "dead-code": [deadCodeStub] })
    const result = await allFilled(root, deadCodeStub.id)
    expect(result.code).toBe(0)
    expect(result.json()).toMatchObject({ state: "updated", complete: true, missing: [] })
    const again = await invoke([deadCodeStub.id], root)
    expect(again.code).toBe(0)
    expect(again.stdout).toContain("unchanged")
    expect(again.stdout).toContain("Complete")
  })

  it("exits 1 and lists the blank fields when the record is incomplete", async () => {
    const root = project({ "security-deps": [securityStub] })
    const result = await allFilled(root, securityStub.id, ["method=independent-human-review"])
    expect(result.code).toBe(1)
    expect(result.json()).toMatchObject({
      complete: false,
      missing: ["alternatives", "remediation", "exceptionType"],
    })
    const text = await invoke([securityStub.id], root)
    expect(text.stdout).toContain("Still blank: alternatives, remediation, exceptionType")
    expect(text.stdout).toContain("--set alternatives=")
  })

  it("exits 1 when no registry holds the id and it is not a mutation id", async () => {
    const root = project({ "dead-code": [deadCodeStub], broken: "{" })
    const result = await invoke(["socket:nothing", "--json"], root)
    expect(result.code).toBe(1)
    const { message, ...rest } = result.json()
    expect(rest).toEqual({ schemaVersion: 1, id: "socket:nothing", state: "error" })
    expect(message).toContain("no registry in .repo-contract/exceptions holds")
    expect(message).toContain("broken")
  })

  it.each([
    [
      "is not JSON",
      `{ "exceptions": [ { "id": "mutation:kept", "justification": "hand-written" }, ] }`,
    ],
    ["has no exceptions array", `{ "records": [{ "id": "mutation:kept" }] }\n`],
  ])(
    "refuses to write a mutation registry that %s, and leaves it byte-identical",
    async (_, text) => {
      const root = project({ mutation: text })
      mkdirSync(path.join(root, "reports/mutation"), { recursive: true })
      writeFileSync(
        path.join(root, "reports/mutation/mutation.json"),
        JSON.stringify(mutationReport),
      )
      const file = path.join(root, REGISTRY_DIR, "mutation.json")
      const before = readFileSync(file)

      const result = await invoke([mutantId, "--set", "justification=j", "--json"], root)

      expect(result.code).toBe(1)
      expect(result.json()).toMatchObject({ state: "error" })
      expect(result.json().message).toBe(
        `${REGISTRY_DIR}/mutation.json cannot be read, so nothing was written to it. Run 'repo-contract exceptions' to see why, then fix it and run this command again.`,
      )
      expect(readFileSync(file).equals(before)).toBe(true)
      const text2 = await invoke([mutantId], root)
      expect(text2.code).toBe(1)
      expect(text2.stderr).toContain(`${REGISTRY_DIR}/mutation.json cannot be read`)
      expect(readFileSync(file).equals(before)).toBe(true)
    },
  )

  it("refuses to write through a symlinked registry, leaving its target byte-identical", async () => {
    const root = project({ "dead-code": [deadCodeStub] })
    mkdirSync(path.join(root, "reports/mutation"), { recursive: true })
    writeFileSync(path.join(root, "reports/mutation/mutation.json"), JSON.stringify(mutationReport))
    const target = path.join(root, "elsewhere.json")
    writeFileSync(target, JSON.stringify({ exceptions: [{ id: "mutation:kept" }] }))
    symlinkSync(target, path.join(root, REGISTRY_DIR, "mutation.json"))
    const before = readFileSync(target)

    const result = await invoke([mutantId, "--json"], root)

    expect(result.code).toBe(1)
    expect(result.json().message).toContain(`${REGISTRY_DIR}/mutation.json cannot be read`)
    expect(readFileSync(target).equals(before)).toBe(true)
  })

  it("still updates a readable registry while another one is unreadable", async () => {
    const root = project({ "dead-code": [deadCodeStub], mutation: "{" })
    const result = await invoke([deadCodeStub.id, "--set", "justification=j", "--json"], root)
    expect(result.json()).toMatchObject({ state: "updated" })
    expect(readFileSync(path.join(root, REGISTRY_DIR, "mutation.json"), "utf8")).toBe("{")
  })

  it("exits 1 when two registries hold the id", async () => {
    const root = project({ a: [deadCodeStub], b: [deadCodeStub] })
    const result = await invoke([deadCodeStub.id], root)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("a.json and")
  })

  it("rejects a --set for a field the record cannot carry", async () => {
    const root = project({ "dead-code": [deadCodeStub] })
    const unknown = await invoke([deadCodeStub.id, "--set", "colour=red"], root)
    expect(unknown.code).toBe(1)
    expect(unknown.stderr).toContain("'colour' is not a field this record can carry")
    const identity = await invoke([deadCodeStub.id, "--set", "name=src/b.ts"], root)
    expect(identity.code).toBe(1)
    expect(identity.stderr).toContain("'name' identifies the finding")
    const security = await invoke([deadCodeStub.id, "--set", "method=policy-rule"], root)
    expect(security.stderr).toContain("'method' is not a field this record can carry")
    expect(registry(root, "dead-code")).toEqual([deadCodeStub])
  })

  it("validates the result with the v2 record rules before writing", async () => {
    const root = project({ "security-deps": [securityStub] })
    const badDate = await invoke([securityStub.id, "--set", "expires=2027-02-30", "--json"], root)
    expect(badDate.code).toBe(1)
    expect(badDate.json()).toMatchObject({ state: "error" })
    expect(badDate.json().message).toContain("expires")
    const badMethod = await invoke([securityStub.id, "--set", "method=vibes"], root)
    expect(badMethod.code).toBe(1)
    expect(badMethod.stderr).toContain("method must be")
    const falsePositive = await invoke(
      [
        securityStub.id,
        "--set",
        "exceptionType=validated-false-positive",
        "--set",
        "method=policy-rule",
      ],
      root,
    )
    expect(falsePositive.stderr).toContain("mechanical-reverification")
    expect(registry(root, "security-deps")).toEqual([securityStub])
  })

  it("refuses a mutation record whose id no longer matches its own fields", async () => {
    const tampered = {
      id: mutantId,
      version: 2,
      justification: "",
      ...blankV2,
      file: "src/a.ts",
      mutator: "EqualityOperator",
      original: "a < 0",
      replacement: "a >= 0",
    }
    const root = project({ mutation: [tampered] })
    const result = await invoke([mutantId, "--set", "justification=j"], root)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("does not match the id derived")
  })

  it("upgrades a version 1 record to version 2 when a v2 field is set", async () => {
    const legacy = { id: "dead-code:x", version: 1, justification: "old", kind: "k", name: "n" }
    const root = project({ "dead-code": [legacy] })
    const untouched = await invoke(["dead-code:x", "--json"], root)
    expect(untouched.json()).toMatchObject({ state: "unchanged", complete: true })
    const upgraded = await invoke(["dead-code:x", "--set", "ruleBroken=r", "--json"], root)
    expect(upgraded.code).toBe(1)
    expect(upgraded.json().record).toMatchObject({ version: 2, ruleBroken: "r", attempted: "" })
    expect(registry(root, "dead-code")[0]).toMatchObject({ version: 2, expires: "" })
  })

  it("writes only the registry it changed", async () => {
    const otherText = '{"exceptions":[ ]}'
    const root = project({ "dead-code": [deadCodeStub], other: otherText })
    await invoke([deadCodeStub.id, "--set", "justification=j"], root)
    expect(readFileSync(path.join(root, REGISTRY_DIR, "other.json"), "utf8")).toBe(otherText)
    expect(readdirSync(path.join(root, REGISTRY_DIR)).sort()).toEqual([
      "dead-code.json",
      "other.json",
    ])
  })

  it("--json prints the record, its registry and the missing fields", async () => {
    const root = project({ "dead-code": [deadCodeStub] })
    const result = await invoke(
      [deadCodeStub.id, "--set", "justification=j", "--json", "-C", "."],
      root,
    )
    expect(result.json()).toEqual({
      schemaVersion: 1,
      id: deadCodeStub.id,
      registry: `${REGISTRY_DIR}/dead-code.json`,
      state: "updated",
      complete: false,
      missing: [
        "ruleBroken",
        "attempted",
        "constraint",
        "whyPreferable",
        "residualRisk",
        "revisitWhen",
      ],
      record: { ...deadCodeStub, justification: "j" },
    })
  })

  it("rejects a usage error with exit 2, and prints its help and version", async () => {
    const root = project()
    const usage = await invoke(["--bogus"], root)
    expect(usage).toMatchObject({ code: 2, stdout: "" })
    expect(usage.stderr).toContain("repo-contract except --help")
    expect((await invoke(["--help"], root)).stdout).toBe(`${EXCEPT_USAGE}\n`)
    expect((await invoke(["-V"], root)).stdout).toBe("9.9.9\n")
  })

  const SETTABLE =
    "justification, ruleBroken, attempted, constraint, whyPreferable, residualRisk, revisitWhen, expires"

  it("names every registry that holds the id", async () => {
    const root = project({ a: [deadCodeStub], b: [deadCodeStub], c: [deadCodeStub] })
    const result = await invoke([deadCodeStub.id], root)
    expect(result.code).toBe(1)
    expect(result.stderr).toBe(
      `repo-contract except: ${deadCodeStub.id} is in ${REGISTRY_DIR}/a.json, ${REGISTRY_DIR}/b.json and ${REGISTRY_DIR}/c.json. Keep it in one registry.\n`,
    )
  })

  it("finds the record past a null entry, and leaves the registry alone when nothing changes", async () => {
    const root = project({ "dead-code": [null, deadCodeStub] })
    const file = path.join(root, REGISTRY_DIR, "dead-code.json")
    const before = readFileSync(file)
    const result = await invoke([deadCodeStub.id, "--json"], root)
    expect(result.json()).toMatchObject({ state: "unchanged", record: deadCodeStub })
    expect(readFileSync(file).equals(before)).toBe(true)
  })

  it("refuses to write a registry that holds something other than a record", async () => {
    const root = project({ "dead-code": [deadCodeStub, null] })
    const file = path.join(root, REGISTRY_DIR, "dead-code.json")
    const before = readFileSync(file)
    const result = await invoke([deadCodeStub.id, "--set", "justification=j"], root)
    expect(result.code).toBe(1)
    expect(result.stderr).toBe(
      `repo-contract except: ${REGISTRY_DIR}/dead-code.json has an entry at exceptions[1] that is not a record with a string id, so nothing was written to it. Fix or remove that entry, then run this command again.\n`,
    )
    expect(readFileSync(file).equals(before)).toBe(true)
  })

  it("refuses to add a mutation record to a registry with a malformed entry", async () => {
    const root = project({ mutation: [7] })
    writeFileSync(path.join(root, "m.json"), JSON.stringify(mutationReport))
    const result = await invoke([mutantId, "--report", "m.json", "--json"], root)
    expect(result.json()).toMatchObject({
      state: "error",
      message: `${REGISTRY_DIR}/mutation.json has an entry at exceptions[0] that is not a record with a string id, so nothing was written to it. Fix or remove that entry, then run this command again.`,
    })
  })

  it("never rewrites a registry whose record is unchanged", async () => {
    const compact = JSON.stringify({ exceptions: [deadCodeStub] })
    const root = project({ "dead-code": compact })
    const made: string[] = []
    const result = await invoke([deadCodeStub.id, "--set", "justification="], root, {
      mkdir: (dir: string) => {
        made.push(dir)
        return Promise.resolve()
      },
    })
    expect(result.code).toBe(1)
    expect(result.stdout).toContain("unchanged")
    expect(made).toEqual([])
    expect(readFileSync(path.join(root, REGISTRY_DIR, "dead-code.json"), "utf8")).toBe(compact)
  })

  // The writer sorts a registry's records by id.
  it("replaces only the record it edits", async () => {
    const other = { ...deadCodeStub, id: "dead-code:unused-file:src/b.ts", name: "src/b.ts" }
    const root = project({ "dead-code": [other, deadCodeStub] })
    await invoke([deadCodeStub.id, "--set", "justification=j"], root)
    expect(registry(root, "dead-code")).toEqual([{ ...deadCodeStub, justification: "j" }, other])
  })

  it("adds a new mutation record to the records the mutation registry already holds", async () => {
    const kept = {
      id: "mutation:src/b.ts:M:000000000000",
      version: 1,
      justification: "kept",
      file: "src/b.ts",
      mutator: "M",
      original: "o",
      replacement: "r",
    }
    const root = project({ mutation: [kept] })
    writeFileSync(path.join(root, "m.json"), JSON.stringify(mutationReport))
    const result = await invoke([mutantId, "--report", "m.json", "--json"], root)
    expect(result.json()).toMatchObject({ state: "created" })
    expect(registry(root, "mutation").map(({ id }) => id)).toEqual([mutantId, kept.id])
  })

  it("says the mutation report could not be read when it is missing", async () => {
    const root = project()
    const result = await invoke([mutantId], root)
    expect(result.code).toBe(1)
    expect(result.stderr).toBe(
      `repo-contract except: no record holds ${mutantId}, and the mutation report reports/mutation/mutation.json could not be read. Run the Mutation check first, or name the report with --report.\n`,
    )
  })

  it.each([
    ["id=x", "'id' identifies the record, so it cannot be set."],
    ["version=3", "'version' follows the fields the record holds, so it cannot be set."],
    ["colour=red", "'colour' is not a field this record can carry."],
    ["name=src/b.ts", "'name' identifies the finding, and the check writes it."],
  ])("names the settable fields when --set %s is refused", async (pair, reason) => {
    const root = project({ "dead-code": [deadCodeStub] })
    const result = await invoke([deadCodeStub.id, "--set", pair], root)
    expect(result.stderr).toBe(`repo-contract except: ${reason} Fields you can set: ${SETTABLE}.\n`)
  })

  it("keeps a version 1 record at version 1 when only its justification is set", async () => {
    const legacy = { id: "dead-code:x", version: 1, justification: "", kind: "k", name: "n" }
    const root = project({ "dead-code": [legacy] })
    const blank = await invoke(["dead-code:x", "--json"], root)
    expect(blank.json()).toMatchObject({ complete: false, missing: ["justification"] })
    const result = await invoke(["dead-code:x", "--set", "justification=j", "--json"], root)
    expect(result.code).toBe(0)
    expect(result.json().record).toStrictEqual({ ...legacy, justification: "j" })
  })

  it("upgrades a version 1 record even when the v2 field it sets is blank", async () => {
    const legacy = { id: "dead-code:x", version: 1, justification: "old", kind: "k", name: "n" }
    const root = project({ "dead-code": [legacy] })
    const result = await invoke(["dead-code:x", "--set", "expires=", "--json"], root)
    expect(result.json()).toMatchObject({ state: "updated", record: { version: 2, expires: "" } })
    expect(registry(root, "dead-code")[0]).toMatchObject({ version: 2, ruleBroken: "" })
  })

  it("keeps a version 2 record's field order when a v2 field is set", async () => {
    const root = project({ "dead-code": [deadCodeStub] })
    const result = await invoke([deadCodeStub.id, "--set", "ruleBroken=r", "--json"], root)
    expect(Object.keys(result.json().record ?? {})).toEqual(Object.keys(deadCodeStub))
  })

  it("counts a field of spaces as blank", async () => {
    const root = project({ "dead-code": [deadCodeStub] })
    const result = await allFilled(root, deadCodeStub.id, ["justification=   "])
    expect(result.json()).toMatchObject({ complete: false, missing: ["justification"] })
  })

  it("refuses a v2 field on a version 1 record it was not asked to upgrade", async () => {
    const legacy = {
      id: "dead-code:x",
      version: 1,
      justification: "old",
      kind: "k",
      name: "n",
      ruleBroken: "r",
    }
    const root = project({ "dead-code": [legacy] })
    const result = await invoke(["dead-code:x"], root)
    expect(result.code).toBe(1)
    expect(result.stderr).toBe(
      'repo-contract except: the record would not be valid, so nothing was written:\n  has unrecognized field(s) "ruleBroken": only "id", "version", "justification", "kind", "name" are permitted.\n',
    )
  })

  it("refuses an expires field on a version 1 record", async () => {
    const legacy = { id: "dead-code:x", version: 1, justification: "old", kind: "k", name: "n" }
    const root = project({ "dead-code": [{ ...legacy, expires: "" }] })
    const result = await invoke(["dead-code:x"], root)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('has unrecognized field(s) "expires"')
  })

  it("adds the expires field a version 2 record lacks", async () => {
    const lacking: Record<string, unknown> = { ...deadCodeStub }
    delete lacking.expires
    const root = project({ "dead-code": [lacking] })
    const result = await invoke([deadCodeStub.id, "--set", "expires=", "--json"], root)
    expect(result.json()).toMatchObject({ state: "updated" })
    expect(registry(root, "dead-code")[0]).toMatchObject({ expires: "" })
  })

  it("hands the writer each id once", async () => {
    const other = { ...deadCodeStub, id: "dead-code:unused-file:src/b.ts", name: "src/b.ts" }
    const root = project({ "dead-code": [other, deadCodeStub] })
    const written: { id: string }[][] = []
    await invoke([deadCodeStub.id, "--set", "justification=j"], root, {
      helpers: {
        ...helpers,
        writeExceptionRegistry: (args: { path: string; records: { id: string }[] }) => {
          written.push(args.records)
          return helpers.writeExceptionRegistry(args)
        },
      },
    })
    expect(written.map((records) => records.map(({ id }) => id))).toEqual([
      [other.id, deadCodeStub.id],
    ])
  })

  it("lists every problem on its own line", async () => {
    const root = project({ "security-deps": [securityStub] })
    const result = await invoke(
      [securityStub.id, "--set", "expires=2027-02-30", "--set", "method=vibes"],
      root,
    )
    expect(result.stderr).toBe(
      `repo-contract except: the record would not be valid, so nothing was written:\n  expires must be "" or a YYYY-MM-DD date (got "2027-02-30").\n  method must be "" or one of "mechanical-reverification", "independent-human-review", "policy-rule" (got "vibes").\n`,
    )
  })

  it("validates the security fields when the record carries any of them", async () => {
    const partial = { ...deadCodeStub, method: "vibes" }
    const root = project({ "dead-code": [partial] })
    const file = path.join(root, REGISTRY_DIR, "dead-code.json")
    const before = readFileSync(file)
    const result = await invoke([deadCodeStub.id, "--set", "justification=j"], root)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("\n  alternatives must be a string.")
    expect(readFileSync(file).equals(before)).toBe(true)
  })

  it("refuses a mutation record that lacks one of its own fields", async () => {
    const lacking = {
      id: mutantId,
      version: 2,
      justification: "",
      ...blankV2,
      file: "src/a.ts",
      mutator: "EqualityOperator",
      original: "a > 0",
    }
    const root = project({ mutation: [lacking] })
    const result = await invoke([mutantId, "--set", "justification=j"], root)
    expect(result.stderr).toBe(
      `repo-contract except: the record would not be valid, so nothing was written:\n  ${mutantId} does not match the id derived from its own file, mutator, original and replacement (undefined).\n`,
    )
  })

  it("says nothing about unreadable registries when every one was read", async () => {
    const root = project({ "dead-code": [deadCodeStub] })
    const result = await invoke(["socket:nothing"], root)
    expect(result.stderr).toBe(
      `repo-contract except: no registry in ${REGISTRY_DIR} holds socket:nothing. A check writes the blank record when it finds the problem, so run the contract first.\n`,
    )
  })

  it("names every registry it could not read", async () => {
    const root = project({ broken: "{", cracked: "[" })
    const result = await invoke(["socket:nothing"], root)
    expect(result.stderr).toContain(" These registries could not be read: broken, cracked.\n")
  })

  it("exits 1 when the registry cannot be written", async () => {
    const root = project({ "dead-code": [deadCodeStub] })
    const result = await invoke([deadCodeStub.id, "--set", "justification=j"], root, {
      helpers: {
        ...helpers,
        writeExceptionRegistry: () => Promise.resolve({ ok: false, error: "disk full" }),
      },
    })
    expect(result.code).toBe(1)
    expect(result.stderr).toBe(
      `repo-contract except: could not write ${REGISTRY_DIR}/dead-code.json: disk full\n`,
    )
  })

  it("reports an unexpected error as a failure", async () => {
    const root = project({ "dead-code": [deadCodeStub] })
    const result = await invoke([deadCodeStub.id, "--set", "justification=j"], root, {
      mkdir: () => Promise.reject(new Error("EACCES")),
    })
    expect(result.code).toBe(1)
    expect(result.stderr).toBe("repo-contract except: failed: EACCES\n")
  })

  it("prints the blank fields and an example --set as text", async () => {
    const root = project({ "dead-code": [deadCodeStub] })
    const result = await invoke([deadCodeStub.id, "--set", "justification=j"], root)
    expect(result.stdout).toBe(
      [
        `${deadCodeStub.id}: updated in ${REGISTRY_DIR}/dead-code.json.`,
        "Still blank: ruleBroken, attempted, constraint, whyPreferable, residualRisk, revisitWhen.",
        "Fill each one in with --set, for example:",
        `  repo-contract except '${deadCodeStub.id}' --set ruleBroken='<text>'`,
        "",
      ].join("\n"),
    )
  })
})

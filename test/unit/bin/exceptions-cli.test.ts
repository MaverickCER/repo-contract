import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  EXCEPTIONS_USAGE,
  parseExceptionsArgs,
  runExceptions,
} from "../../../bin/exceptions-cli.mjs"
import * as helpers from "../../../src/helpers/index.js"

const scratch: string[] = []
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function project(registries: Record<string, string>, dir = ".repo-contract/exceptions"): string {
  const root = mkdtempSync(path.join(tmpdir(), "rc-exceptions-cli-"))
  scratch.push(root)
  mkdirSync(path.join(root, dir), { recursive: true })
  for (const [name, text] of Object.entries(registries)) {
    writeFileSync(path.join(root, dir, name), text)
  }
  return root
}

const record = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  version: 2,
  justification: "why",
  ruleBroken: "r",
  attempted: "a",
  constraint: "c",
  whyPreferable: "w",
  residualRisk: "rr",
  revisitWhen: "rw",
  expires: "",
  ...extra,
})

async function invoke(argv: string[], cwd: string) {
  const out: string[] = []
  const err: string[] = []
  const code = await runExceptions({
    argv,
    cwd,
    version: "9.9.9",
    stdout: (text: string) => out.push(text),
    stderr: (text: string) => err.push(text),
    helpers,
    now: () => new Date("2026-11-16T00:00:00Z"),
  })
  return { code, stdout: out.join(""), stderr: err.join("") }
}

describe("parseExceptionsArgs", () => {
  it("defaults the directory and reads --dir, --json and -C", () => {
    expect(parseExceptionsArgs([])).toStrictEqual({
      kind: "run",
      options: { dir: ".repo-contract/exceptions", json: false },
    })
    expect(parseExceptionsArgs(["--dir", "x", "--json", "-C", "sub"])).toStrictEqual({
      kind: "run",
      options: { dir: "x", json: true, cwd: "sub" },
    })
    expect(parseExceptionsArgs(["--dir=y"])).toStrictEqual({
      kind: "run",
      options: { dir: "y", json: false },
    })
  })

  it.each([
    [["--bogus"], "unknown option '--bogus'"],
    [["--dir"], "option '--dir' needs a value"],
    [["--dir", "--json"], "option '--dir' needs a value"],
    [["extra"], "unexpected argument 'extra'"],
  ])("rejects %j", (argv, message) => {
    expect(parseExceptionsArgs(argv)).toEqual({ kind: "error", message })
  })

  it("answers --help and --version", () => {
    expect(parseExceptionsArgs(["--help"])).toEqual({ kind: "help" })
    expect(parseExceptionsArgs(["-V"])).toEqual({ kind: "version" })
  })
})

describe("R4 repo-contract exceptions", () => {
  it("prints the rendered inventory of .repo-contract/exceptions", async () => {
    const root = project({
      "dead-code.json": JSON.stringify({
        exceptions: [record("dead-code:a"), record("dead-code:b", { justification: "" })],
      }),
      "socket.json": JSON.stringify({
        exceptions: [{ id: "socket:x", version: 1, justification: "old" }],
      }),
    })
    const { code, stdout, stderr } = await invoke([], root)
    expect(code).toBe(0)
    expect(stderr).toBe("")
    expect(stdout).toContain("3 exception(s) across 2 registries")
    expect(stdout).toContain("- dead-code: 2")
    expect(stdout).toContain("1 incomplete")
    expect(stdout).toContain("- socket: 1")
  })

  it("--json prints the ExceptionInventory", async () => {
    const root = project({
      "mutation.json": JSON.stringify({
        exceptions: [record("mutation:x", { expires: "2026-01-01" })],
      }),
    })
    const { code, stdout } = await invoke(["--json"], root)
    expect(code).toBe(0)
    const inventory = JSON.parse(stdout) as helpers.ExceptionInventory
    expect(inventory).toMatchObject({ schemaVersion: 1, total: 1, expired: 1, errors: [] })
    expect(inventory.registries[0]?.name).toBe("mutation")
  })

  it("--dir reads another directory, relative to -C", async () => {
    const root = project({ "a.json": JSON.stringify({ exceptions: [record("a:1")] }) }, "sub/reg")
    const { stdout } = await invoke(["--json", "-C", "sub", "--dir", "reg"], root)
    expect((JSON.parse(stdout) as helpers.ExceptionInventory).total).toBe(1)
  })

  it("says so when there is no registry directory", async () => {
    const root = project({})
    const { code, stdout } = await invoke(["--dir", "missing"], root)
    expect(code).toBe(0)
    expect(stdout).toContain("No exceptions recorded")
  })

  it("exits 0 even with unreadable registries, listing them", async () => {
    const root = project({
      "broken.json": "{ not json",
      "shape.json": JSON.stringify({ records: [] }),
      "ok.json": JSON.stringify({ exceptions: [] }),
    })
    const text = await invoke([], root)
    expect(text.code).toBe(0)
    expect(text.stdout).toContain("- broken: UNREADABLE")
    expect(text.stdout).toContain("- shape: UNREADABLE")
    const json = await invoke(["--json"], root)
    expect(
      (JSON.parse(json.stdout) as helpers.ExceptionInventory).errors.map(({ name }) => name),
    ).toEqual(["broken", "shape"])
  })

  it("lists a symlinked registry as skipped, never reading it or counting its records", async () => {
    const root = project({ "ok.json": JSON.stringify({ exceptions: [record("ok:1")] }) })
    const registries = path.join(root, ".repo-contract/exceptions")
    writeFileSync(path.join(root, "secret.txt"), "TOKEN=hunter2-outside-the-directory")
    writeFileSync(
      path.join(root, "outside.json"),
      JSON.stringify({ exceptions: [record("outside:1"), record("outside:2")] }),
    )
    symlinkSync(path.join(root, "secret.txt"), path.join(registries, "leak.json"))
    symlinkSync(path.join(root, "outside.json"), path.join(registries, "linked.json"))
    mkdirSync(path.join(registries, "folder.json"))

    const json = await invoke(["--json"], root)
    expect(json.code).toBe(0)
    const inventory = JSON.parse(json.stdout) as helpers.ExceptionInventory
    expect(inventory.total).toBe(1)
    expect(inventory.registries.map(({ name }) => name)).toEqual(["ok"])
    expect(inventory.errors).toEqual([
      { name: "folder", error: "skipped: not a regular file" },
      { name: "leak", error: "skipped: a symbolic link, which is never followed" },
      { name: "linked", error: "skipped: a symbolic link, which is never followed" },
    ])
    const text = await invoke([], root)
    expect(text.stdout).toContain("- leak: UNREADABLE: skipped: a symbolic link")
    expect(`${json.stdout}${text.stdout}`).not.toContain("hunter2")
  })

  it("keeps a registry's contents out of the reason it cannot be read", async () => {
    const root = project({
      "broken.json": "TOKEN=hunter2 is not JSON",
      "shape.json": JSON.stringify({ records: "hunter2" }),
    })
    const json = await invoke(["--json"], root)
    expect((JSON.parse(json.stdout) as helpers.ExceptionInventory).errors).toEqual([
      { name: "broken", error: "not valid JSON" },
      { name: "shape", error: 'no "exceptions" array' },
    ])
    const text = await invoke([], root)
    expect(`${json.stdout}${text.stdout}${text.stderr}`).not.toContain("hunter2")
  })

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "names the error code when a registry or the directory cannot be read",
    async () => {
      const root = project({ "locked.json": "{}" })
      const registries = path.join(root, ".repo-contract/exceptions")
      chmodSync(path.join(registries, "locked.json"), 0o000)
      const file = await invoke(["--json"], root)
      expect((JSON.parse(file.stdout) as helpers.ExceptionInventory).errors).toEqual([
        { name: "locked", error: "cannot be read (EACCES)" },
      ])
      chmodSync(path.join(registries, "locked.json"), 0o600)
      writeFileSync(path.join(root, "plain"), "")
      const directory = await invoke(["--json", "--dir", "plain"], root)
      expect((JSON.parse(directory.stdout) as helpers.ExceptionInventory).errors).toEqual([
        { name: path.join(root, "plain"), error: "cannot be read (ENOTDIR)" },
      ])
    },
  )

  it("rejects an unknown flag with exit 2", async () => {
    const { code, stdout, stderr } = await invoke(["--bogus"], project({}))
    expect(code).toBe(2)
    expect(stdout).toBe("")
    expect(stderr).toContain("unknown option '--bogus'")
    expect(stderr).toContain("repo-contract exceptions --help")
  })

  it("prints its help and version", async () => {
    const root = project({})
    expect((await invoke(["--help"], root)).stdout).toBe(`${EXCEPTIONS_USAGE}\n`)
    expect((await invoke(["--version"], root)).stdout).toBe("9.9.9\n")
    expect(EXCEPTIONS_USAGE).toContain("--dir <dir>")
  })
})

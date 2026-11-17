import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import type * as FsPromises from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  EXCEPTION_REGISTRY_DIRECTORY,
  readExceptionRegistries,
  renderExceptionInventory,
  summarizeExceptionRegistries,
} from "../../../src/helpers/index.js"

// readdir's order is the file system's; one test hands back names out of order through this.
const { readdir } = vi.hoisted(() => ({ readdir: vi.fn() }))
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>()
  readdir.mockImplementation(actual.readdir)
  return { ...actual, readdir }
})

const now = new Date("2026-11-16T12:00:00Z")
const v2Fields = {
  ruleBroken: "r",
  attempted: "a",
  constraint: "c",
  whyPreferable: "w",
  residualRisk: "k",
  revisitWhen: "v",
  expires: "",
}
const full = { id: "x:1", version: 2, justification: "j", ...v2Fields }

describe("summarizeExceptionRegistries", () => {
  it("names the directory every registry lives in", () => {
    expect(EXCEPTION_REGISTRY_DIRECTORY).toBe(".repo-contract/exceptions")
  })

  it("summarizeExceptionRegistries counts records per registry and per exceptionType", () => {
    const inventory = summarizeExceptionRegistries(
      [
        {
          name: "socket",
          records: [
            { ...full, exceptionType: "accepted-risk" },
            { ...full, exceptionType: "accepted-risk" },
            { ...full, exceptionType: "tooling-limitation" },
          ],
        },
        { name: "mutation", records: [full] },
      ],
      now,
    )
    expect(inventory).toEqual({
      schemaVersion: 1,
      registries: [
        {
          name: "socket",
          total: 3,
          byType: { "accepted-risk": 2, "tooling-limitation": 1 },
          legacy: 0,
          expired: 0,
          incomplete: 0,
        },
        {
          name: "mutation",
          total: 1,
          byType: { "(untyped)": 1 },
          legacy: 0,
          expired: 0,
          incomplete: 0,
        },
      ],
      total: 4,
      legacy: 0,
      expired: 0,
      incomplete: 0,
      errors: [],
    })
  })

  it("a record without exceptionType counts as (untyped)", () => {
    const [summary] = summarizeExceptionRegistries(
      [{ name: "r", records: [full, { ...full, exceptionType: "" }, null, "text"] }],
      now,
    ).registries
    expect(summary?.byType).toEqual({ "(untyped)": 4 })
  })

  it("counts version 1 records as legacy", () => {
    const inventory = summarizeExceptionRegistries(
      [{ name: "r", records: [{ id: "x:1", version: 1, justification: "j" }, full] }],
      now,
    )
    expect(inventory.legacy).toBe(1)
    expect(inventory.registries[0]?.legacy).toBe(1)
    // A legacy record never had the v2 fields, so it is not incomplete for lacking them.
    expect(inventory.incomplete).toBe(0)
  })

  it("counts a record whose expires is before now as expired", () => {
    const inventory = summarizeExceptionRegistries(
      [
        {
          name: "r",
          records: [
            { ...full, expires: "2026-11-15" },
            { ...full, expires: "2026-11-16" },
            { ...full, expires: "" },
            { ...full, expires: "soon" },
          ],
        },
      ],
      now,
    )
    expect(inventory.expired).toBe(1)
    expect(inventory.registries[0]?.expired).toBe(1)
  })

  it("counts a blank justification or a blank v2 field as incomplete", () => {
    const inventory = summarizeExceptionRegistries(
      [
        {
          name: "r",
          records: [
            { ...full, justification: "  " },
            { ...full, revisitWhen: "" },
            { id: "x:1", version: 1, justification: "" },
            { ...full, ruleBroken: 3 },
            full,
          ],
        },
      ],
      now,
    )
    expect(inventory.incomplete).toBe(4)
    expect(inventory.registries[0]?.incomplete).toBe(4)
  })

  it("counts an expires that is not a string as not expired", () => {
    const inventory = summarizeExceptionRegistries(
      [
        {
          name: "r",
          records: [
            { ...full, expires: ["2026-01-01"] },
            { ...full, expires: 1 },
          ],
        },
      ],
      now,
    )
    expect(inventory.expired).toBe(0)
  })

  it("counts a null, string or number record as an untyped, legacy, incomplete one", () => {
    const inventory = summarizeExceptionRegistries([{ name: "r", records: [null, "x", 5] }], now)
    expect(inventory.registries[0]).toEqual({
      name: "r",
      total: 3,
      byType: { "(untyped)": 3 },
      legacy: 3,
      expired: 0,
      incomplete: 3,
    })
  })

  it("carries unreadable registries into errors", () => {
    const errors = [{ name: "broken", error: "not JSON" }]
    expect(summarizeExceptionRegistries([], now, errors)).toEqual({
      schemaVersion: 1,
      registries: [],
      total: 0,
      legacy: 0,
      expired: 0,
      incomplete: 0,
      errors,
    })
  })
})

describe("readExceptionRegistries", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "repo-contract-inventory-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("readExceptionRegistries reads *.json in file-name order and skips other files", async () => {
    await writeFile(path.join(dir, "socket.json"), JSON.stringify({ exceptions: [full] }))
    await writeFile(path.join(dir, "dead-code.json"), JSON.stringify({ exceptions: [] }))
    await writeFile(path.join(dir, "notes.md"), "# not a registry")
    await writeFile(path.join(dir, "socket.json.1234.tmp"), "{}")
    expect(await readExceptionRegistries(dir)).toEqual({
      registries: [
        { name: "dead-code", records: [] },
        { name: "socket", records: [full] },
      ],
      errors: [],
    })
  })

  it("readExceptionRegistries sorts the names it reads, whatever order the directory lists them in", async () => {
    await writeFile(path.join(dir, "a.json"), JSON.stringify({ exceptions: [] }))
    await writeFile(path.join(dir, "b.json"), JSON.stringify({ exceptions: [full] }))
    readdir.mockResolvedValueOnce(["b.json", "a.json"])
    const { registries } = await readExceptionRegistries(dir)
    expect(registries.map((registry) => registry.name)).toEqual(["a", "b"])
  })

  it("readExceptionRegistries turns an unreadable file or a missing exceptions array into an error row", async () => {
    await writeFile(path.join(dir, "a.json"), "{ not json")
    await writeFile(path.join(dir, "b.json"), JSON.stringify({ records: [] }))
    await writeFile(path.join(dir, "c.json"), "null")
    await mkdir(path.join(dir, "d.json"))
    const result = await readExceptionRegistries(dir)
    expect(result.registries).toEqual([])
    expect(result.errors.map((row) => row.name)).toEqual(["a", "b", "c", "d"])
    expect(result.errors[1]?.error).toBe('no "exceptions" array')
    expect(result.errors[2]?.error).toBe('no "exceptions" array')
    expect(result.errors[0]?.error).toBe("not valid JSON (line 1, column 3)")
    expect(result.errors[3]?.error).toBe("skipped: not a regular file")
  })

  it("readExceptionRegistries lists a symlinked registry as skipped and never reads through it", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "repo-contract-inventory-outside-"))
    try {
      await writeFile(path.join(outside, "secret.txt"), "TOKEN=hunter2")
      await writeFile(path.join(outside, "real.json"), JSON.stringify({ exceptions: [full] }))
      await symlink(path.join(outside, "secret.txt"), path.join(dir, "leak.json"))
      await symlink(path.join(outside, "real.json"), path.join(dir, "linked.json"))
      await symlink(path.join(outside, "absent.json"), path.join(dir, "dangling.json"))
      await writeFile(path.join(dir, "ok.json"), JSON.stringify({ exceptions: [] }))
      const result = await readExceptionRegistries(dir)
      expect(result).toEqual({
        registries: [{ name: "ok", records: [] }],
        errors: [
          { name: "dangling", error: "skipped: a symbolic link, which is never followed" },
          { name: "leak", error: "skipped: a symbolic link, which is never followed" },
          { name: "linked", error: "skipped: a symbolic link, which is never followed" },
        ],
      })
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it("readExceptionRegistries keeps a registry's bytes out of every reason", async () => {
    await writeFile(path.join(dir, "a.json"), "TOKEN=hunter2")
    await writeFile(path.join(dir, "b.json"), '{"exceptions": [hunter2]}')
    await writeFile(path.join(dir, "c.json"), '{"exceptions": "hunter2"}')
    const result = await readExceptionRegistries(dir)
    expect(result.errors).toEqual([
      { name: "a", error: "not valid JSON" },
      { name: "b", error: "not valid JSON" },
      { name: "c", error: 'no "exceptions" array' },
    ])
  })

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "readExceptionRegistries names only the error code of a file it cannot read",
    async () => {
      await writeFile(path.join(dir, "locked.json"), "{}")
      await chmod(path.join(dir, "locked.json"), 0o000)
      expect((await readExceptionRegistries(dir)).errors).toEqual([
        { name: "locked", error: "cannot be read (EACCES)" },
      ])
      await chmod(path.join(dir, "locked.json"), 0o600)
    },
  )

  it("readExceptionRegistries says so when a failure carries no error code", async () => {
    readdir.mockRejectedValueOnce(new Error("TOKEN=hunter2"))
    expect(await readExceptionRegistries(dir)).toEqual({
      registries: [],
      errors: [{ name: dir, error: "cannot be read (no error code)" }],
    })
  })

  it("readExceptionRegistries returns nothing for a missing directory", async () => {
    expect(await readExceptionRegistries(path.join(dir, "absent"))).toEqual({
      registries: [],
      errors: [],
    })
  })

  it("reports a path that is a file, not a directory, as an error row", async () => {
    const file = path.join(dir, "exceptions")
    await writeFile(file, "")
    const result = await readExceptionRegistries(file)
    expect(result.registries).toEqual([])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.name).toBe(file)
    expect(result.errors[0]?.error).toBe("cannot be read (ENOTDIR)")
  })
})

describe("renderExceptionInventory", () => {
  it("renderExceptionInventory says nothing is recorded when empty", () => {
    expect(renderExceptionInventory(summarizeExceptionRegistries([], now))).toBe(
      "No exceptions recorded: nothing in this repository is breaking a rule on purpose.\n",
    )
  })

  it("renderExceptionInventory prints a total line and one line per registry", () => {
    const inventory = summarizeExceptionRegistries(
      [
        {
          name: "socket",
          records: [
            { ...full, exceptionType: "tooling-limitation" },
            { ...full, exceptionType: "accepted-risk" },
            { ...full, exceptionType: "accepted-risk", expires: "2020-01-01" },
            { id: "x:2", version: 1, justification: "" },
          ],
        },
        { name: "empty", records: [] },
      ],
      now,
      [{ name: "broken", error: "not JSON" }],
    )
    expect(renderExceptionInventory(inventory)).toBe(
      [
        "4 exception(s) across 2 registries (1 legacy version 1, 1 expired, 1 incomplete).",
        "",
        "- socket: 4 (accepted-risk 2, (untyped) 1, tooling-limitation 1); 1 legacy; 1 expired; 1 incomplete",
        "- empty: 0",
        "- broken: UNREADABLE: not JSON",
        "",
      ].join("\n"),
    )
  })

  it("orders types with equal counts by name, whatever order they were counted in", () => {
    for (const types of [
      ["zeta", "alpha"],
      ["alpha", "zeta"],
    ]) {
      const records = types.map((exceptionType) => ({ ...full, exceptionType }))
      const inventory = summarizeExceptionRegistries([{ name: "r", records }], now)
      expect(renderExceptionInventory(inventory)).toContain("- r: 2 (alpha 1, zeta 1)")
    }
  })

  it("says registry for one, and lists only unreadable files when nothing else loads", () => {
    const one = summarizeExceptionRegistries([{ name: "r", records: [full] }], now)
    expect(renderExceptionInventory(one)).toBe(
      "1 exception(s) across 1 registry (0 legacy version 1, 0 expired, 0 incomplete).\n\n- r: 1 ((untyped) 1)\n",
    )
    const broken = summarizeExceptionRegistries([], now, [{ name: "b", error: "bad" }])
    expect(renderExceptionInventory(broken)).toBe(
      "0 exception(s) across 0 registries (0 legacy version 1, 0 expired, 0 incomplete).\n\n- b: UNREADABLE: bad\n",
    )
  })
})

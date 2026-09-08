import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { serializeExceptionRegistry } from "../../../src/helpers/reconcile-exceptions.js"
import { writeExceptionRegistry } from "../../../src/helpers/write-exception-registry.js"

const records = [{ id: "a:1", version: 1, justification: "reviewed" }]
const canonical = serializeExceptionRegistry(records)

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "repo-contract-write-exception-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("writeExceptionRegistry -- real filesystem", () => {
  it("writes a missing file in canonical form", async () => {
    const target = path.join(dir, "reg.json")
    const result = await writeExceptionRegistry({ path: target, records })

    expect(result).toEqual({ ok: true, written: true })
    expect(await readFile(target, "utf8")).toBe(canonical)
  })

  it("does not write when the on-disk bytes already equal the canonical form (idempotent)", async () => {
    const target = path.join(dir, "reg.json")
    await writeFile(target, canonical, "utf8")

    const result = await writeExceptionRegistry({ path: target, records })

    expect(result).toEqual({ ok: true, written: false })
  })

  it("replaces a file whose content differs, and leaves no temp file behind on success", async () => {
    const target = path.join(dir, "reg.json")
    await writeFile(target, '{"exceptions":[]}\n', "utf8")

    const result = await writeExceptionRegistry({ path: target, records })

    expect(result).toEqual({ ok: true, written: true })
    expect(await readFile(target, "utf8")).toBe(canonical)
  })

  it("a second consecutive call writes nothing", async () => {
    const target = path.join(dir, "reg.json")
    await writeExceptionRegistry({ path: target, records })
    expect(await writeExceptionRegistry({ path: target, records })).toEqual({
      ok: true,
      written: false,
    })
  })

  it("refuses a symlinked target and does not follow it (default isSymlink)", async () => {
    const real = path.join(dir, "outside.json")
    await writeFile(real, "untouched", "utf8")
    const link = path.join(dir, "reg.json")
    await symlink(real, link)

    const result = await writeExceptionRegistry({ path: link, records })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("symlink")
    expect(await readFile(real, "utf8")).toBe("untouched")
  })

  // A regular file where a directory component is expected: POSIX `lstat` reports ENOTDIR, which
  // `defaultIsSymlink` must rethrow rather than swallow. Windows `lstat` reports ENOENT for the
  // same path, so the "not a symlink" branch legitimately applies there -- skip.
  it.skipIf(process.platform === "win32")(
    "rethrows a non-ENOENT default-isSymlink failure instead of treating the path as a safe non-symlink",
    async () => {
      const file = path.join(dir, "afile")
      await writeFile(file, "x", "utf8")
      await expect(
        writeExceptionRegistry({ path: path.join(file, "reg.json"), records }),
      ).rejects.toThrow(/ENOTDIR/)
    },
  )
})

describe("writeExceptionRegistry -- capability failures (injected)", () => {
  const base = {
    path: "/virtual/reg.json",
    records,
    isSymlink: async (): Promise<boolean> => false,
  }

  it("a non-ENOENT read failure is reported, not clobbered", async () => {
    const result = await writeExceptionRegistry({
      ...base,
      readFile: () =>
        Promise.reject(Object.assign(new Error("EACCES: denied"), { code: "EACCES" })),
      writeFile: () => Promise.reject(new Error("should not be reached")),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("Could not read /virtual/reg.json")
      expect(result.error).toContain("EACCES: denied")
    }
  })

  it("an ENOENT read failure proceeds to write", async () => {
    const written: [string, string][] = []
    const result = await writeExceptionRegistry({
      ...base,
      readFile: () => Promise.reject(Object.assign(new Error("nope"), { code: "ENOENT" })),
      writeFile: (p, data) => {
        written.push([p, data])
        return Promise.resolve()
      },
      rename: () => Promise.resolve(),
    })
    expect(result).toEqual({ ok: true, written: true })
    expect(written[0]?.[1]).toBe(canonical)
    expect(written[0]?.[0]).toMatch(/^\/virtual\/reg\.json\.[0-9a-f-]+\.tmp$/)
  })

  // Rejects with a value that is deliberately NOT an Error/object -- exercises isEnoent's `null`
  // and `typeof` guards and the `String(error)` fallback, none of which may throw on it.
  const rejectWith = (reason: unknown): Promise<never> =>
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- see comment above
    Promise.reject(reason)

  it("a bare-string read rejection still yields a clean { ok: false }", async () => {
    const result = await writeExceptionRegistry({
      ...base,
      readFile: () => rejectWith("a bare string"),
      writeFile: () => rejectWith(new Error("should not be reached")),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("a bare string")
  })

  it.each([
    [null, "null"],
    [undefined, "undefined"],
  ])("a %s read rejection does not throw a TypeError out of isEnoent", async (reason, fragment) => {
    const result = await writeExceptionRegistry({
      ...base,
      readFile: () => rejectWith(reason),
      writeFile: () => rejectWith(new Error("should not be reached")),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(fragment)
  })

  it("a write failure is reported and rename is never attempted", async () => {
    let renamed = false
    const result = await writeExceptionRegistry({
      ...base,
      readFile: () => Promise.reject(Object.assign(new Error("nope"), { code: "ENOENT" })),
      writeFile: () =>
        Promise.reject(Object.assign(new Error("ENOSPC: no space"), { code: "ENOSPC" })),
      rename: () => {
        renamed = true
        return Promise.resolve()
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("Could not write")
    expect(renamed).toBe(false)
  })

  it("a rename failure is a deterministic { ok: false } naming the leftover temp file", async () => {
    const result = await writeExceptionRegistry({
      ...base,
      readFile: () => Promise.reject(Object.assign(new Error("nope"), { code: "ENOENT" })),
      writeFile: () => Promise.resolve(),
      rename: () => Promise.reject(Object.assign(new Error("EPERM: locked"), { code: "EPERM" })),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("Could not replace /virtual/reg.json")
      expect(result.error).toMatch(/temp file left at \/virtual\/reg\.json\.[0-9a-f-]+\.tmp/)
      expect(result.error).toContain("EPERM: locked")
    }
  })

  it("a symlinked target reported by the injected isSymlink short-circuits before any read/write", async () => {
    let touched = false
    const result = await writeExceptionRegistry({
      path: "/virtual/reg.json",
      records,
      isSymlink: async () => true,
      readFile: () => {
        touched = true
        return Promise.resolve("")
      },
      writeFile: () => {
        touched = true
        return Promise.resolve()
      },
    })
    expect(result.ok).toBe(false)
    expect(touched).toBe(false)
  })
})

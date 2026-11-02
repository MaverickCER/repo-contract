import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type * as Fs from "node:fs/promises"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Windows refuses to replace a file another writer has open (EPERM/EBUSY/EACCES from rename). The
// real filesystem here cannot be made to do that, so rename is replaced by one that fails.
const failure = vi.hoisted(() => ({ code: undefined as string | undefined }))
vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof Fs>()
  return {
    ...original,
    rename: async (from: string, to: string): Promise<void> => {
      if (failure.code !== undefined) {
        throw Object.assign(new Error(`${failure.code}: rename`), { code: failure.code })
      }
      return original.rename(from, to)
    },
  }
})

const { createFileCacheStore } = await import("../../../src/helpers/file-cache-store.js")

let root: string
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "rc-contended-"))
  failure.code = undefined
})
afterEach(async () => {
  failure.code = undefined
  await rm(root, { recursive: true, force: true })
})

describe("createFileCacheStore: a writer that finds the file in use", () => {
  it.each(["EPERM", "EBUSY", "EACCES"])(
    "leaves the other writer's value, and no temporary file, on %s",
    async (code) => {
      const store = createFileCacheStore(root)
      await writeFile(path.join(root, "a.json"), "theirs")
      failure.code = code
      await expect(store.write("a.json", "ours")).resolves.toBeUndefined()
      expect(await readFile(path.join(root, "a.json"), "utf8")).toBe("theirs")
      expect(await readdir(root)).toEqual(["a.json"])
    },
  )

  it("still fails when nothing is there to stand in for the value", async () => {
    const store = createFileCacheStore(root)
    failure.code = "EPERM"
    await expect(store.write("a.json", "ours")).rejects.toThrow(/EPERM/)
    expect(await readdir(root)).toEqual([])
  })

  it("still fails for an error that is not about contention, even if the file exists", async () => {
    const store = createFileCacheStore(root)
    await writeFile(path.join(root, "a.json"), "theirs")
    failure.code = "ENOSPC"
    await expect(store.write("a.json", "ours")).rejects.toThrow(/ENOSPC/)
    expect(await readdir(root)).toEqual(["a.json"])
  })

  it("writes normally when rename works", async () => {
    const store = createFileCacheStore(root)
    await mkdir(path.join(root, "d"))
    await store.write("d/a.json", "ours")
    expect(await readFile(path.join(root, "d", "a.json"), "utf8")).toBe("ours")
  })
})

describe("createFileCacheStore: a directory in the way", () => {
  it("is a failure, not another writer's value, even when the error looks like contention", async () => {
    const store = createFileCacheStore(root)
    await mkdir(path.join(root, "a.json"))
    failure.code = "EPERM"
    await expect(store.write("a.json", "ours")).rejects.toThrow(/EPERM/)
    expect(await readdir(root)).toEqual(["a.json"])
  })
})

import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cacheKey, createCache } from "../../../src/affected/cache.js"
import { createFileCacheStore } from "../../../src/helpers/file-cache-store.js"

let root: string
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "rc-cache-int-"))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("the cache over a directory", () => {
  const input = { check: "tests", inputs: { "src/a.ts": "h1" }, tools: { vitest: "3" } }

  it("replays a stored result from a fresh cache over the same directory", async () => {
    const key = cacheKey(input)
    const directory = path.join(root, ".repo-contract", "cache")
    const first = createCache({ store: createFileCacheStore(directory), mode: "read-write" })
    await first.store({ ...input, key, value: { outcome: "pass" }, durationMs: 5 })

    const second = createCache({ store: createFileCacheStore(directory), mode: "read-only" })
    const hit = await second.lookup<{ outcome: string }>("tests", key)
    expect(hit.hit && hit.entry.value).toEqual({ outcome: "pass" })
    expect(await readdir(path.join(directory, "index", "tests"))).toEqual([`${key}.json`])
  })

  it("explains a miss after an input changes, then prunes and clears", async () => {
    const directory = path.join(root, "cache")
    const cache = createCache({ store: createFileCacheStore(directory), mode: "read-write" })
    await cache.store({ ...input, key: cacheKey(input), value: 1, durationMs: 1 })
    expect(await cache.why("tests", { "src/a.ts": "h2" })).toMatchObject({
      kind: "changed",
      changed: ["src/a.ts"],
    })
    expect((await cache.stats()).entries).toBe(1)
    expect(await cache.prune({ maxEntries: 0 })).toBe(1)
    await cache.store({ ...input, key: cacheKey(input), value: 1, durationMs: 1 })
    expect(await cache.clear()).toBe(1)
    expect((await cache.stats()).entries).toBe(0)
  })

  it("never touches the directory in off mode", async () => {
    const directory = path.join(root, "cold")
    const cache = createCache({ store: createFileCacheStore(directory), mode: "off" })
    expect(await cache.store({ ...input, key: cacheKey(input), value: 1, durationMs: 1 })).toBe(
      false,
    )
    await expect(readdir(directory)).rejects.toThrow(/ENOENT/)
  })
})

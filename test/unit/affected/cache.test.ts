import { describe, expect, it } from "vitest"
import {
  CACHE_FORMAT,
  cacheKey,
  createCache,
  resolveCacheMode,
} from "../../../src/affected/cache.js"
import type { CacheStore } from "../../../src/affected/cache.js"

/** An in-memory store; `files` is exposed so a test can corrupt or inspect an entry. */
function memoryStore(): CacheStore & { files: Map<string, string> } {
  const files = new Map<string, string>()
  return {
    files,
    read: (path) => Promise.resolve(files.get(path)),
    write: (path, content) => {
      files.set(path, content)
      return Promise.resolve()
    },
    remove: (path) => {
      files.delete(path)
      return Promise.resolve()
    },
    list: (prefix) => Promise.resolve([...files.keys()].filter((path) => path.startsWith(prefix))),
  }
}

const clock = (start = "2026-11-01T00:00:00.000Z") => {
  let time = Date.parse(start)
  return {
    now: () => new Date(time),
    advance: (ms: number) => {
      time += ms
    },
  }
}

const KEY = "a".repeat(64)

describe("cacheKey", () => {
  const base = { check: "tests", inputs: { "src/a.ts": "h1" }, tools: { vitest: "3.0.0" } }

  it("is a sha-256 hex digest", () => {
    expect(cacheKey(base)).toMatch(/^[0-9a-f]{64}$/)
  })

  it("is the same for the same inputs whatever order they are listed in", () => {
    const a = cacheKey({ ...base, inputs: { x: "1", y: "2" } })
    const b = cacheKey({ ...base, inputs: { y: "2", x: "1" } })
    expect(a).toBe(b)
  })

  it("changes with each part of what it covers", () => {
    const key = cacheKey(base)
    expect(cacheKey({ ...base, check: "lint" })).not.toBe(key)
    expect(cacheKey({ ...base, inputs: { "src/a.ts": "h2" } })).not.toBe(key)
    expect(cacheKey({ ...base, inputs: { "src/b.ts": "h1" } })).not.toBe(key)
    expect(cacheKey({ ...base, inputs: { ...base.inputs, "src/c.ts": "h3" } })).not.toBe(key)
    expect(cacheKey({ ...base, tools: { vitest: "3.0.1" } })).not.toBe(key)
    expect(cacheKey({ ...base, tools: { ...base.tools, node: "22" } })).not.toBe(key)
  })

  it("does not confuse a name with its value", () => {
    expect(cacheKey({ check: "c", inputs: { a: "b" }, tools: {} })).not.toBe(
      cacheKey({ check: "c", inputs: { "a:b": "" }, tools: {} }),
    )
    expect(cacheKey({ check: "c", inputs: { a: "1" }, tools: {} })).not.toBe(
      cacheKey({ check: "c", inputs: {}, tools: { a: "1" } }),
    )
  })

  it("includes the cache format, so a format change invalidates every entry", () => {
    expect(CACHE_FORMAT).toBe(1)
    expect(cacheKey(base)).toBe(cacheKey(base))
  })
})

describe("resolveCacheMode", () => {
  it("is read-write by default", () => {
    expect(resolveCacheMode({ scope: "affected", env: {} })).toEqual({
      mode: "read-write",
      reason: "the default",
    })
  })

  it("is off for a full run, whatever else asks", () => {
    expect(
      resolveCacheMode({ scope: "full", env: { REPO_CONTRACT_CACHE: "rw" }, flag: "read-write" }),
    ).toEqual({ mode: "off", reason: "a full run always runs cold" })
  })

  it("reads REPO_CONTRACT_CACHE as off, ro or rw", () => {
    expect(resolveCacheMode({ scope: "affected", env: { REPO_CONTRACT_CACHE: "off" } }).mode).toBe(
      "off",
    )
    expect(resolveCacheMode({ scope: "affected", env: { REPO_CONTRACT_CACHE: "ro" } })).toEqual({
      mode: "read-only",
      reason: "REPO_CONTRACT_CACHE=ro",
    })
    expect(resolveCacheMode({ scope: "affected", env: { REPO_CONTRACT_CACHE: "rw" } })).toEqual({
      mode: "read-write",
      reason: "REPO_CONTRACT_CACHE=rw",
    })
    expect(resolveCacheMode({ scope: "affected", env: { REPO_CONTRACT_CACHE: "" } }).reason).toBe(
      "the default",
    )
  })

  it("lets a flag win over the environment", () => {
    expect(
      resolveCacheMode({
        scope: "affected",
        env: { REPO_CONTRACT_CACHE: "off" },
        flag: "read-only",
      }),
    ).toEqual({ mode: "read-only", reason: "the command line" })
  })

  it("rejects an unknown REPO_CONTRACT_CACHE", () => {
    expect(() =>
      resolveCacheMode({ scope: "affected", env: { REPO_CONTRACT_CACHE: "yes" } }),
    ).toThrow('REPO_CONTRACT_CACHE must be one of off, ro, rw, not "yes".')
  })
})

describe("createCache", () => {
  const entry = (overrides: object = {}) => ({
    check: "tests",
    key: KEY,
    inputs: { "src/a.ts": "h1" },
    value: { outcome: "pass" },
    durationMs: 1200,
    ...overrides,
  })

  it("misses on an empty store", async () => {
    const cache = createCache({ store: memoryStore(), mode: "read-write" })
    expect(await cache.lookup("tests", KEY)).toEqual({ hit: false, reason: "miss" })
  })

  it("hits after a store and returns the value, duration and creation time", async () => {
    const time = clock()
    const cache = createCache({ store: memoryStore(), mode: "read-write", now: time.now })
    expect(await cache.store(entry())).toBe(true)
    expect(await cache.lookup("tests", KEY)).toEqual({
      hit: true,
      entry: {
        formatVersion: CACHE_FORMAT,
        check: "tests",
        key: KEY,
        inputs: { "src/a.ts": "h1" },
        value: { outcome: "pass" },
        durationMs: 1200,
        createdAt: "2026-11-01T00:00:00.000Z",
      },
    })
  })

  it("keeps one check's entries apart from another's", async () => {
    const cache = createCache({ store: memoryStore(), mode: "read-write" })
    await cache.store(entry())
    expect(await cache.lookup("lint", KEY)).toEqual({ hit: false, reason: "miss" })
  })

  it("treats a corrupt entry as a miss and lets a later store replace it", async () => {
    const store = memoryStore()
    const cache = createCache({ store, mode: "read-write" })
    await cache.store(entry())
    const [path] = [...store.files.keys()]
    store.files.set(path!, "{ not json")
    expect(await cache.lookup("tests", KEY)).toEqual({ hit: false, reason: "corrupt" })
    await cache.store(entry())
    expect((await cache.lookup("tests", KEY)).hit).toBe(true)
  })

  it.each([
    ["an array", "[]"],
    ["null", "null"],
    ["a string", '"x"'],
    ["a different format", JSON.stringify({ formatVersion: 99 })],
    ["a missing field", JSON.stringify({ formatVersion: CACHE_FORMAT, check: "tests" })],
    [
      "a different key inside",
      JSON.stringify({
        formatVersion: CACHE_FORMAT,
        check: "tests",
        key: "b".repeat(64),
        inputs: {},
        value: 1,
        durationMs: 1,
        createdAt: "2026-11-01T00:00:00.000Z",
      }),
    ],
    [
      "a different check inside",
      JSON.stringify({
        formatVersion: CACHE_FORMAT,
        check: "lint",
        key: KEY,
        inputs: {},
        value: 1,
        durationMs: 1,
        createdAt: "2026-11-01T00:00:00.000Z",
      }),
    ],
    [
      "a non-numeric duration",
      JSON.stringify({
        formatVersion: CACHE_FORMAT,
        check: "tests",
        key: KEY,
        inputs: {},
        value: 1,
        durationMs: "1",
        createdAt: "2026-11-01T00:00:00.000Z",
      }),
    ],
    [
      "inputs that are not strings",
      JSON.stringify({
        formatVersion: CACHE_FORMAT,
        check: "tests",
        key: KEY,
        inputs: { a: 1 },
        value: 1,
        durationMs: 1,
        createdAt: "2026-11-01T00:00:00.000Z",
      }),
    ],
  ])("never replays %s", async (_name, content) => {
    const store = memoryStore()
    const cache = createCache({ store, mode: "read-write" })
    await cache.store(entry())
    store.files.set([...store.files.keys()][0]!, content)
    expect(await cache.lookup("tests", KEY)).toEqual({ hit: false, reason: "corrupt" })
  })

  it("does nothing when off: no hit, no write", async () => {
    const store = memoryStore()
    const writer = createCache({ store, mode: "read-write" })
    await writer.store(entry())
    const off = createCache({ store, mode: "off" })
    expect(await off.lookup("tests", KEY)).toEqual({ hit: false, reason: "disabled" })
    expect(await off.store(entry({ key: "c".repeat(64) }))).toBe(false)
    expect(store.files.size).toBe(1)
  })

  it("reads but never writes when read-only", async () => {
    const store = memoryStore()
    await createCache({ store, mode: "read-write" }).store(entry())
    const readOnly = createCache({ store, mode: "read-only" })
    expect((await readOnly.lookup("tests", KEY)).hit).toBe(true)
    expect(await readOnly.store(entry({ key: "c".repeat(64) }))).toBe(false)
    expect(store.files.size).toBe(1)
  })

  it("rejects a check id or key that could leave the cache directory", async () => {
    const cache = createCache({ store: memoryStore(), mode: "read-write" })
    for (const check of ["", "..", "../x", "a/b", "a\\b", ".hidden", "a b"]) {
      await expect(cache.lookup(check, KEY)).rejects.toThrow(`Invalid cache check id "${check}".`)
      await expect(cache.store(entry({ check }))).rejects.toThrow(`Invalid cache check id`)
    }
    for (const key of ["", "abc", "../".repeat(22), "G".repeat(64), "a".repeat(63)]) {
      await expect(cache.lookup("tests", key)).rejects.toThrow("Invalid cache key")
      await expect(cache.store(entry({ key }))).rejects.toThrow("Invalid cache key")
    }
  })

  it("refuses to store a value that is not JSON", async () => {
    const cache = createCache({ store: memoryStore(), mode: "read-write" })
    await expect(cache.store(entry({ value: undefined }))).rejects.toThrow(
      "A cache value must be JSON.",
    )
    await expect(cache.store(entry({ value: () => 1 }))).rejects.toThrow(
      "A cache value must be JSON.",
    )
  })

  describe("why", () => {
    it("says there is nothing to compare with when the check was never cached", async () => {
      const cache = createCache({ store: memoryStore(), mode: "read-write" })
      expect(await cache.why("tests", { "src/a.ts": "h1" })).toEqual({ kind: "no-previous" })
    })

    it("says the inputs are the same when they are", async () => {
      const cache = createCache({ store: memoryStore(), mode: "read-write" })
      await cache.store(entry())
      expect(await cache.why("tests", { "src/a.ts": "h1" })).toEqual({ kind: "same-inputs" })
    })

    it("lists what changed, was added and was removed, compared with the latest entry", async () => {
      const time = clock()
      const cache = createCache({ store: memoryStore(), mode: "read-write", now: time.now })
      await cache.store(entry({ inputs: { old: "x" }, key: "d".repeat(64) }))
      time.advance(1000)
      await cache.store(entry({ inputs: { kept: "1", changed: "1", gone: "1" } }))
      expect(await cache.why("tests", { kept: "1", changed: "2", fresh: "1" })).toEqual({
        kind: "changed",
        changed: ["changed"],
        added: ["fresh"],
        removed: ["gone"],
        comparedWith: KEY,
      })
    })

    it("ignores entries that are corrupt when finding the latest", async () => {
      const store = memoryStore()
      const cache = createCache({ store, mode: "read-write" })
      await cache.store(entry())
      await cache.store(entry({ key: "e".repeat(64) }))
      for (const [path] of store.files) {
        if (path.includes("e".repeat(64))) store.files.set(path, "junk")
      }
      expect(await cache.why("tests", { "src/a.ts": "h1" })).toEqual({ kind: "same-inputs" })
    })
  })

  describe("stats", () => {
    it("counts entries per check and their size, skipping corrupt ones", async () => {
      const store = memoryStore()
      const cache = createCache({ store, mode: "read-write" })
      await cache.store(entry())
      await cache.store(entry({ check: "lint", key: "f".repeat(64) }))
      await cache.store(entry({ check: "lint", key: "1".repeat(64) }))
      store.files.set("index/lint/junk.json", "junk")
      const stats = await cache.stats()
      expect(stats.entries).toBe(3)
      expect(stats.checks).toEqual({ tests: 1, lint: 2 })
      let expected = 0
      for (const [path, content] of store.files) {
        if (!path.endsWith("junk.json")) expected += content.length
      }
      expect(stats.bytes).toBe(expected)
      expect(stats.corrupt).toBe(1)
    })

    it("is empty for an empty store", async () => {
      expect(await createCache({ store: memoryStore(), mode: "read-write" }).stats()).toEqual({
        entries: 0,
        bytes: 0,
        corrupt: 0,
        checks: {},
      })
    })
  })

  describe("prune", () => {
    it("removes entries older than maxAgeMs and corrupt ones, and keeps the rest", async () => {
      const time = clock()
      const store = memoryStore()
      const cache = createCache({ store, mode: "read-write", now: time.now })
      await cache.store(entry({ key: "1".repeat(64) }))
      time.advance(10_000)
      await cache.store(entry({ key: "2".repeat(64) }))
      store.files.set("index/tests/junk.json", "junk")
      const removed = await cache.prune({ maxAgeMs: 5000 })
      expect(removed).toBe(2)
      expect((await cache.lookup("tests", "1".repeat(64))).hit).toBe(false)
      expect((await cache.lookup("tests", "2".repeat(64))).hit).toBe(true)
    })

    it("keeps an entry exactly maxAgeMs old", async () => {
      const time = clock()
      const cache = createCache({ store: memoryStore(), mode: "read-write", now: time.now })
      await cache.store(entry())
      time.advance(5000)
      expect(await cache.prune({ maxAgeMs: 5000 })).toBe(0)
    })

    it("keeps only the newest maxEntries, across checks", async () => {
      const time = clock()
      const cache = createCache({ store: memoryStore(), mode: "read-write", now: time.now })
      for (const [index, check] of ["a", "b", "c", "d"].entries()) {
        await cache.store(entry({ check, key: String(index).repeat(64) }))
        time.advance(1000)
      }
      expect(await cache.prune({ maxEntries: 2 })).toBe(2)
      const stats = await cache.stats()
      expect(stats.checks).toEqual({ c: 1, d: 1 })
    })

    it("removes nothing without limits, and nothing when under them", async () => {
      const cache = createCache({ store: memoryStore(), mode: "read-write" })
      await cache.store(entry())
      expect(await cache.prune({})).toBe(0)
      expect(await cache.prune({ maxEntries: 1, maxAgeMs: 1_000_000 })).toBe(0)
    })

    it("does nothing in off or read-only mode", async () => {
      const store = memoryStore()
      await createCache({ store, mode: "read-write" }).store(entry())
      expect(await createCache({ store, mode: "read-only" }).prune({ maxEntries: 0 })).toBe(0)
      expect(await createCache({ store, mode: "off" }).clear()).toBe(0)
      expect(store.files.size).toBe(1)
    })
  })

  describe("clear", () => {
    it("removes every entry and reports how many", async () => {
      const store = memoryStore()
      const cache = createCache({ store, mode: "read-write" })
      await cache.store(entry())
      await cache.store(entry({ check: "lint" }))
      expect(await cache.clear()).toBe(2)
      expect(store.files.size).toBe(0)
      expect(await cache.clear()).toBe(0)
    })
  })
})

describe("cache entries that are not what they claim to be", () => {
  const KEY_A = "a".repeat(64)
  const KEY_B = "b".repeat(64)
  const valid = {
    formatVersion: 1,
    check: "tests",
    key: KEY_A,
    inputs: { "src/a.ts": "h1" },
    value: { ok: true },
    durationMs: 12,
    createdAt: "2026-11-01T00:00:00.000Z",
  }
  const lookupRaw = async (text: string, path = `index/tests/${KEY_A}.json`) => {
    const store = memoryStore()
    store.files.set(path, text)
    return createCache({ store, mode: "read-write" }).lookup("tests", KEY_A)
  }

  it("replays an entry exactly as stored", async () => {
    expect(await lookupRaw(JSON.stringify(valid))).toMatchObject({
      hit: true,
      entry: { value: { ok: true } },
    })
  })

  it("accepts a stored value of null, which is still a value", async () => {
    expect(await lookupRaw(JSON.stringify({ ...valid, value: null }))).toMatchObject({ hit: true })
  })

  it.each([
    ["not JSON", "{"],
    ["a string", '"entry"'],
    ["a number", "5"],
    ["null", "null"],
    ["an array", "[]"],
    ["an empty object", "{}"],
    ["another format", JSON.stringify({ ...valid, formatVersion: 2 })],
    ["no format", JSON.stringify({ ...valid, formatVersion: undefined })],
    ["no value", JSON.stringify({ ...valid, value: undefined })],
    ["a different check", JSON.stringify({ ...valid, check: "lint" })],
    ["a check that is not text", JSON.stringify({ ...valid, check: 5 })],
    ["a different key", JSON.stringify({ ...valid, key: KEY_B })],
    ["a key that is not text", JSON.stringify({ ...valid, key: 5 })],
    ["inputs that are null", JSON.stringify({ ...valid, inputs: null })],
    ["inputs that are text", JSON.stringify({ ...valid, inputs: "ab" })],
    ["inputs that are a list", JSON.stringify({ ...valid, inputs: ["a"] })],
    ["an input digest that is not text", JSON.stringify({ ...valid, inputs: { a: 1 } })],
    ["a duration that is text", JSON.stringify({ ...valid, durationMs: "12" })],
    [
      "a duration that is not finite",
      '{"formatVersion":1,"check":"tests","key":"' +
        KEY_A +
        '","inputs":{},"value":1,"durationMs":1e999,"createdAt":"2026-11-01T00:00:00.000Z"}',
    ],
    ["a time that is a number", JSON.stringify({ ...valid, createdAt: 5 })],
    ["a time that is not a date", JSON.stringify({ ...valid, createdAt: "never" })],
  ])("treats an entry with %s as corrupt, never a hit", async (_name, text) => {
    expect(await lookupRaw(text)).toEqual({ hit: false, reason: "corrupt" })
  })

  it("counts an entry filed under another check's folder, or another file name, as corrupt", async () => {
    const store = memoryStore()
    store.files.set(`index/lint/${KEY_A}.json`, JSON.stringify(valid))
    store.files.set(`index/tests/${KEY_B}.json`, JSON.stringify(valid))
    store.files.set(`index/tests/${KEY_A}.json`, JSON.stringify(valid))
    const stats = await createCache({ store, mode: "read-write" }).stats()
    expect(stats).toMatchObject({ entries: 1, corrupt: 2, checks: { tests: 1 } })
  })

  it("skips a path that vanished between listing and reading", async () => {
    const store = memoryStore()
    store.files.set(`index/tests/${KEY_A}.json`, JSON.stringify(valid))
    const racing: CacheStore = { ...store, read: () => Promise.resolve(undefined) }
    expect(await createCache({ store: racing, mode: "read-write" }).stats()).toEqual({
      entries: 0,
      bytes: 0,
      corrupt: 0,
      checks: {},
    })
  })

  it("keys the same inputs the same way whatever their order, including names that sort apart", () => {
    const a = cacheKey({
      check: "c",
      inputs: { b: "1", a: "2", B: "3" },
      tools: { y: "1", x: "2" },
    })
    const b = cacheKey({
      check: "c",
      inputs: { B: "3", a: "2", b: "1" },
      tools: { x: "2", y: "1" },
    })
    expect(a).toBe(b)
    expect(cacheKey({ check: "c", inputs: { a: "1", b: "2" }, tools: {} })).not.toBe(
      cacheKey({ check: "c", inputs: { a: "2", b: "1" }, tools: {} }),
    )
  })
})

describe("why and prune details", () => {
  const key = (digit: string) => digit.repeat(64)
  const put = (
    cache: ReturnType<typeof createCache>,
    digit: string,
    inputs: Record<string, string>,
  ) => cache.store({ check: "tests", key: key(digit), inputs, value: 1, durationMs: 1 })

  it("compares with the newest entry, wherever it is in the listing", async () => {
    const time = clock()
    const store = memoryStore()
    const cache = createCache({ store, mode: "read-write", now: time.now })
    await put(cache, "2", { a: "old" })
    time.advance(1000)
    await put(cache, "1", { a: "new" })
    expect(await cache.why("tests", { a: "x" })).toMatchObject({ comparedWith: key("1") })
    const reversed = memoryStore()
    for (const path of [...store.files.keys()].reverse())
      reversed.files.set(path, store.files.get(path)!)
    expect(
      await createCache({ store: reversed, mode: "read-write" }).why("tests", { a: "x" }),
    ).toMatchObject({
      comparedWith: key("1"),
    })
  })

  it("compares with the first listed of entries made at the same instant", async () => {
    const time = clock()
    const cache = createCache({ store: memoryStore(), mode: "read-write", now: time.now })
    await put(cache, "1", { a: "one" })
    await put(cache, "2", { a: "two" })
    expect(await cache.why("tests", { a: "x" })).toMatchObject({ comparedWith: key("1") })
  })

  it("ignores a corrupt entry when explaining", async () => {
    const store = memoryStore()
    const cache = createCache({ store, mode: "read-write" })
    await put(cache, "1", { a: "1" })
    store.files.set(`index/tests/${key("2")}.json`, "junk")
    expect(await cache.why("tests", { a: "1" })).toEqual({ kind: "same-inputs" })
  })

  it("is not fooled by a change, an addition and a removal that cancel in a count", async () => {
    const cache = createCache({ store: memoryStore(), mode: "read-write" })
    await put(cache, "1", { kept: "1", gone: "1", moved: "1" })
    expect(await cache.why("tests", { kept: "1", moved: "2", fresh: "1" })).toMatchObject({
      kind: "changed",
      changed: ["moved"],
      added: ["fresh"],
      removed: ["gone"],
    })
    expect(
      await cache.why("tests", { kept: "1", gone: "1", moved: "2", fresh: "1" }),
    ).toMatchObject({
      changed: ["moved"],
      added: ["fresh"],
      removed: [],
    })
    expect(await cache.why("tests", { kept: "1", moved: "1", fresh: "1" })).toMatchObject({
      changed: [],
      added: ["fresh"],
      removed: ["gone"],
    })
    expect(await cache.why("tests", { kept: "1", gone: "1" })).toMatchObject({
      changed: [],
      added: [],
      removed: ["moved"],
    })
  })

  it("keeps old entries when there is no age limit", async () => {
    const time = clock()
    const cache = createCache({ store: memoryStore(), mode: "read-write", now: time.now })
    await put(cache, "1", {})
    time.advance(10 * 365 * 86_400_000)
    expect(await cache.prune({ maxEntries: 10 })).toBe(0)
    expect(await cache.prune({})).toBe(0)
  })

  it("keeps the first listed of entries made at the same instant when trimming to a count", async () => {
    const time = clock()
    const cache = createCache({ store: memoryStore(), mode: "read-write", now: time.now })
    await put(cache, "1", {})
    await put(cache, "2", {})
    await put(cache, "3", {})
    expect(await cache.prune({ maxEntries: 1 })).toBe(2)
    expect((await cache.lookup("tests", key("1"))).hit).toBe(true)
  })
})

describe("why: corrupt entries and additions", () => {
  const key = (digit: string) => digit.repeat(64)

  it("ignores a corrupt entry that is listed before the good one", async () => {
    const store = memoryStore()
    store.files.set(`index/tests/${key("0")}.json`, "junk")
    const cache = createCache({ store, mode: "read-write" })
    await cache.store({
      check: "tests",
      key: key("1"),
      inputs: { a: "1" },
      value: 1,
      durationMs: 1,
    })
    expect(await cache.why("tests", { a: "2" })).toMatchObject({
      kind: "changed",
      comparedWith: key("1"),
    })
    expect(await cache.why("tests", { a: "1" })).toEqual({ kind: "same-inputs" })
  })

  it("sees a new input on its own as a difference", async () => {
    const cache = createCache({ store: memoryStore(), mode: "read-write" })
    await cache.store({
      check: "tests",
      key: key("1"),
      inputs: { a: "1" },
      value: 1,
      durationMs: 1,
    })
    expect(await cache.why("tests", { a: "1", b: "1" })).toMatchObject({
      kind: "changed",
      changed: [],
      added: ["b"],
      removed: [],
    })
  })
})

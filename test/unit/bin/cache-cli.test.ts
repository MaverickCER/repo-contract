import path from "node:path"
import { describe, expect, it } from "vitest"
import { CACHE_USAGE, parseCacheArgs, runCache } from "../../../bin/cache-cli.mjs"
import { createCache } from "../../../src/affected/cache.js"
import type { CacheStore } from "../../../src/affected/cache.js"

/** A path under the pretend working directory, spelled the way this platform spells it. */
const at = (...parts: string[]): string => path.resolve("/work/project", ...parts)

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

const KEYS = ["1", "2", "3"].map((digit) => digit.repeat(64))

async function seed(store: CacheStore, now: () => Date): Promise<void> {
  const cache = createCache({ store, mode: "read-write", now })
  await cache.store({ check: "tests", key: KEYS[0]!, inputs: {}, value: 1, durationMs: 1 })
  await cache.store({ check: "lint", key: KEYS[1]!, inputs: {}, value: 1, durationMs: 1 })
}

async function invoke(
  argv: string[],
  options: {
    store?: ReturnType<typeof memoryStore>
    now?: () => Date
    files?: Record<string, string>
  } = {},
): Promise<{
  code: number
  stdout: string
  stderr: string
  dirs: string[]
  store: ReturnType<typeof memoryStore>
}> {
  const out: string[] = []
  const err: string[] = []
  const dirs: string[] = []
  const store = options.store ?? memoryStore()
  const code = await runCache({
    argv,
    cwd: at(),
    version: "9.9.9",
    stdout: (text: string) => out.push(text),
    stderr: (text: string) => err.push(text),
    engine: { createCache },
    createStore: (dir: string) => {
      dirs.push(dir)
      return store
    },
    readFile: (file: string) => Promise.resolve(options.files?.[file]),
    now: options.now ?? (() => new Date("2026-11-10T00:00:00.000Z")),
  })
  return { code, stdout: out.join(""), stderr: err.join(""), dirs, store }
}

describe("parseCacheArgs", () => {
  it("parses each subcommand with its defaults", () => {
    expect(parseCacheArgs(["stats"])).toEqual({
      kind: "run",
      command: "stats",
      options: { json: false },
    })
    expect(parseCacheArgs(["clear"])).toEqual({
      kind: "run",
      command: "clear",
      options: { json: false },
    })
    expect(parseCacheArgs(["prune"])).toEqual({
      kind: "run",
      command: "prune",
      options: { json: false },
    })
  })

  it("reads -C, --cache-dir and --json in either value form", () => {
    expect(parseCacheArgs(["stats", "-C", "/x", "--cache-dir=.c", "--json"])).toEqual({
      kind: "run",
      command: "stats",
      options: { json: true, cwd: "/x", cacheDir: ".c" },
    })
    expect(parseCacheArgs(["--json", "stats", "--cache-dir", ".c"])).toEqual({
      kind: "run",
      command: "stats",
      options: { json: true, cacheDir: ".c" },
    })
  })

  it("reads prune limits: --max-age as days or hours and --max-entries as a count", () => {
    expect(parseCacheArgs(["prune", "--max-age", "7d", "--max-entries=50"])).toEqual({
      kind: "run",
      command: "prune",
      options: { json: false, maxAgeMs: 7 * 86_400_000, maxEntries: 50 },
    })
    expect(parseCacheArgs(["prune", "--max-age=12h"])).toEqual({
      kind: "run",
      command: "prune",
      options: { json: false, maxAgeMs: 12 * 3_600_000 },
    })
    expect(parseCacheArgs(["prune", "--max-entries", "0"])).toEqual({
      kind: "run",
      command: "prune",
      options: { json: false, maxEntries: 0 },
    })
  })

  it.each([
    [["prune", "--max-age", "7"], "option '--max-age' needs a duration like 7d or 12h, not '7'"],
    [["prune", "--max-age", "0d"], "option '--max-age' needs a duration like 7d or 12h, not '0d'"],
    [["prune", "--max-age", "xd"], "option '--max-age' needs a duration like 7d or 12h, not 'xd'"],
    [["prune", "--max-entries", "-1"], "option '--max-entries' needs a value"],
    [["prune", "--max-entries", "1.5"], "option '--max-entries' needs a whole number, not '1.5'"],
    [["prune", "--max-entries", "abc"], "option '--max-entries' needs a whole number, not 'abc'"],
    [["stats", "--max-age", "1d"], "option '--max-age' only applies to 'prune'"],
    [["clear", "--max-entries", "1"], "option '--max-entries' only applies to 'prune'"],
    [["stats", "-C"], "option '-C' needs a value"],
    [["stats", "--cache-dir="], "option '--cache-dir' needs a value"],
    [["stats", "--json=1"], "option '--json' does not take a value"],
    [["stats", "--bogus"], "unknown option '--bogus'"],
    [["stats", "extra"], "unexpected argument 'extra'"],
    [["stats", "--", "x"], "unexpected argument 'x'"],
    [["frobnicate"], "unknown command 'frobnicate'"],
    [[], "missing command: one of stats, clear, prune, why"],
    [["--json"], "missing command: one of stats, clear, prune, why"],
  ])("rejects %j", (argv, message) => {
    expect(parseCacheArgs(argv)).toEqual({ kind: "error", message })
  })

  it("answers --help and --version before anything else is checked", () => {
    expect(parseCacheArgs(["--help"])).toEqual({ kind: "help" })
    expect(parseCacheArgs(["stats", "-h", "--bogus"])).toEqual({ kind: "help" })
    expect(parseCacheArgs(["-V"])).toEqual({ kind: "version" })
    expect(parseCacheArgs(["stats", "--version"])).toEqual({ kind: "version" })
  })

  it("does not read a flag after -- as help", () => {
    expect(parseCacheArgs(["stats", "--", "--help"])).toEqual({
      kind: "error",
      message: "unexpected argument '--help'",
    })
  })
})

describe("runCache", () => {
  it("prints help to stdout and exits 0", async () => {
    const result = await invoke(["--help"])
    expect(result).toMatchObject({ code: 0, stdout: `${CACHE_USAGE}\n`, stderr: "" })
    expect(CACHE_USAGE).toContain("repo-contract cache <command>")
  })

  it("prints the version", async () => {
    expect(await invoke(["--version"])).toMatchObject({ code: 0, stdout: "9.9.9\n", stderr: "" })
  })

  it("reports a usage error on stderr and exits 2, touching nothing", async () => {
    const result = await invoke(["nope"])
    expect(result).toMatchObject({
      code: 2,
      stdout: "",
      stderr:
        "repo-contract cache: unknown command 'nope'\nTry 'repo-contract cache --help' for more information.\n",
    })
    expect(result.dirs).toEqual([])
  })

  it("locates the cache under the working directory by default, -C and --cache-dir", async () => {
    expect((await invoke(["stats"])).dirs).toEqual([at(".repo-contract", "cache")])
    expect((await invoke(["stats", "-C", "/other"])).dirs).toEqual([
      path.resolve("/other", ".repo-contract", "cache"),
    ])
    expect((await invoke(["stats", "-C", "sub"])).dirs).toEqual([
      at("sub", ".repo-contract", "cache"),
    ])
    expect((await invoke(["stats", "--cache-dir", "/tmp/c"])).dirs).toEqual(["/tmp/c"])
    expect((await invoke(["stats", "--cache-dir", "rel"])).dirs).toEqual([at("rel")])
  })

  describe("stats", () => {
    it("reports an empty cache", async () => {
      expect(await invoke(["stats"])).toMatchObject({
        code: 0,
        stdout: "0 entries (0 B)\n",
        stderr: "",
      })
    })

    it("lists entries, size, unreadable entries and each check", async () => {
      const store = memoryStore()
      await seed(store, () => new Date("2026-11-01T00:00:00.000Z"))
      store.files.set("index/lint/bad.json", "junk")
      const result = await invoke(["stats"], { store })
      expect(result.code).toBe(0)
      expect(result.stdout).toMatch(
        /^2 entries \(\d+ B\)\n1 unreadable \(run 'prune' to remove\)\n/,
      )
      expect(result.stdout).toContain("  lint: 1\n  tests: 1\n")
    })

    it("scales the size to KB and MB", async () => {
      const store = memoryStore()
      const cache = createCache({ store, mode: "read-write" })
      await cache.store({
        check: "tests",
        key: KEYS[0]!,
        inputs: {},
        value: "x".repeat(3000),
        durationMs: 1,
      })
      expect((await invoke(["stats"], { store })).stdout).toMatch(/^1 entry \(3\.\d KB\)\n/)
      await cache.store({
        check: "tests",
        key: KEYS[1]!,
        inputs: {},
        value: "x".repeat(3_000_000),
        durationMs: 1,
      })
      expect((await invoke(["stats"], { store })).stdout).toMatch(/^2 entries \(2\.\d MB\)\n/)
    })

    it("prints a versioned JSON document", async () => {
      const store = memoryStore()
      await seed(store, () => new Date("2026-11-01T00:00:00.000Z"))
      const result = await invoke(["stats", "--json"], { store })
      const report = JSON.parse(result.stdout) as Record<string, unknown>
      expect(report).toMatchObject({
        schemaVersion: 1,
        entries: 2,
        corrupt: 0,
        checks: { lint: 1, tests: 1 },
      })
      expect(typeof report.bytes).toBe("number")
    })
  })

  describe("clear", () => {
    it("removes everything and says how many", async () => {
      const store = memoryStore()
      await seed(store, () => new Date())
      expect(await invoke(["clear"], { store })).toMatchObject({
        code: 0,
        stdout: "Removed 2 entries\n",
      })
      expect(store.files.size).toBe(0)
    })

    it("says so for one entry and for none", async () => {
      const store = memoryStore()
      createCache({ store, mode: "read-write" })
      await createCache({ store, mode: "read-write" }).store({
        check: "a",
        key: KEYS[0]!,
        inputs: {},
        value: 1,
        durationMs: 1,
      })
      expect((await invoke(["clear"], { store })).stdout).toBe("Removed 1 entry\n")
      expect((await invoke(["clear"], { store })).stdout).toBe("Removed 0 entries\n")
    })

    it("prints JSON", async () => {
      const store = memoryStore()
      await seed(store, () => new Date())
      expect(JSON.parse((await invoke(["clear", "--json"], { store })).stdout)).toEqual({
        schemaVersion: 1,
        removed: 2,
      })
    })
  })

  describe("prune", () => {
    it("removes entries older than --max-age and keeps newer ones", async () => {
      const store = memoryStore()
      await seed(store, () => new Date("2026-11-01T00:00:00.000Z"))
      await createCache({
        store,
        mode: "read-write",
        now: () => new Date("2026-11-09T00:00:00.000Z"),
      }).store({ check: "tests", key: KEYS[2]!, inputs: {}, value: 1, durationMs: 1 })
      const result = await invoke(["prune", "--max-age", "7d"], { store })
      expect(result).toMatchObject({ code: 0, stdout: "Removed 2 entries\n" })
      expect(store.files.size).toBe(1)
    })

    it("keeps only the newest --max-entries", async () => {
      const store = memoryStore()
      await seed(store, () => new Date("2026-11-01T00:00:00.000Z"))
      expect((await invoke(["prune", "--max-entries", "1"], { store })).stdout).toBe(
        "Removed 1 entry\n",
      )
    })

    it("removes unreadable entries even without a limit", async () => {
      const store = memoryStore()
      await seed(store, () => new Date("2026-11-01T00:00:00.000Z"))
      store.files.set("index/lint/bad.json", "junk")
      expect((await invoke(["prune"], { store })).stdout).toBe("Removed 1 entry\n")
      expect(store.files.size).toBe(2)
    })

    it("prints JSON", async () => {
      expect(JSON.parse((await invoke(["prune", "--json"])).stdout)).toEqual({
        schemaVersion: 1,
        removed: 0,
      })
    })
  })

  it("reports a store that fails on stderr and exits 1", async () => {
    const out: string[] = []
    const err: string[] = []
    const code = await runCache({
      argv: ["stats"],
      cwd: "/w",
      version: "1",
      stdout: (text: string) => out.push(text),
      stderr: (text: string) => err.push(text),
      engine: { createCache },
      createStore: () => ({
        read: () => Promise.reject(new Error("EACCES: permission denied")),
        write: () => Promise.resolve(),
        remove: () => Promise.resolve(),
        list: () => Promise.reject(new Error("EACCES: permission denied")),
      }),
      now: () => new Date(),
    })
    expect(code).toBe(1)
    expect(out).toEqual([])
    expect(err.join("")).toBe("repo-contract cache: failed: EACCES: permission denied\n")
  })

  it("reports a thrown non-Error as text", async () => {
    const err: string[] = []
    const code = await runCache({
      argv: ["clear"],
      cwd: "/w",
      version: "1",
      stdout: () => undefined,
      stderr: (text: string) => err.push(text),
      engine: { createCache },
      createStore: () => {
        const thrown: unknown = "boom"
        throw thrown
      },
      now: () => new Date(),
    })
    expect(code).toBe(1)
    expect(err.join("")).toBe("repo-contract cache: failed: boom\n")
  })
})

describe("cache why", () => {
  const KEY = "a".repeat(64)
  const stored = (inputs: Record<string, string>) => {
    const store = memoryStore()
    const cache = createCache({
      store,
      mode: "read-write",
      now: () => new Date("2026-11-09T00:00:00.000Z"),
    })
    return cache
      .store({ check: "tests", key: KEY, inputs, value: 1, durationMs: 1 })
      .then(() => store)
  }
  const inputsFile = (inputs: unknown) => ({ [at("inputs.json")]: JSON.stringify(inputs) })

  it("parses the check and --inputs, in either value form", () => {
    expect(parseCacheArgs(["why", "tests", "--inputs", "in.json"])).toEqual({
      kind: "run",
      command: "why",
      options: { json: false, inputs: "in.json" },
      check: "tests",
    })
    expect(parseCacheArgs(["why", "--inputs=in.json", "tests", "--json"])).toMatchObject({
      command: "why",
      check: "tests",
      options: { json: true, inputs: "in.json" },
    })
  })

  it.each([
    [["why", "--inputs", "i.json"], "missing check: 'why' needs the check id"],
    [["why", "tests"], "'why' needs --inputs <file>"],
    [["why", "a", "b", "--inputs", "i.json"], "unexpected argument 'b'"],
    [["stats", "tests"], "unexpected argument 'tests'"],
    [["stats", "--inputs", "i.json"], "option '--inputs' only applies to 'why'"],
  ])("rejects %j", (argv, message) => {
    expect(parseCacheArgs(argv)).toEqual({ kind: "error", message })
  })

  it("says there is nothing to compare with when the check has no entry", async () => {
    const { code, stdout } = await invoke(["why", "tests", "--inputs", "inputs.json"], {
      files: inputsFile({ "src/a.ts": "1" }),
    })
    expect(code).toBe(0)
    expect(stdout).toBe("tests: no previous entry; the first run computes it.\n")
  })

  it("lists what changed, was added and was removed against the latest entry", async () => {
    const store = await stored({ "src/a.ts": "1", "src/b.ts": "2", "src/gone.ts": "3" })
    const { code, stdout } = await invoke(["why", "tests", "--inputs", "inputs.json"], {
      store,
      files: inputsFile({ "src/a.ts": "9", "src/b.ts": "2", "src/new.ts": "4" }),
    })
    expect(code).toBe(0)
    expect(stdout).toBe(
      [
        `tests: inputs differ from the latest entry (${KEY.slice(0, 12)}).`,
        "  changed: src/a.ts",
        "  added: src/new.ts",
        "  removed: src/gone.ts",
        "",
      ].join("\n"),
    )
  })

  it("says when the inputs are the same, so a miss must come from tools or the cache format", async () => {
    const store = await stored({ "src/a.ts": "1" })
    const { stdout } = await invoke(["why", "tests", "--inputs", "inputs.json"], {
      store,
      files: inputsFile({ "src/a.ts": "1" }),
    })
    expect(stdout).toBe(
      "tests: inputs match the latest entry; a miss now comes from a tool version or the cache format.\n",
    )
  })

  it("prints a versioned JSON document", async () => {
    const store = await stored({ "src/a.ts": "1" })
    const { stdout } = await invoke(["why", "tests", "--inputs", "inputs.json", "--json"], {
      store,
      files: inputsFile({ "src/a.ts": "2" }),
    })
    expect(JSON.parse(stdout)).toEqual({
      schemaVersion: 1,
      check: "tests",
      kind: "changed",
      changed: ["src/a.ts"],
      added: [],
      removed: [],
      comparedWith: KEY,
    })
  })

  it("fails with exit 1 when the inputs file is missing or not a record of strings", async () => {
    const missing = await invoke(["why", "tests", "--inputs", "inputs.json"])
    expect(missing.code).toBe(1)
    expect(missing.stderr).toContain("could not read inputs file inputs.json")
    for (const body of ["{", "[]", '{"a": 1}', "null"]) {
      const bad = await invoke(["why", "tests", "--inputs", "inputs.json"], {
        files: { [at("inputs.json")]: body },
      })
      expect(bad.code).toBe(1)
      expect(bad.stderr).toContain(
        "inputs file inputs.json must be a JSON object of input name to digest",
      )
    }
  })

  it("fails with exit 1 for a check id the cache cannot hold", async () => {
    const { code, stderr } = await invoke(["why", "../etc", "--inputs", "inputs.json"], {
      files: inputsFile({}),
    })
    expect(code).toBe(1)
    expect(stderr).toContain("repo-contract cache: failed:")
  })
})

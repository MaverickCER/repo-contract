import { createHash } from "node:crypto"
import { required } from "./required.js"
import type { RunScope } from "./scope.js"

/** Bumped whenever an entry's shape or the way a key is built changes; an old entry is then never replayed. */
export const CACHE_FORMAT = 1

/**
 * Where entries live. Paths are relative and slash-separated (`index/<check>/<key>.json`); the
 * implementation decides what they map to (a directory, a memory map). It never sees an unsafe
 * path: the cache validates check ids and keys before building one.
 */
export interface CacheStore {
  /** The content at a path, or `undefined` if there is none. */
  read(path: string): Promise<string | undefined>
  /** Writes a path, replacing any content, so that a reader never sees a partial write. */
  write(path: string, content: string): Promise<void>
  /** Removes a path; absent is not an error. */
  remove(path: string): Promise<void>
  /** Every path that starts with the prefix. */
  list(prefix: string): Promise<readonly string[]>
}

/** Whether the cache is consulted and written. */
export type CacheMode = "read-write" | "read-only" | "off"

/** What a check's result was computed from and what it was. */
export interface CacheEntry<TValue = unknown> {
  readonly formatVersion: typeof CACHE_FORMAT
  readonly check: string
  readonly key: string
  /** Every input's name and a digest of its content, so a miss can say what changed. */
  readonly inputs: Readonly<Record<string, string>>
  readonly value: TValue
  readonly durationMs: number
  readonly createdAt: string
}

/** The result of looking an entry up. */
export type CacheLookup<TValue = unknown> =
  | { readonly hit: true; readonly entry: CacheEntry<TValue> }
  | { readonly hit: false; readonly reason: "miss" | "corrupt" | "disabled" }

/** Why a computation is not served from the cache, relative to the check's latest entry. */
export type MissExplanation =
  | { readonly kind: "no-previous" }
  | { readonly kind: "same-inputs" }
  | {
      readonly kind: "changed"
      readonly changed: readonly string[]
      readonly added: readonly string[]
      readonly removed: readonly string[]
      readonly comparedWith: string
    }

/** What is in the cache. */
export interface CacheStats {
  readonly entries: number
  readonly bytes: number
  readonly corrupt: number
  readonly checks: Readonly<Record<string, number>>
}

/** What to store for a computed result. */
export interface CacheStoreInput {
  readonly check: string
  readonly key: string
  readonly inputs: Readonly<Record<string, string>>
  /** The result to replay; it must survive `JSON.stringify`. */
  readonly value: unknown
  readonly durationMs: number
}

/** The limits `prune` enforces; an absent limit is not enforced. */
export interface PruneLimits {
  /** Entries older than this are removed. */
  readonly maxAgeMs?: number
  /** Only this many of the newest entries are kept. */
  readonly maxEntries?: number
}

/** A content-addressed computation cache over a `CacheStore`. */
export interface Cache {
  readonly mode: CacheMode
  /** Finds the entry for a key; anything unreadable or inconsistent is a miss, never a replay. */
  lookup<TValue = unknown>(check: string, key: string): Promise<CacheLookup<TValue>>
  /** Stores a result; resolves to whether it was written (never in `off` or `read-only`). */
  store(input: CacheStoreInput): Promise<boolean>
  /** Compares inputs with the check's latest entry, to explain a miss. */
  why(check: string, inputs: Readonly<Record<string, string>>): Promise<MissExplanation>
  /** Counts what is stored. */
  stats(): Promise<CacheStats>
  /** Removes entries beyond the limits, and every unreadable one; resolves to how many. */
  prune(limits: PruneLimits): Promise<number>
  /** Removes every entry; resolves to how many. */
  clear(): Promise<number>
}

const INDEX = "index/"
const CHECK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const KEY = /^[0-9a-f]{64}$/
const MODES: Readonly<Record<string, CacheMode>> = {
  off: "off",
  ro: "read-only",
  rw: "read-write",
}

const byName = (record: Readonly<Record<string, string>>): [string, string][] => {
  const values = new Map(Object.entries(record))
  return [...values.keys()].sort().map((name) => [name, required(values, name)])
}

/**
 * Builds the key a result is stored under: a digest of the check, every input's name and content
 * digest, the tool versions, and the cache format. Anything that can change the result belongs in
 * `inputs` or `tools`; the key says nothing about what is left out.
 * @param input - The check id, its inputs (name to content digest) and the tools' versions.
 * @param input.check - The check id.
 * @param input.inputs - Each input's name and a digest of its content.
 * @param input.tools - Each tool's name and version.
 * @returns A 64-character hex digest.
 */
export function cacheKey(input: {
  readonly check: string
  readonly inputs: Readonly<Record<string, string>>
  readonly tools: Readonly<Record<string, string>>
}): string {
  return createHash("sha256")
    .update(JSON.stringify([CACHE_FORMAT, input.check, byName(input.inputs), byName(input.tools)]))
    .digest("hex")
}

/**
 * Decides the cache mode of a run. A full run is always cold (the cache is neither read nor
 * written), so a release can never be satisfied by an earlier result; otherwise the command line
 * wins over `REPO_CONTRACT_CACHE` (`off`, `ro` or `rw`), which wins over the default of read-write.
 * @param input - The run's scope, the environment as data, and any mode given on the command line.
 * @param input.scope - The run's scope.
 * @param input.env - The environment, as data.
 * @param input.flag - A mode given on the command line.
 * @returns The mode and why.
 * @throws {Error} If `REPO_CONTRACT_CACHE` is not one of off, ro, rw.
 */
export function resolveCacheMode(input: {
  readonly scope: RunScope
  readonly env: Readonly<Record<string, string | undefined>>
  readonly flag?: CacheMode
}): { readonly mode: CacheMode; readonly reason: string } {
  if (input.scope === "full") {
    return { mode: "off", reason: "a full run always runs cold" }
  }
  if (input.flag !== undefined) {
    return { mode: input.flag, reason: "the command line" }
  }
  const value = input.env.REPO_CONTRACT_CACHE
  if (value === undefined || value === "") {
    return { mode: "read-write", reason: "the default" }
  }
  const mode = MODES[value]
  if (mode === undefined) {
    throw new Error(`REPO_CONTRACT_CACHE must be one of off, ro, rw, not "${value}".`)
  }
  return { mode, reason: `REPO_CONTRACT_CACHE=${value}` }
}

/**
 * @param check - A check id from the caller.
 * @returns The id, if it is a plain name that cannot address anything outside its own directory.
 * @throws {TypeError} Otherwise.
 */
function validCheck(check: string): string {
  if (!CHECK_ID.test(check)) {
    throw new TypeError(`Invalid cache check id "${check}".`)
  }
  return check
}

/**
 * @param key - A key from the caller.
 * @returns The key, if it is a 64-character lowercase hex digest.
 * @throws {TypeError} Otherwise.
 */
function validKey(key: string): string {
  if (!KEY.test(key)) {
    throw new TypeError(`Invalid cache key "${key}".`)
  }
  return key
}

const entryPath = (check: string, key: string): string => `${INDEX}${check}/${key}.json`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Whether a stored entry is well formed is decided here; whether it is the entry a path names is
 * decided by the caller, which compares the entry's `check` and `key` with that path.
 * @param text - A stored file's content.
 * @returns The entry it holds, or `undefined` if it is not a well-formed entry of this format.
 */
function parseEntry(text: string): CacheEntry | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    // Text that is not JSON stays `undefined`, which the checks below reject like any other junk.
  }
  const entry = parsed as Partial<Record<keyof CacheEntry, unknown>> | null
  if (entry?.formatVersion !== CACHE_FORMAT || !("value" in entry)) {
    return undefined
  }
  const { inputs, durationMs, createdAt } = entry
  if (
    !isRecord(inputs) ||
    !Object.values(inputs).every((digest) => typeof digest === "string") ||
    !Number.isFinite(durationMs) ||
    typeof createdAt !== "string" ||
    Number.isNaN(Date.parse(createdAt))
  ) {
    return undefined
  }
  return entry as CacheEntry
}

/** An entry together with where it was found. */
interface Found {
  readonly path: string
  readonly size: number
  readonly entry: CacheEntry | undefined
}

/**
 * Creates a cache over a store.
 * @param options - The store, the mode and (for tests) a clock.
 * @param options.store - Where entries live.
 * @param options.mode - Whether to read and write.
 * @param options.now - The clock, for an entry's creation time and for pruning by age.
 * @returns The cache.
 */
export function createCache(options: {
  readonly store: CacheStore
  readonly mode: CacheMode
  readonly now?: () => Date
}): Cache {
  const { store, mode } = options
  const now = options.now ?? ((): Date => new Date())
  const writable = mode === "read-write"

  /**
   * @param prefix - Which paths to read.
   * @returns Every stored entry under the prefix, readable or not.
   */
  const scan = async (prefix: string): Promise<Found[]> => {
    const found: Found[] = []
    for (const path of await store.list(prefix)) {
      const text = await store.read(path)
      if (text === undefined) {
        continue
      }
      const entry = parseEntry(text)
      const [, check, file] = path.split("/")
      const consistent =
        entry !== undefined && entry.check === check && `${entry.key}.json` === file
      found.push({
        path,
        size: Buffer.byteLength(text),
        entry: consistent ? entry : undefined,
      })
    }
    return found
  }

  return {
    mode,

    async lookup<TValue>(check: string, key: string): Promise<CacheLookup<TValue>> {
      const path = entryPath(validCheck(check), validKey(key))
      if (mode === "off") {
        return { hit: false, reason: "disabled" }
      }
      const text = await store.read(path)
      if (text === undefined) {
        return { hit: false, reason: "miss" }
      }
      const entry = parseEntry(text)
      if (entry?.check !== check || entry.key !== key) {
        return { hit: false, reason: "corrupt" }
      }
      return { hit: true, entry: entry as CacheEntry<TValue> }
    },

    async store(input: CacheStoreInput): Promise<boolean> {
      const path = entryPath(validCheck(input.check), validKey(input.key))
      const entry: CacheEntry = {
        formatVersion: CACHE_FORMAT,
        check: input.check,
        key: input.key,
        inputs: input.inputs,
        value: input.value,
        durationMs: input.durationMs,
        createdAt: now().toISOString(),
      }
      const text = JSON.stringify(entry)
      if (!("value" in (JSON.parse(text) as object))) {
        throw new TypeError("A cache value must be JSON.")
      }
      if (!writable) {
        return false
      }
      await store.write(path, text)
      return true
    },

    async why(check, inputs): Promise<MissExplanation> {
      const latest = (await scan(`${INDEX}${validCheck(check)}/`))
        .flatMap((found) => (found.entry === undefined ? [] : [found.entry]))
        .reduce<CacheEntry | undefined>(
          (newest, entry) =>
            newest === undefined || entry.createdAt > newest.createdAt ? entry : newest,
          undefined,
        )
      if (latest === undefined) {
        return { kind: "no-previous" }
      }
      const before = latest.inputs
      const changed = Object.keys(inputs).filter(
        (name) => name in before && before[name] !== inputs[name],
      )
      const added = Object.keys(inputs).filter((name) => !(name in before))
      const removed = Object.keys(before).filter((name) => !(name in inputs))
      if (changed.length === 0 && added.length === 0 && removed.length === 0) {
        return { kind: "same-inputs" }
      }
      return { kind: "changed", changed, added, removed, comparedWith: latest.key }
    },

    async stats(): Promise<CacheStats> {
      const checks: Record<string, number> = {}
      let entries = 0
      let bytes = 0
      let corrupt = 0
      for (const found of await scan(INDEX)) {
        if (found.entry === undefined) {
          corrupt += 1
          continue
        }
        entries += 1
        bytes += found.size
        checks[found.entry.check] = (checks[found.entry.check] ?? 0) + 1
      }
      return { entries, bytes, corrupt, checks }
    },

    async prune(limits: PruneLimits): Promise<number> {
      if (!writable) {
        return 0
      }
      const current = now().getTime()
      const maxAge = limits.maxAgeMs ?? Infinity
      const doomed: string[] = []
      const kept: { path: string; time: number }[] = []
      for (const found of await scan(INDEX)) {
        const time = found.entry === undefined ? undefined : Date.parse(found.entry.createdAt)
        if (time === undefined || current - time > maxAge) {
          doomed.push(found.path)
        } else {
          kept.push({ path: found.path, time })
        }
      }
      if (limits.maxEntries !== undefined) {
        kept.sort((a, b) => b.time - a.time)
        doomed.push(...kept.slice(limits.maxEntries).map((item) => item.path))
      }
      for (const path of doomed) {
        await store.remove(path)
      }
      return doomed.length
    },

    async clear(): Promise<number> {
      if (!writable) {
        return 0
      }
      const paths = await store.list(INDEX)
      for (const path of paths) {
        await store.remove(path)
      }
      return paths.length
    },
  }
}

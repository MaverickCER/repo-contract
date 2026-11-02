export const CACHE_USAGE: string
export type ParsedCacheArgs =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | {
      kind: "run"
      command: "stats" | "clear" | "prune" | "why"
      options: {
        json: boolean
        cwd?: string
        cacheDir?: string
        maxAgeMs?: number
        maxEntries?: number
        inputs?: string
      }
      /** The check id, for `why`. */
      check?: string
    }
export function parseCacheArgs(argv: readonly string[]): ParsedCacheArgs
export function runCache(input: Record<string, unknown>): Promise<number>

import { planShards, shardMatrix } from "./shard.js"
import type { ShardMatrix, ShardPlan } from "./shard.js"

/** Bytes of mutated source one shard is sized for. */
export const MUTATION_SHARD_BYTES = 65_536

/** The most shards a plan asks for. */
export const MAX_MUTATION_SHARDS = 256

/** One file the Stryker config mutates, and its size. */
export interface MutatedFile {
  readonly path: string
  readonly bytes: number
}

/** What {@link planMutationShards} returns, and the core of `repo-contract mutation plan --json`. */
export interface MutationPlan {
  readonly files: number
  readonly bytes: number
  /** `clamp(ceil(bytes / 65536), 1, min(files, 256))`. */
  readonly count: number
  /** The files of each shard. `weightsMs` holds each shard's bytes here, not milliseconds. */
  readonly plan: ShardPlan
  readonly matrix: ShardMatrix
}

/**
 * @param name - The input's name, for the error.
 * @param value - The value to check.
 * @throws {RangeError} If the value is not a whole number of at least 0.
 */
function requireCount(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number of at least 0, not ${String(value)}.`)
  }
}

/**
 * The shard count with no knobs: one shard per 64 KiB of mutated source, at least one, never more
 * shards than files, and never more than {@link MAX_MUTATION_SHARDS}. Bytes stand in for Stryker's
 * cost because every repository has them; recorded timings exist only after a run.
 * @param input - the mutated source.
 * @param input.bytes - its total size.
 * @param input.files - how many files it spans.
 * @returns the count; `0` only when there are no files.
 * @throws {RangeError} If either input is not a whole number of at least 0, or bytes come with no files.
 */
export function mutationShardCount(input: {
  readonly bytes: number
  readonly files: number
}): number {
  requireCount("bytes", input.bytes)
  requireCount("files", input.files)
  if (input.files === 0) {
    if (input.bytes > 0) throw new RangeError(`${String(input.bytes)} bytes cannot span 0 files.`)
    return 0
  }
  const wanted = Math.ceil(input.bytes / MUTATION_SHARD_BYTES)
  return Math.max(1, Math.min(wanted, input.files, MAX_MUTATION_SHARDS))
}

/**
 * Plans a sharded mutation run of every file the Stryker config mutates. Files are split
 * heaviest first onto the lightest shard, by bytes, so the shards finish at about the same time.
 * The same files give the same plan in any order.
 * @param files - the mutated files and their sizes; each path once.
 * @returns the count, the split and the matrix. No files gives a count of 0 and an empty matrix.
 * @throws {RangeError} If a path is empty or listed twice, or a size is not a whole number of at least 0.
 */
export function planMutationShards(files: readonly MutatedFile[]): MutationPlan {
  const sizes = new Map<string, number>()
  for (const { path, bytes } of files) {
    if (path === "") throw new RangeError("A mutated file needs a path.")
    if (sizes.has(path)) throw new RangeError(`${path} is listed twice.`)
    requireCount(`The size of ${path}`, bytes)
    sizes.set(path, bytes)
  }
  const bytes = [...sizes.values()].reduce((total, size) => total + size, 0)
  const count = mutationShardCount({ bytes, files: sizes.size })
  const plan =
    count === 0
      ? { count: 0, shards: [], weightsMs: [] }
      : planShards({
          targets: [...sizes.keys()],
          timingsMs: Object.fromEntries(sizes),
          shards: count,
        })
  return { files: sizes.size, bytes, count, plan, matrix: shardMatrix(count) }
}

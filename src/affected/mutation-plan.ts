import { notImplemented } from "../not-implemented.js"
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
  /** The files of each shard, weighted by size. */
  readonly plan: ShardPlan
  readonly matrix: ShardMatrix
}

/**
 * The shard count with no knobs: one shard per 64 KiB of mutated source, at least one, never more
 * shards than files, and never more than {@link MAX_MUTATION_SHARDS}.
 * @param input - the mutated source.
 * @param input.bytes - its total size.
 * @param input.files - how many files it spans.
 * @returns the count; `0` only when there are no files.
 */
export function mutationShardCount(input: {
  readonly bytes: number
  readonly files: number
}): number {
  return notImplemented("R5", input)
}

/**
 * Plans a sharded mutation run of every file the Stryker config mutates.
 * @param files - the mutated files and their sizes.
 * @returns the count, the split and the matrix.
 */
export function planMutationShards(files: readonly MutatedFile[]): MutationPlan {
  return notImplemented("R5", files)
}

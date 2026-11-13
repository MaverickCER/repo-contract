/**
 * Affected scope: given a diff, list the tests and mutation targets the change can reach. Changed
 * files are compared with their base to find the exports whose behavior may differ, and those
 * exports are followed through the import graph. A case the analysis cannot reason about widens
 * the answer toward a full run; it never narrows on a guess.
 *
 * Pure: file contents, the diff and the TypeScript compiler API come in as data and capabilities,
 * so this barrel reads no file and runs no process (see
 * specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md).
 *
 * Experimental, and published under its own `./affected` subpath; never re-exported from the
 * package root.
 * @packageDocumentation
 */
export { computeAffected } from "./compute-affected.js"
export {
  DEFAULT_IGNORE,
  DEFAULT_NOT_MUTATED,
  DEFAULT_TESTS,
  DEFAULT_TRIGGERS,
} from "./compute-affected.js"
export { parseAffectedConfig } from "./config.js"
export { loadCompilerOptions } from "./tsconfig.js"
export type { LoadCompilerOptionsInput } from "./tsconfig.js"
export { computeAffectedFromGit, parseNameStatus } from "./collect.js"
export type { ComputeAffectedFromGitInput, GitCapabilities } from "./collect.js"
export { explainAffected } from "./explain.js"
export { CACHE_FORMAT, cacheKey, createCache, resolveCacheMode } from "./cache.js"
export type {
  Cache,
  CacheEntry,
  CacheLookup,
  CacheMode,
  CacheStats,
  CacheStore,
  CacheStoreInput,
  MissExplanation,
  PruneLimits,
} from "./cache.js"
export { mergeMutationReports, parseShardSpec, planShards, shardMatrix } from "./shard.js"
export type {
  MergeResult,
  ShardMatrix,
  ShardPlan,
  ShardPlanInput,
  ShardReport,
  ShardSpec,
} from "./shard.js"
export { findEscapes } from "./canary.js"
export type { CanaryInput, CanaryResult } from "./canary.js"
export { packArtifacts, unpackArtifacts } from "./artifacts.js"
export type { ArtifactInput, PackedArtifact, PackedArtifacts, UnpackResult } from "./artifacts.js"
export { diagnose, planFixes } from "./doctor.js"
export type {
  DoctorFinding,
  DoctorFix,
  DoctorReport,
  DoctorSnapshot,
  FindingSeverity,
  PlannedChange,
} from "./doctor.js"
export { parseFailFastArgs, resolveFailFast } from "./fail-fast.js"
export { parseScopeArgs, resolveScope } from "./scope.js"
export type {
  ParsedScopeArgs,
  ResolveScopeInput,
  RequestedScope,
  RunScope,
  ScopeDecision,
  ScopeSource,
} from "./scope.js"
export type {
  AffectedOptions,
  AffectedResult,
  AffectedScope,
  ChangedFile,
  ChangeKind,
  ComputeAffectedInput,
  LinkRule,
  TypeScriptApi,
  Widening,
  WideningReason,
} from "./types.js"

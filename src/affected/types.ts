import type * as TypeScript from "typescript"

/** The TypeScript compiler API, supplied by the caller: this package never imports `typescript` at runtime. */
export type TypeScriptApi = typeof TypeScript

/** How one path differs between the base and the working tree. */
export type ChangeKind = "added" | "modified" | "deleted" | "renamed"

/** One changed path, as reported by the caller (typically from `git diff --name-status -M`). */
export interface ChangedFile {
  /** Repo-relative, forward-slash path. */
  readonly path: string
  readonly kind: ChangeKind
  /** For `renamed`: the path the file had at the base. */
  readonly renamedFrom?: string
}

/** The inputs of {@link computeAffected}. Everything is data: this layer reads no file and runs no process. */
export interface ComputeAffectedInput {
  readonly ts: TypeScriptApi
  /** Current contents of every JS/TS module in the project (sources and tests), keyed by repo-relative path. */
  readonly files: ReadonlyMap<string, string>
  /** Base contents of every changed module path that existed at the base (modified, deleted and renamed-from paths). */
  readonly baseFiles: ReadonlyMap<string, string>
  /** Every changed path, module or not. */
  readonly changed: readonly ChangedFile[]
  /** `compilerOptions` for module resolution (`paths`, `baseUrl`, ...). Defaults to bundler resolution. */
  readonly compilerOptions?: TypeScript.CompilerOptions
  readonly options?: AffectedOptions
  /** When set, the analysis is skipped and everything is reported affected for this reason. */
  readonly fullBecause?: Widening
}

/** Optional tuning. Every default is the conservative choice. */
export interface AffectedOptions {
  /** Globs of non-module files that can never influence a test (default: changesets, changelog, license, codeowners). */
  readonly ignore?: readonly string[]
  /** Globs of files whose change makes everything affected (default: package manifests, lockfiles, tool configs, CI). */
  readonly triggers?: readonly string[]
  /** Globs of test entry files (default: `*.test.*` and `*.spec.*`). */
  readonly tests?: readonly string[]
  /** Globs of files that are never mutation targets (default: tests, test support and declaration files). */
  readonly notMutated?: readonly string[]
  /**
   * Couplings the import graph cannot see: when a changed file matches `when`, every test matching
   * one of `run` is affected. For fixtures, golden files, or anything a test reads without importing.
   */
  readonly links?: readonly LinkRule[]
}

export interface LinkRule {
  readonly when: string
  readonly run: readonly string[]
}

/** Why a run left the narrow path. */
export interface Widening {
  readonly reason: WideningReason
  /** The file (or glob) that caused it. */
  readonly file: string
  /** What got wider: `"full"` for the whole project, otherwise what the file now drags in. */
  readonly to: "full" | "all-exports" | "always-run"
  readonly detail?: string
}

export type WideningReason =
  | "global-trigger"
  | "unplaced-file"
  | "parse-error"
  | "dynamic-import"
  | "module-side-effect"
  | "git-failed"
  | "tsconfig"

export type AffectedScope = "affected" | "full"

export interface AffectedResult {
  readonly scope: AffectedScope
  /** Present when `scope` is `"full"`: the first reason the narrow path was abandoned. */
  readonly fullBecause?: Widening
  readonly changedFiles: readonly string[]
  /** `file#export` for every export whose behavior may differ from the base. */
  readonly changedSymbols: readonly string[]
  /** Non-test modules that depend on a changed symbol (plus the changed modules themselves). */
  readonly affectedSources: readonly string[]
  /** Test entry files to run. */
  readonly affectedTests: readonly string[]
  /** Source files whose mutants are worth re-evaluating: changed sources and their direct symbol dependents. */
  readonly mutateTargets: readonly string[]
  readonly widened: readonly Widening[]
  /** Internal provenance for {@link explainAffected}. */
  readonly causes: ReadonlyMap<string, string>
}

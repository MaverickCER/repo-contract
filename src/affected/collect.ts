import { computeAffected, isModulePath } from "./compute-affected.js"
import { loadCompilerOptions } from "./tsconfig.js"
import type {
  AffectedOptions,
  AffectedResult,
  ChangedFile,
  TypeScriptApi,
  Widening,
} from "./types.js"
import type * as TypeScript from "typescript"

/** The two things the collector needs from the machine, supplied by the caller. */
export interface GitCapabilities {
  /** Runs `git <args>` in the repository; resolves to stdout, or `undefined` if git exits non-zero. */
  git(args: readonly string[]): Promise<string | undefined>
  /** Reads a repo-relative file from the working tree; resolves to `undefined` if it cannot be read. */
  readFile(path: string): Promise<string | undefined>
}

export interface ComputeAffectedFromGitInput {
  readonly ts: TypeScriptApi
  readonly capabilities: GitCapabilities
  /** The ref to compare against. Defaults to the upstream branch, then `origin/main`, then `origin/master`. */
  readonly base?: string
  /** Compiler options for module resolution. When absent they are read from the tsconfig. */
  readonly compilerOptions?: TypeScript.CompilerOptions
  /** The tsconfig to read the options from (default `tsconfig.json`, which may be absent). */
  readonly tsconfig?: string
  readonly options?: AffectedOptions
}

const DEFAULT_BASES = ["@{upstream}", "origin/main", "origin/master"]

const STATUS_KINDS: Readonly<Record<string, ChangedFile["kind"]>> = {
  M: "modified",
  T: "modified",
  A: "added",
  D: "deleted",
}

/**
 * Parses `git diff --name-status -M -z` output.
 * @param output - The NUL-separated output.
 * @returns The changes, or `undefined` if any entry is not understood (never a partial guess).
 */
export function parseNameStatus(output: string): ChangedFile[] | undefined {
  const tokens = output.split("\0")
  if (tokens[tokens.length - 1] === "") {
    tokens.pop()
  }
  const changes: ChangedFile[] = []
  // Entries have different lengths (a rename carries two paths), so remember how far the last one reached.
  let reached = 0
  for (const [index, token] of tokens.entries()) {
    if (index < reached) {
      continue
    }
    const status = token.charAt(0)
    const first = tokens[index + 1]
    if (first === undefined || first === "") {
      return undefined
    }
    if (status === "R" || status === "C") {
      const second = tokens[index + 2]
      if (second === undefined || second === "") {
        return undefined
      }
      changes.push(
        status === "R"
          ? { path: second, kind: "renamed", renamedFrom: first }
          : { path: second, kind: "added" },
      )
      reached = index + 3
      continue
    }
    const kind = STATUS_KINDS[status]
    if (kind === undefined) {
      return undefined
    }
    changes.push({ path: first, kind })
    reached = index + 2
  }
  return changes
}

const failure = (file: string, detail: string): Widening => ({
  reason: "git-failed",
  file,
  to: "full",
  detail,
})

const names = (output: string): string[] => output.split("\0").filter((name) => name !== "")

/**
 * Computes the affected set for the working tree against a base, using git and file reads the
 * caller supplies. Anything git cannot answer makes the result `"full"`.
 * @param input - The TypeScript API, the capabilities and optional tuning.
 * @returns The affected sets, as from `computeAffected`.
 */
export async function computeAffectedFromGit(
  input: ComputeAffectedFromGitInput,
): Promise<AffectedResult> {
  const git = (args: readonly string[]): Promise<string | undefined> => input.capabilities.git(args)
  const readFile = (path: string): Promise<string | undefined> => input.capabilities.readFile(path)
  const base = await resolveBase(git, input.base)

  const listing = await git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
  const files =
    listing === undefined ? new Map<string, string>() : await readModules(listing, readFile)
  const loaded =
    input.compilerOptions === undefined
      ? await loadCompilerOptions({ ts: input.ts, readFile, file: input.tsconfig })
      : { options: input.compilerOptions }
  const compilerOptions = "options" in loaded ? loaded.options : undefined
  const common = {
    ts: input.ts,
    files,
    compilerOptions,
    options: input.options,
  }
  const full = (fullBecause: Widening): AffectedResult =>
    computeAffected({ ...common, baseFiles: new Map(), changed: [], fullBecause })

  if (base === undefined) {
    return full(
      input.base === undefined
        ? failure("merge-base", "no base to compare against")
        : failure(input.base, "base ref could not be resolved"),
    )
  }
  if (listing === undefined) {
    return full(failure("ls-files", "could not list the repository's files"))
  }
  if ("because" in loaded) {
    return full(loaded.because)
  }
  const diff = await git(["diff", "--name-status", "-M", "-z", "--no-ext-diff", base])
  if (diff === undefined) {
    return full(failure("diff", "could not diff against the base"))
  }
  const tracked = parseNameStatus(diff)
  if (tracked === undefined) {
    return full(failure("diff", "unrecognised name-status output"))
  }
  const untracked = await git(["ls-files", "--others", "--exclude-standard", "-z"])
  if (untracked === undefined) {
    return full(failure("ls-files", "could not list untracked files"))
  }
  const changed = [
    ...tracked,
    ...names(untracked).map((path): ChangedFile => ({ path, kind: "added" })),
  ]

  const baseFiles = await readBases(git, base, changed)
  return computeAffected({ ...common, baseFiles, changed })
}

/**
 * Finds the commit to compare against.
 * @param git - The git capability.
 * @param given - An explicit ref, which is never silently replaced by a default.
 * @returns The merge-base commit, or `undefined` if none could be found.
 */
async function resolveBase(
  git: GitCapabilities["git"],
  given: string | undefined,
): Promise<string | undefined> {
  for (const ref of given === undefined ? DEFAULT_BASES : [given]) {
    const sha = (await git(["merge-base", ref, "HEAD"]))?.trim()
    if (sha !== undefined && sha !== "") {
      return sha
    }
  }
  return undefined
}

/**
 * Reads every JS/TS module in a file listing.
 * @param listing - NUL-separated paths from `git ls-files -z`.
 * @param readFile - The file capability.
 * @returns The modules that could be read, by path.
 */
async function readModules(
  listing: string,
  readFile: (path: string) => Promise<string | undefined>,
): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  for (const path of names(listing).filter(isModulePath)) {
    const content = await readFile(path)
    if (content !== undefined) {
      files.set(path, content)
    }
  }
  return files
}

/**
 * Reads, from git, the base content of every changed module that existed at the base.
 * @param git - The git capability.
 * @param base - The commit compared against.
 * @param changed - Every change.
 * @returns The base contents by path (a module whose base cannot be read is simply absent).
 */
async function readBases(
  git: GitCapabilities["git"],
  base: string,
  changed: readonly ChangedFile[],
): Promise<Map<string, string>> {
  const baseFiles = new Map<string, string>()
  for (const change of changed) {
    const path = change.renamedFrom ?? change.path
    if (change.kind !== "added" && isModulePath(path)) {
      const content = await git(["show", `${base}:${path}`])
      if (content !== undefined) {
        baseFiles.set(path, content)
      }
    }
  }
  return baseFiles
}

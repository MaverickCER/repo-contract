import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { gitSpawnEnv } from "./git-env.js"

const execFileAsync = promisify(execFile)

/**
 * One file changed in the diff, as git reports it. Line counts come from `git diff --numstat`.
 * Status/rename detection comes from `git diff --name-status`. Both run with `-M` (rename
 * detection) against the same `<base>...HEAD` range. Their output lists are therefore in the same
 * order and can be zipped by index. Git computes one underlying tree diff for a given range/flags
 * and renders it two ways. The per-file ordering is identical between the two invocations.
 */
interface RawDiffFile {
  readonly path: string
  readonly changeKind: "added" | "modified" | "deleted" | "renamed"
  readonly renamedFrom?: string
  readonly linesAdded: number
  readonly linesRemoved: number
}

/**
 * Runs `git` and returns its stdout. It deliberately does not distinguish *why* a non-zero exit
 * happened (an unresolvable ref, a transient lock, `cwd` not being a git working tree). Every such
 * failure collapses to the same `undefined`. A call site where that distinction matters must
 * check it separately. Two failures are not collapsed and rethrow instead: output exceeding
 * `maxBuffer`, and `git` itself being unavailable (see the comment in the `catch` below).
 *
 * The result is deliberately not narrowed by inspecting `stderr`/the exit code for a more specific
 * "ref genuinely doesn't exist" signal. Git's exact wording and exit code for that case are not a
 * stable, version/locale-independent contract to string-match against. Matching them would remove
 * a rare, self-correcting case: a transient failure treated as absent. In exchange it would add a
 * locale- or git-version-dependent false rethrow on every caller's *legitimate* "doesn't exist"
 * case. Every current caller already wants this behaviour.
 * - This file's own `--name-status`/`--numstat` reads report an unresolvable diff range the same
 *   as "no changes".
 * - git-commits.ts's `readBranchCommits` reports an unresolvable base as "no commits".
 * - checks/openssf-scorecard.ts and checks/sbom.ts record the `rev-parse HEAD` commit as
 *   `"unknown"` when it fails.
 * @param args - Arguments to pass to the `git` executable.
 * @param cwd - Directory to run the command in. It is authoritative regardless of the calling
 * process's own ambient git context. `gitSpawnEnv()` (see git-env.ts) strips any inherited
 * `GIT_DIR`/`GIT_WORK_TREE`, which would otherwise override `cwd`-based repository resolution
 * entirely. This was confirmed directly. Git sets `GIT_DIR` when invoking a hook from a worktree
 * of a bare repository, which is exactly this repository's own pre-push setup.
 * @returns The command's stdout, or `undefined` if it exits non-zero (e.g. an unresolvable ref).
 */
export async function runGit(args: readonly string[], cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", args as string[], {
      cwd,
      env: gitSpawnEnv(),
      maxBuffer: 512 * 1024 * 1024,
    })
    return stdout
  } catch (error) {
    // Only an unresolvable ref / transient failure collapses to `undefined`
    // (see this function's doc comment). Two other cases are operational
    // failures: a diff whose output exceeds `maxBuffer`, and `git` itself
    // being unavailable. Neither may be silently reported as "no changes".
    // Doing so would let the adr-governance check pass vacuously on exactly
    // the large or unusual change it exists to gate.
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" || code === "ENOENT") {
      throw error
    }
    return undefined
  }
}

/**
 *
 * @param line - One tab-separated line from `git diff --name-status -M` output.
 * @returns The parsed change kind and path (plus prior path for a rename), or `undefined` if the line has no status/path.
 */
export function parseNameStatusLine(line: string):
  | {
      readonly changeKind: RawDiffFile["changeKind"]
      readonly path: string
      readonly renamedFrom?: string
    }
  | undefined {
  const [statusRaw, ...rest] = line.split("\t")
  if (!statusRaw) return undefined

  if (statusRaw.startsWith("R")) {
    const [oldPath, newPath] = rest
    if (!oldPath || !newPath) return undefined
    return { changeKind: "renamed", path: newPath, renamedFrom: oldPath }
  }

  const filePath = rest[0]
  if (!filePath) return undefined
  if (statusRaw === "A") return { changeKind: "added", path: filePath }
  if (statusRaw === "D") return { changeKind: "deleted", path: filePath }
  return { changeKind: "modified", path: filePath }
}

/**
 *
 * @param line - One tab-separated line from `git diff --numstat` output.
 * @returns The parsed added/removed line counts, with `-` (binary files) treated as `0`.
 */
export function parseNumstatCounts(line: string): {
  readonly linesAdded: number
  readonly linesRemoved: number
} {
  const [addedRaw, removedRaw] = line.split("\t")
  return { linesAdded: toCount(addedRaw), linesRemoved: toCount(removedRaw) }
}

/**
 * @param raw - one numstat count column: a base-10 integer, `-` for a binary file, or `undefined` for a malformed line.
 * @returns the parsed count, or `0` for `-`, an absent column, or anything that doesn't parse to a finite number.
 */
function toCount(raw: string | undefined): number {
  if (raw === "-" || raw === undefined) return 0
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

/**
 * Lists every file changed between `base` and `HEAD`. It returns an empty list when `base`
 * doesn't resolve, e.g. no `origin/main` fetched locally, or a repository's very first commit.
 * No prior state is a legitimate condition, not an error. It still throws for the operational
 * failures `runGit` rethrows, and when the two diff listings disagree in length.
 * @param root - Absolute path to the repository to diff.
 * @param base - Ref to diff against, e.g. `origin/main`.
 * @returns Every changed file's path, change kind, and line counts.
 */
export async function listChangedFiles(
  root: string,
  base: string,
): Promise<readonly RawDiffFile[]> {
  const range = `${base}...HEAD`
  // `-c core.quotePath=false` stops git octal-escaping non-ASCII bytes in
  // pathnames (its default), so a path like `src/café.ts` comes back as
  // itself rather than `"src/caf\303\251.ts"`. Paths containing a literal
  // tab, newline, or `"` are still quoted by git. They remain a known edge
  // case for source trees.
  const nameStatusOut = await runGit(
    ["-c", "core.quotePath=false", "diff", "--name-status", "-M", range],
    root,
  )
  const numstatOut = await runGit(
    ["-c", "core.quotePath=false", "diff", "--numstat", "-M", range],
    root,
  )
  if (nameStatusOut === undefined || numstatOut === undefined) return []

  const nameStatusLines = nameStatusOut.split("\n").filter((l) => l.length > 0)
  const numstatLines = numstatOut.split("\n").filter((l) => l.length > 0)

  // The two invocations render the same underlying tree diff. They must list the
  // same files in the same order (see the `RawDiffFile` doc comment). If their
  // line counts disagree, index-zipping below would silently pair the wrong
  // rows. Fail loudly instead of defaulting the unmatched files to zero line
  // counts.
  if (nameStatusLines.length !== numstatLines.length) {
    throw new Error(
      `git diff --name-status (${String(nameStatusLines.length)} lines) and --numstat ` +
        `(${String(numstatLines.length)} lines) disagree for range ${range} -- cannot align them by index.`,
    )
  }

  const files: RawDiffFile[] = []
  for (const [index, line] of nameStatusLines.entries()) {
    const parsed = parseNameStatusLine(line)
    if (!parsed) continue
    const numstatLine = numstatLines[index]
    const counts = numstatLine
      ? parseNumstatCounts(numstatLine)
      : { linesAdded: 0, linesRemoved: 0 }
    files.push({ ...parsed, ...counts })
  }

  return files
}

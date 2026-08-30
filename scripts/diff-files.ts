import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

/**
 * One file changed in the diff, before any description is attached -- the raw fact `table-manager.ts`
 * reconciles against the existing table. Line counts come from `git diff --numstat`; status/rename
 * detection from `git diff --name-status`, both run with `-M` (rename detection) against the same
 * `<base>...HEAD` range so their output lists are in the same order and can be zipped by index --
 * git computes one underlying tree diff for a given range/flags and renders it two ways, so the
 * per-file ordering is identical between the two invocations.
 */
interface RawDiffFile {
  readonly path: string
  readonly changeKind: "added" | "modified" | "deleted" | "renamed"
  readonly renamedFrom?: string
  readonly linesAdded: number
  readonly linesRemoved: number
}

/**
 * Deliberately does not distinguish *why* the command failed (an unresolvable ref, a transient
 * lock, git itself being unavailable) -- every failure collapses to the same `undefined`, once the
 * caller already knows `cwd` is a real git working tree (see `assertInsideGitWorkTree` in
 * baseline-store.ts, which callers are expected to check separately for call sites where that
 * distinction matters). Deliberately not narrowed by inspecting `stderr`/the exit code for a more
 * specific "ref genuinely doesn't exist" signal: git's exact wording and exit code for that case
 * are not a stable, version/locale-independent contract to string-match against, so doing so would
 * trade a rare, self-correcting "treated a transient failure as absent" case for a locale- or
 * git-version-dependent false rethrow on every caller's *legitimate* "doesn't exist" case. Shared
 * by two callers that both already want this: diff-files.ts's own `--name-status`/`--numstat`
 * reads (an unresolvable diff range is reported the same as "no changes" either way) and
 * baseline-store.ts's `readFileAtHead` (a transient failure reading `baseline.meta.json` is
 * indistinguishable from "no baseline committed yet" and treated identically -- accepted as a
 * narrow, rare edge case rather than a defect worth this function's generality for).
 * @param args - Arguments to pass to the `git` executable.
 * @param cwd - Directory to run the command in.
 * @returns The command's stdout, or `undefined` if it exits non-zero (e.g. an unresolvable ref).
 */
export async function runGit(args: readonly string[], cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", args as string[], {
      cwd,
      maxBuffer: 512 * 1024 * 1024,
    })
    return stdout
  } catch (error) {
    // Only an unresolvable ref / transient failure collapses to `undefined`
    // (see this function's doc comment). A diff whose output exceeds
    // `maxBuffer`, or `git` itself being unavailable, is an operational
    // failure that must NOT be silently reported as "no changes" -- doing so
    // would let the changeset-docs / adr-governance checks pass vacuously on
    // exactly the large or unusual change they exist to gate.
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
 * Lists every file changed between `base` and `HEAD`. Returns an empty list -- never throws --
 * when `base` doesn't resolve (no `origin/main` fetched locally, or this being a repository's very
 * first commit), mirroring baseline-store.ts's own "no prior state is a legitimate condition, not
 * an error" philosophy.
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
  // itself rather than `"src/caf\303\251.ts"`. (Paths containing a literal
  // tab, newline, or `"` are still quoted by git and remain a known edge
  // case for source trees.)
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

  // The two invocations render the same underlying tree diff and must list the
  // same files in the same order (see this module's doc comment). If their line
  // counts disagree, index-zipping below would silently pair the wrong rows --
  // fail loudly instead of defaulting the unmatched files to zero line counts.
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

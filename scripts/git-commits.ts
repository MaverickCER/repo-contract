/**
 * Reads the commit messages on the current branch (`base..HEAD`). Shared by the `api-contract`
 * gate (which infers the declared SemVer bump from them) and `adr-governance` (which scans them
 * for `ADR NNNN` references) now that versioning is Conventional-Commits-driven -- see
 * specs/decisions/0009-conventional-commits-versioning-and-local-gates.md.
 */

import { runGit } from "./diff-files.js"

/**
 * Every commit message on `base..HEAD`, plus any `extra` messages appended (e.g. a CI-supplied
 * PR title). Each element is a full, multi-line message (subject + body + footers), trimmed.
 * Returns `[]` -- never throws -- when `base` doesn't resolve (no `origin/main` fetched
 * locally, an unborn HEAD, ...), mirroring `listChangedFiles`'s "no prior state is a
 * legitimate condition" philosophy.
 * @param root - repository working-tree path.
 * @param base - the ref to exclude, e.g. `origin/main`.
 * @param extra - additional messages to append (undefined / blank entries are dropped).
 * @returns the branch's commit messages followed by the non-empty `extra` entries.
 */
export async function readBranchCommits(
  root: string,
  base: string,
  ...extra: readonly (string | undefined)[]
): Promise<string[]> {
  const out = await runGit(["log", "--format=%B%x00", `${base}..HEAD`], root)
  const fromLog =
    out === undefined
      ? []
      : out
          .split("\0")
          .map((message) => message.trim())
          .filter((message) => message.length > 0)

  const result = [...fromLog]
  for (const message of extra) {
    if (typeof message !== "string") continue
    const trimmed = message.trim()
    if (trimmed.length > 0) result.push(trimmed)
  }

  return result
}

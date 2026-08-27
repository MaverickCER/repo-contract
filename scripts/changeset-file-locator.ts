import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { CHANGESET_DIR } from "./contracts.js"

/**
 * Shared by every mechanism that maintains a machine-owned section inside a Changesets file
 * (`scripts/api-contract/changeset-manager.ts`, `scripts/changeset-docs/table-manager.ts`) -- both
 * must always agree on which single `.changeset/*.md` file is "the" file for this contribution, or
 * they risk maintaining two different files for the same PR. Extracted out of `changeset-manager.ts`
 * (see specs/decisions/0008-api-contract-compatibility-gate.md and
 * specs/decisions/0010-changeset-adr-and-pr-documentation-discipline.md) rather than duplicated, and the
 * marker-detection check is generalized to *any* `<!-- repo-contract:<owner>:start:` prefix -- not
 * just `api-contract`'s own -- so a file already carrying either mechanism's marker is correctly
 * recognized as machine-touched by both.
 */

/**
 * Generic on purpose: this file may end up holding either mechanism's section, or both -- most PRs
 * that only touch non-public files will only ever populate `changeset-docs`'s "Changed Files"
 * section here, never `api-contract`'s "API Contract Impact" one, so a name that implied the latter
 * would be misleading in the common case.
 */
const DEDICATED_FILENAME = "repo-contract.md"

const GENERIC_MARKER_PREFIX = /<!-- repo-contract:[a-z-]+:start:/

/**
 *
 * @param root - Absolute path to the repository containing the `.changeset/` directory.
 * @returns The `.md` filenames in `.changeset/` (excluding `README.md`), sorted; empty if the directory doesn't exist.
 */
async function listChangesetFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(path.join(root, CHANGESET_DIR))
    return entries.filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md").sort()
  } catch {
    return []
  }
}

/**
 * Locates the changeset file this run should maintain. Exactly one existing generated-section-
 * bearing file (carrying any `repo-contract`-owned marker, from any mechanism) -> that one.
 * Otherwise exactly one file without any such marker -> treated as "the human-authored changeset for
 * this contribution." Otherwise (zero files, or multiple ambiguous un-marked ones) -> a dedicated,
 * deterministic filename -- a documented safety fallback: no mechanism ever guesses which of several
 * ambiguous pre-existing human files to touch, since corrupting the wrong one is worse than
 * maintaining its own clearly-labeled file.
 * @param root - Absolute path to the repository containing the `.changeset/` directory.
 * @returns The filename (not a path) of the changeset file this run should read and write.
 */
export async function locateTargetFileName(root: string): Promise<string> {
  const files = await listChangesetFiles(root)
  const withMarker: string[] = []
  const withoutMarker: string[] = []

  for (const file of files) {
    const content = await readFile(path.join(root, CHANGESET_DIR, file), "utf8")
    if (GENERIC_MARKER_PREFIX.test(content)) withMarker.push(file)
    else withoutMarker.push(file)
  }

  if (withMarker.length === 1) {
    const [only] = withMarker
    if (only) return only
  }
  if (withMarker.length === 0 && withoutMarker.length === 1) {
    const [only] = withoutMarker
    if (only) return only
  }
  return DEDICATED_FILENAME
}

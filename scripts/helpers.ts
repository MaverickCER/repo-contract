import * as YAML from "yaml"

/**
 * One mechanism's marker set for `stripGeneratedSection` below -- see `scripts/contracts.ts`'s doc
 * comment for why `changeset-docs` and `api-contract` each need their own. Not exported: both
 * callers pass an inline object literal that satisfies this shape structurally, so nothing ever
 * needs to import the type by name (confirmed by Knip's dead-code check, which flagged the export
 * as unused).
 */
interface GeneratedSectionMarkers {
  readonly sectionHeading: string
  readonly markerStartPrefix: string
  readonly markerEnd: string
}

/**
 * Removes one mechanism's previously generated section (heading + markers + content) from a
 * changeset body, leaving only content owned by other mechanisms or a human. Shared by
 * `scripts/api-contract/changeset-manager.ts` and `scripts/changeset-docs/table-manager.ts`, each
 * passing its own `markers` (see `scripts/contracts.ts`) -- the algorithm is identical, only which
 * literal heading/prefix/end-marker to search for differs.
 * @param body - The full changeset body (frontmatter already stripped).
 * @param markers - The calling mechanism's own heading/marker-prefix/end-marker to search for.
 * @returns The body with this mechanism's own generated section removed, trimmed.
 */
export function stripGeneratedSection(body: string, markers: GeneratedSectionMarkers): string {
  const markerStartIdx = body.indexOf(markers.markerStartPrefix)
  if (markerStartIdx === -1) return body.trim()

  const headingIdx = body.lastIndexOf(markers.sectionHeading, markerStartIdx)
  const removeFrom = headingIdx === -1 ? markerStartIdx : headingIdx

  const endIdx = body.indexOf(markers.markerEnd, markerStartIdx)
  const afterEnd = endIdx === -1 ? "" : body.slice(endIdx + markers.markerEnd.length)

  return (body.slice(0, removeFrom) + afterEnd).trim()
}

/**
 *
 * @param packageName - The package name to key the frontmatter's release-level map by.
 * @param level - The raw release level to write, preserved verbatim (e.g. `"patch"`).
 * @param body - The changeset body to place after the frontmatter; trimmed and given a trailing newline.
 * @returns The complete changeset file content, frontmatter followed by the trimmed body.
 */
export function renderChangesetFile(packageName: string, level: string, body: string): string {
  return `---\n"${packageName}": ${level}\n---\n\n${body.trim()}\n`
}

/**
 * The one Changesets file-format primitive shared by every mechanism that maintains a section
 * inside a `.changeset/*.md` file (`scripts/api-contract/changeset-manager.ts`,
 * `scripts/changeset-docs/table-manager.ts`) -- splitting frontmatter from body, and rendering it
 * back, must stay byte-for-byte identical between them, since they both read and write the same
 * physical file. Returns the frontmatter level as a raw string, not narrowed to
 * `ChangesetReleaseLevel` -- that narrowing is an `api-contract`-specific concern (only it ever
 * chooses/validates a level); `table-manager.ts` only ever needs to preserve whatever's already
 * there, verbatim.
 */
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

/**
 *
 * @param content - The full changeset file content, frontmatter and body together.
 * @param packageName - The package name whose entry in the frontmatter map holds the release level.
 * @returns The frontmatter's raw level string for `packageName` (`undefined` if absent or unparsable), and the body text.
 */
export function splitFrontmatter(
  content: string,
  packageName: string,
): { readonly rawLevel: string | undefined; readonly body: string } {
  const match = FRONTMATTER_REGEX.exec(content)
  if (!match) return { rawLevel: undefined, body: content }

  const frontmatterText = match[1] ?? ""
  const body = match[2] ?? ""

  let rawLevel: string | undefined
  try {
    const parsed = YAML.parse(frontmatterText) as Record<string, unknown> | null
    const value = parsed?.[packageName]
    if (typeof value === "string") rawLevel = value
  } catch {
    rawLevel = undefined
  }

  return { rawLevel, body }
}

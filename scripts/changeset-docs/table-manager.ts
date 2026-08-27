import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { locateTargetFileName } from "../changeset-file-locator.js"
import {
  CHANGESET_DIR,
  CHANGESET_DOCS_MARKER_CREATED_REGEX,
  CHANGESET_DOCS_MARKER_END,
  CHANGESET_DOCS_MARKER_START_PREFIX,
  CHANGESET_DOCS_SECTION_HEADING,
  MARKER_TOKEN_END,
  PLACEHOLDER,
  ROW_REGEX,
} from "../contracts.js"
import type { RawDiffFile } from "../diff-files.js"
import { renderChangesetFile, splitFrontmatter, stripGeneratedSection } from "../helpers.js"

const MARKERS = {
  sectionHeading: CHANGESET_DOCS_SECTION_HEADING,
  markerStartPrefix: CHANGESET_DOCS_MARKER_START_PREFIX,
  markerEnd: CHANGESET_DOCS_MARKER_END,
}
import type { DocTableRow } from "./evidence-types.js"

/**
 *
 * @param file - The diffed file whose status is being rendered.
 * @returns The row's status text, e.g. `` renamed from `old/path` ``.
 */
function statusText(file: RawDiffFile): string {
  switch (file.changeKind) {
    case "added":
      return "added"
    case "deleted":
      return "deleted"
    case "renamed":
      return `renamed from \`${file.renamedFrom}\``
    case "modified":
      return "modified"
  }
}

/**
 *
 * @param file - The diffed file the row documents.
 * @param description - The row's preserved human/AI description, or `undefined` if not yet described.
 * @returns The rendered `- **path** (status, +N/-M): description` Markdown line.
 */
export function renderRow(file: RawDiffFile, description: string | undefined): string {
  const stats = `+${String(file.linesAdded)}/-${String(file.linesRemoved)}`
  return `- **${file.path}** (${statusText(file)}, ${stats}): ${description ?? PLACEHOLDER}`
}

/**
 * Extracts `path -> description` for every real (non-placeholder) row in a prior generated section.
 * @param sectionBody - The previously generated section's raw text.
 * @returns A map from file path to its preserved description.
 */
export function parseExistingDescriptions(sectionBody: string): Map<string, string> {
  const descriptions = new Map<string, string>()
  for (const line of sectionBody.split("\n")) {
    const match = ROW_REGEX.exec(line)
    if (!match) continue
    const [, filePath, description] = match
    if (!filePath || !description || description === PLACEHOLDER) continue
    descriptions.set(filePath, description)
  }
  return descriptions
}

/**
 * Whether a prior run of *this module* chose the file's frontmatter level itself (see module doc comment). `undefined` when no prior changeset-docs marker exists at all.
 * @param sectionBody - The changeset body to search for this module's marker.
 * @returns `true`/`false` per the marker's `created-frontmatter` flag, or `undefined` if no marker is present.
 */
function parseCreatedFrontmatter(sectionBody: string): boolean | undefined {
  const match = CHANGESET_DOCS_MARKER_CREATED_REGEX.exec(sectionBody)
  const raw = match?.[1]
  return raw === undefined ? undefined : raw === "true"
}

/**
 *
 * @param rows - The resolved file/description pairs to render, in the order they should appear.
 * @param hash - Provenance hash embedded in the start marker (see `hashOf`).
 * @param createdFrontmatter - Whether this module is the one that chose the file's frontmatter level.
 * @returns The complete generated section, including its heading and start/end markers.
 */
function buildGeneratedSection(
  rows: readonly { readonly file: RawDiffFile; readonly description: string | undefined }[],
  hash: string,
  createdFrontmatter: boolean,
): string {
  const lines = [
    CHANGESET_DOCS_SECTION_HEADING,
    "",
    `${CHANGESET_DOCS_MARKER_START_PREFIX}${hash} created-frontmatter=${String(createdFrontmatter)} ${MARKER_TOKEN_END}`,
    "",
    ...rows.map(({ file, description }) => renderRow(file, description)),
    "",
    CHANGESET_DOCS_MARKER_END,
  ]
  return lines.join("\n")
}

/**
 *
 * @param files - The diffed files to fingerprint.
 * @returns A short hex-encoded hash derived from the files' paths, kinds, and line counts.
 */
function hashOf(files: readonly RawDiffFile[]): string {
  // Provenance/staleness visibility only (matches changeset-manager.ts's own hash convention) --
  // never part of the idempotency decision, which is always byte-for-byte final-content comparison.
  return files
    .map(
      (f) =>
        `${f.path}:${f.changeKind}:${f.renamedFrom ?? ""}:${String(f.linesAdded)}:${String(f.linesRemoved)}`,
    )
    .sort()
    .join("|")
    .length.toString(16)
}

interface ApplyChangesetDocsInput {
  readonly root: string
  readonly packageName: string
  readonly files: readonly RawDiffFile[]
}

/**
 *
 * @param input - The repository root, package name, and the diff's changed files.
 * @returns The reconciled table rows and the changeset file's path relative to the root, or `undefined` for both when there was nothing to document.
 */
export async function applyChangesetDocs(
  input: ApplyChangesetDocsInput,
): Promise<{ readonly rows: readonly DocTableRow[]; readonly changesetPath: string | undefined }> {
  const fileName = await locateTargetFileName(input.root)
  const targetPath = path.join(input.root, CHANGESET_DIR, fileName)
  const relativePath = path.join(CHANGESET_DIR, fileName)
  const existingContent = await readFile(targetPath, "utf8").catch(() => undefined)

  if (input.files.length === 0) {
    // Nothing to document. Clean up our own stale section if we'd previously written one into an
    // already-existing file; never touch a file we didn't create solely for this, and never delete
    // a file another mechanism (or a human) owns for its own reason.
    if (!existingContent?.includes(CHANGESET_DOCS_MARKER_START_PREFIX)) {
      return { rows: [], changesetPath: undefined }
    }
    const { rawLevel, body } = splitFrontmatter(existingContent, input.packageName)
    const createdFrontmatter = parseCreatedFrontmatter(body) ?? false
    const humanBody = stripGeneratedSection(body, MARKERS)

    if (humanBody.length === 0 && createdFrontmatter) {
      await rm(targetPath, { force: true })
      return { rows: [], changesetPath: undefined }
    }

    const newContent = renderChangesetFile(input.packageName, rawLevel ?? "patch", humanBody)
    if (newContent !== existingContent) {
      await writeFile(targetPath, newContent, "utf8")
    }
    return { rows: [], changesetPath: relativePath }
  }

  const { rawLevel, body: existingBody } = existingContent
    ? splitFrontmatter(existingContent, input.packageName)
    : { rawLevel: undefined, body: "" }
  const existingDescriptions = existingContent
    ? parseExistingDescriptions(existingBody)
    : new Map<string, string>()
  const humanBody = existingContent ? stripGeneratedSection(existingBody, MARKERS) : ""

  // This run creates the file's frontmatter iff no frontmatter existed before; otherwise carry
  // forward whatever a prior changeset-docs run (if any) already determined -- table-manager never
  // makes a *new* ownership decision on an update, only on a genuine from-nothing creation.
  const createdFrontmatter =
    existingContent === undefined ? true : (parseCreatedFrontmatter(existingBody) ?? false)

  const sortedFiles = [...input.files].sort((a, b) => a.path.localeCompare(b.path))
  const resolved = sortedFiles.map((file) => {
    const description =
      existingDescriptions.get(file.path) ??
      (file.renamedFrom ? existingDescriptions.get(file.renamedFrom) : undefined)
    return { file, description }
  })

  const generatedSection = buildGeneratedSection(resolved, hashOf(input.files), createdFrontmatter)
  const newBody = [humanBody, generatedSection].filter((s) => s.length > 0).join("\n\n")
  const newContent = renderChangesetFile(input.packageName, rawLevel ?? "patch", newBody)

  if (existingContent !== newContent) {
    if (existingContent === undefined) {
      await mkdir(path.join(input.root, CHANGESET_DIR), { recursive: true })
    }
    await writeFile(targetPath, newContent, "utf8")
  }

  const rows: DocTableRow[] = resolved.map(({ file, description }) => ({
    path: file.path,
    changeKind: file.changeKind,
    renamedFrom: file.renamedFrom,
    linesAdded: file.linesAdded,
    linesRemoved: file.linesRemoved,
    description,
  }))

  return { rows, changesetPath: relativePath }
}

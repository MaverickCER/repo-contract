import { execFile } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { runGit } from "../diff-files.js"

const execFileAsync = promisify(execFile)

/**
 * The only file that touches `.repo-contract/api-contract/` on disk. The committed baseline is
 * authoritative: `readBaseline` reads it from git `HEAD` via `git show`, never the working tree,
 * so an uncommitted local edit (accidental or deliberate) never affects the historical comparison.
 * `writeBaselineFiles` is the single implementation that ever writes a baseline -- shared by
 * check.ts's initial-baseline bootstrap (the only situation the check itself may write one) and
 * the separate, human-invoked update-baseline.ts.
 */

interface BaselineMeta {
  readonly packageName: string
  /** Provenance metadata about this snapshot -- the package version it was captured at -- not a property of the TypeScript contract itself. */
  readonly packageVersion: string
  readonly apiExtractorVersion: string
  readonly apiJsonSchemaVersion: number
  /** Identity of the historical public contract itself. */
  readonly apiJsonHash: string
  /** Integrity of the compiler artifact used to analyze it -- baseline.d.ts is a derived supporting artifact, never independently authoritative. */
  readonly dtsHash: string
  /** Metadata only -- never part of a hash or the semantic comparison. */
  readonly generatedAt: string
}

interface Baseline {
  readonly apiJsonText: string
  readonly dtsText: string
  readonly meta: BaselineMeta
}

const BASELINE_DIR = ".repo-contract/api-contract"
const BASELINE_API_JSON = `${BASELINE_DIR}/baseline.api.json`
const BASELINE_DTS = `${BASELINE_DIR}/baseline.d.ts`
const BASELINE_META = `${BASELINE_DIR}/baseline.meta.json`

/**
 * @param content - The text to hash.
 * @returns The hex-encoded sha256 digest of `content`.
 */
export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}

/**
 * Throws the same "corrupted baseline" error this module already throws for a hash mismatch if
 * `value` doesn't have every `BaselineMeta` field with the right primitive type. Only structural
 * typing is checked (no semantic validation of e.g. `packageVersion`'s format) -- `parseVersion`
 * downstream already returns `undefined` for a malformed-but-well-typed version string; this
 * guard exists so a field that is missing or the wrong JS type entirely (the case a bare `as
 * BaselineMeta` cast doesn't catch) fails here with a clear message instead of crashing deep
 * inside whatever consumer first dereferences it.
 * @param value - The parsed `baseline.meta.json` content to validate.
 * @throws {Error} If `value` is not an object, or any `BaselineMeta` field is missing or has the wrong type.
 */
function assertValidBaselineMeta(value: unknown): asserts value is BaselineMeta {
  if (typeof value !== "object" || value === null) {
    throw new Error(
      "baseline.meta.json is corrupted or was manually edited (not a JSON object). Regenerate it with `npm run contract:baseline`.",
    )
  }
  const meta = value as Record<string, unknown>
  const stringFields = [
    "packageName",
    "packageVersion",
    "apiExtractorVersion",
    "apiJsonHash",
    "dtsHash",
    "generatedAt",
  ] as const
  for (const field of stringFields) {
    if (typeof meta[field] !== "string") {
      throw new Error(
        `baseline.meta.json is corrupted or was manually edited ("${field}" must be a string). Regenerate it with \`npm run contract:baseline\`.`,
      )
    }
  }
  if (typeof meta.apiJsonSchemaVersion !== "number") {
    throw new Error(
      'baseline.meta.json is corrupted or was manually edited ("apiJsonSchemaVersion" must be a number). Regenerate it with `npm run contract:baseline`.',
    )
  }
}

/**
 * @param apiJsonText - The raw API Extractor JSON text to read.
 * @returns The API JSON's `metadata.schemaVersion`, or `0` if absent.
 */
export function readSchemaVersion(apiJsonText: string): number {
  let parsed: { metadata?: { schemaVersion?: number } }
  try {
    parsed = JSON.parse(apiJsonText) as { metadata?: { schemaVersion?: number } }
  } catch {
    throw new Error(
      "The API Extractor JSON report is not valid JSON (a truncated or interrupted write?). Regenerate it with `npm run build && npm run api-contract`.",
    )
  }
  return parsed.metadata?.schemaVersion ?? 0
}

/**
 * Reads and parses `<root>/package.json` for the `name`/`version` fields this feature needs --
 * shared by `check.ts` and `update-baseline.ts`, which both previously duplicated this read.
 * @param root - Absolute path to the package's project folder.
 * @returns The package's `name` and `version`.
 */
export async function readPackageJson(root: string): Promise<{ name: string; version: string }> {
  const raw = await readFile(path.join(root, "package.json"), "utf8")
  try {
    return JSON.parse(raw) as { name: string; version: string }
  } catch {
    throw new Error(
      `${path.join(root, "package.json")} is not valid JSON -- fix it before running the api-contract check.`,
    )
  }
}

/**
 * Throws if `root` is not inside a git working tree at all -- the one case that must fail loudly rather than silently proceeding as "no baseline yet".
 * @param root - Path to the working tree to check.
 */
async function assertInsideGitWorkTree(root: string): Promise<void> {
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root })
  } catch (error) {
    throw new Error(
      `"${root}" is not inside a git working tree -- the committed baseline can only be read from git, ` +
        "and this check refuses to fall back to an untrusted working-tree copy.",
      { cause: error },
    )
  }
}

/**
 * Reads one file from git `HEAD`. Returns `undefined` for any reason the read couldn't complete
 * once we already know this is a real git repository -- an unborn `HEAD` (no commits yet, e.g. a
 * brand-new repository) and a `HEAD` that exists but doesn't contain this path both mean the same
 * thing here: no baseline is committed yet.
 * @param root - Path to the git working tree.
 * @param relativePath - Path of the file to read, relative to `root`.
 * @returns The file's content at `HEAD`, or `undefined` if it couldn't be read.
 */
async function readFileAtHead(root: string, relativePath: string): Promise<string | undefined> {
  return runGit(["show", `HEAD:${relativePath}`], root)
}

/**
 * Reads the committed baseline from git `HEAD` and verifies its integrity. Returns `undefined`
 * only when no baseline is committed yet (the initial-baseline case) -- any other failure (not a
 * git repository, a hash mismatch between `baseline.meta.json` and its content files) throws
 * explicitly rather than silently falling back to an untrusted state.
 * @param root - Path to the git working tree containing the committed baseline.
 * @returns The committed baseline's contents and metadata, or `undefined` if none is committed yet.
 */
export async function readBaseline(root: string): Promise<Baseline | undefined> {
  await assertInsideGitWorkTree(root)

  const metaText = await readFileAtHead(root, BASELINE_META)
  if (metaText === undefined) return undefined

  const meta: unknown = JSON.parse(metaText)
  assertValidBaselineMeta(meta)
  const apiJsonText = await readFileAtHead(root, BASELINE_API_JSON)
  const dtsText = await readFileAtHead(root, BASELINE_DTS)
  if (apiJsonText === undefined || dtsText === undefined) {
    throw new Error(
      "baseline.meta.json exists at HEAD but baseline.api.json/baseline.d.ts do not -- the committed baseline is incomplete.",
    )
  }

  if (sha256(apiJsonText) !== meta.apiJsonHash) {
    throw new Error(
      "baseline.api.json's content does not match the hash recorded in baseline.meta.json -- the committed baseline is corrupted or was manually edited. Regenerate it with `npm run contract:baseline`.",
    )
  }
  if (sha256(dtsText) !== meta.dtsHash) {
    throw new Error(
      "baseline.d.ts's content does not match the hash recorded in baseline.meta.json -- the committed baseline is corrupted or was manually edited. Regenerate it with `npm run contract:baseline`.",
    )
  }

  return { apiJsonText, dtsText, meta }
}

interface WriteBaselineInput {
  readonly apiJsonText: string
  readonly dtsText: string
  readonly packageName: string
  readonly packageVersion: string
  readonly apiExtractorVersion: string
  readonly apiJsonSchemaVersion: number
}

/**
 * Writes `content` to `filePath` such that the final filename never observably holds partial
 * content: written to a sibling temp file first (same directory, so the following `rename` is
 * guaranteed to be same-filesystem and therefore atomic, per POSIX `rename(2)`/Windows
 * `MoveFileEx` semantics), then renamed into place. An interruption (crash, kill) at any point
 * before the rename leaves only the untouched previous content (or nothing, on first write) under
 * `filePath`, plus an orphaned temp file -- never a truncated or half-written `filePath`.
 * @param filePath - Absolute path of the file to write.
 * @param content - The full content to write.
 */
async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.tmp-${randomUUID()}`
  await writeFile(tempPath, content, "utf8")
  await rename(tempPath, filePath)
}

/**
 * Writes `.repo-contract/api-contract/baseline.*` into the working tree. Never called by the check itself except to bootstrap the very first baseline; every other call is from the explicitly human-invoked update-baseline.ts.
 *
 * Each of the three files is written atomically (see `writeFileAtomic`), but the three writes are
 * not atomic *as a group* -- an interruption between them can still leave `baseline.meta.json`
 * (written last) referencing hashes for content that was never actually written, or vice versa.
 * This remains safe because `readBaseline` only ever reads from git `HEAD`, never the working
 * tree: an interrupted bootstrap here just leaves an uncommitted, inconsistent working-tree state
 * that a human reviewing `git diff` before committing (or a re-run of this same bootstrap) would
 * catch, never a state that itself becomes the trusted baseline.
 * @param root - Path to the working tree to write the baseline files into.
 * @param input - The API JSON/d.ts text and provenance metadata to write and hash.
 */
export async function writeBaselineFiles(root: string, input: WriteBaselineInput): Promise<void> {
  const meta: BaselineMeta = {
    packageName: input.packageName,
    packageVersion: input.packageVersion,
    apiExtractorVersion: input.apiExtractorVersion,
    apiJsonSchemaVersion: input.apiJsonSchemaVersion,
    apiJsonHash: sha256(input.apiJsonText),
    dtsHash: sha256(input.dtsText),
    generatedAt: new Date().toISOString(),
  }

  await mkdir(path.join(root, BASELINE_DIR), { recursive: true })
  await writeFileAtomic(path.join(root, BASELINE_API_JSON), input.apiJsonText)
  await writeFileAtomic(path.join(root, BASELINE_DTS), input.dtsText)
  await writeFileAtomic(path.join(root, BASELINE_META), `${JSON.stringify(meta, null, 2)}\n`)
}

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { runCycloneDxNpm } from "./spawn.js"
import type { SbomEvidence, SbomSummary } from "./types.js"
import { validateSbomDocument } from "./validate.js"

/**
 * Orchestrates one full SBOM-generation pass: ensures `docs/` exists, runs `cyclonedx-npm`
 * (writing `docs/sbom.cdx.json` directly -- see spawn.ts's own doc comment), reads that file back,
 * and validates its shape (validate.ts). Everything happens here, in `run` -- the ordinary pattern
 * every other self-hosting check in this repository already uses (see e.g. the former
 * `scripts/iso-12207-alignment/run.ts`'s own identical note, and `scripts/dead-code/check.ts`).
 * Unlike `checks/openssf-scorecard.ts`, this check reads no other check's evidence via
 * `dependencies`, so it has none of that check's own documented reasons to defer writing into
 * `policy` instead (see that file's own module doc comment for the one deliberate exception this
 * repository carries, and why it does not generalize here).
 * @param root - Repository root to generate the SBOM for.
 * @returns The check's own evidence: either a validated summary, or a rejection reason.
 */
export async function generateSbom(root: string): Promise<SbomEvidence> {
  await mkdir(path.join(root, "docs"), { recursive: true })
  const rootHasRepository = await declaresRepository(root)

  // Two documents, because they answer different questions. The full tree is the BUILD inventory (what
  // this repository's own tooling depends on); the production tree is the RUNTIME inventory (what a user
  // installs). Importing only the first into a security tool overstates a zero-dependency package's
  // footprint a thousandfold.
  const full = await generateOne(root, BUILD_SBOM_PATH, false, rootHasRepository)
  if (!full.ok) return full
  const production = await generateOne(root, PRODUCTION_SBOM_PATH, true, rootHasRepository)
  if (!production.ok) return production

  return {
    ok: true,
    outputPath: BUILD_SBOM_PATH,
    productionOutputPath: PRODUCTION_SBOM_PATH,
    productionComponentCount: production.value.componentCount,
    ...full.value,
  }
}

/**
 * Whether the package's own package.json declares a `repository`, so its SBOM root must carry one.
 * An unreadable or malformed package.json counts as no: cyclonedx-npm reports that itself.
 * @param root - Repository root.
 * @returns `true` if package.json has a `repository` field.
 */
async function declaresRepository(root: string): Promise<boolean> {
  const manifest: unknown = await readFile(path.join(root, "package.json"), "utf8")
    .then((text) => JSON.parse(text) as unknown)
    .catch(() => undefined)
  return typeof manifest === "object" && manifest !== null && "repository" in manifest
}

const BUILD_SBOM_PATH = "docs/sbom.cdx.json"
const PRODUCTION_SBOM_PATH = "docs/sbom.production.cdx.json"

/**
 * Generates, reads back and validates one SBOM document.
 * @param root - Repository root.
 * @param outputFile - Repo-relative path to write.
 * @param production - Whether to leave development dependencies out.
 * @param rootHasRepository - Whether package.json declares a `repository` (see validate.ts).
 * @returns the validated summary, or a rejection reason.
 */
async function generateOne(
  root: string,
  outputFile: string,
  production: boolean,
  rootHasRepository: boolean,
): Promise<
  | { readonly ok: true; readonly value: SbomSummary }
  | { readonly ok: false; readonly reason: string }
> {
  const spawned = runCycloneDxNpm(root, { outputFile, production })
  if (!spawned.ok) {
    return { ok: false, reason: spawned.message }
  }

  let raw: string
  try {
    raw = await readFile(path.join(root, outputFile), "utf8")
  } catch (error) {
    return {
      ok: false,
      reason: `cyclonedx-npm exited successfully but ${outputFile} could not be read back: ${(error as Error).message}`,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: `${outputFile} is not valid JSON.` }
  }

  const withoutRunnerNpm = withoutNpmTool(parsed)
  if (withoutRunnerNpm !== parsed) {
    // cyclonedx-npm writes JSON.stringify(document, null, 2) with no trailing newline, so this
    // rewrite changes nothing but the removed entry.
    await writeFile(path.join(root, outputFile), JSON.stringify(withoutRunnerNpm, null, 2))
    parsed = withoutRunnerNpm
  }

  const validated = validateSbomDocument(parsed, { rootHasRepository })
  if (!validated.ok) {
    return { ok: false, reason: validated.reason.replaceAll("docs/sbom.cdx.json", outputFile) }
  }
  return { ok: true, value: validated.value }
}

/**
 * The document without the `npm` entry in `metadata.tools`. cyclonedx-npm records the npm that ran
 * it there, and that is whatever npm the machine happens to have: a CI runner image that moves from
 * 11.19.0 to 11.19.1 (and back) rewrites the committed SBOM and fails the clean-tree gate although
 * nothing about the dependency graph changed. The cyclonedx-npm and cyclonedx-library entries, which
 * are pinned by the lockfile, stay.
 * @param document - the parsed SBOM.
 * @returns the same object when it has no such entry, otherwise a copy without it.
 */
function withoutNpmTool(document: unknown): unknown {
  if (typeof document !== "object" || document === null) return document
  const metadata = (document as { metadata?: unknown }).metadata
  if (typeof metadata !== "object" || metadata === null) return document
  const tools = (metadata as { tools?: unknown }).tools
  if (typeof tools !== "object" || tools === null) return document
  const components = (tools as { components?: unknown }).components
  if (!Array.isArray(components)) return document
  const kept = components.filter(
    (component: unknown) =>
      !(
        typeof component === "object" &&
        component !== null &&
        (component as { name?: unknown }).name === "npm" &&
        (component as { group?: unknown }).group === undefined
      ),
  )
  if (kept.length === components.length) return document
  return {
    ...document,
    metadata: { ...metadata, tools: { ...tools, components: kept } },
  }
}

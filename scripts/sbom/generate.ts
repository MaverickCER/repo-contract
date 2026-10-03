import { mkdir, readFile } from "node:fs/promises"
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

  // Two documents, because they answer different questions. The full tree is the BUILD inventory (what
  // this repository's own tooling depends on); the production tree is the RUNTIME inventory (what a user
  // installs). Importing only the first into a security tool overstates a zero-dependency package's
  // footprint a thousandfold.
  const full = await generateOne(root, BUILD_SBOM_PATH, false)
  if (!full.ok) return full
  const production = await generateOne(root, PRODUCTION_SBOM_PATH, true)
  if (!production.ok) return production

  return {
    ok: true,
    outputPath: BUILD_SBOM_PATH,
    productionOutputPath: PRODUCTION_SBOM_PATH,
    productionComponentCount: production.value.componentCount,
    ...full.value,
  }
}

const BUILD_SBOM_PATH = "docs/sbom.cdx.json"
const PRODUCTION_SBOM_PATH = "docs/sbom.production.cdx.json"

/**
 * Generates, reads back and validates one SBOM document.
 * @param root - Repository root.
 * @param outputFile - Repo-relative path to write.
 * @param production - Whether to leave development dependencies out.
 * @returns the validated summary, or a rejection reason.
 */
async function generateOne(
  root: string,
  outputFile: string,
  production: boolean,
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

  const validated = validateSbomDocument(parsed)
  if (!validated.ok) {
    return { ok: false, reason: validated.reason.replaceAll("docs/sbom.cdx.json", outputFile) }
  }
  return { ok: true, value: validated.value }
}

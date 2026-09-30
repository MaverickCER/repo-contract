import { mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { runCycloneDxNpm } from "./spawn.js"
import type { SbomEvidence } from "./types.js"
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

  const spawned = runCycloneDxNpm(root)
  if (!spawned.ok) {
    return { ok: false, reason: spawned.message }
  }

  const outputPath = path.join(root, "docs/sbom.cdx.json")
  let raw: string
  try {
    raw = await readFile(outputPath, "utf8")
  } catch (error) {
    return {
      ok: false,
      reason: `cyclonedx-npm exited successfully but docs/sbom.cdx.json could not be read back: ${(error as Error).message}`,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: "docs/sbom.cdx.json is not valid JSON." }
  }

  const validated = validateSbomDocument(parsed)
  if (!validated.ok) {
    return { ok: false, reason: validated.reason }
  }

  return { ok: true, outputPath: "docs/sbom.cdx.json", ...validated.value }
}

import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { locateTargetFileName } from "../changeset-file-locator.js"
import {
  API_CONTRACT_MARKER_END,
  API_CONTRACT_MARKER_LEVEL_REGEX,
  API_CONTRACT_MARKER_START_PREFIX,
  API_CONTRACT_SECTION_HEADING,
  CHANGESET_DIR,
  MARKER_TOKEN_END,
} from "../contracts.js"
import { renderChangesetFile, splitFrontmatter, stripGeneratedSection } from "../helpers.js"
import type {
  ApiContractChange,
  ChangesetEvidence,
  ChangesetReleaseLevel,
  ContractImpact,
  RequiredReleaseLevel,
} from "./evidence-types.js"
import { summarizeLowerTierChanges } from "./summarize-changes.js"

const MARKERS = {
  sectionHeading: API_CONTRACT_SECTION_HEADING,
  markerStartPrefix: API_CONTRACT_MARKER_START_PREFIX,
  markerEnd: API_CONTRACT_MARKER_END,
}

/**
 * @param content - The changeset file's full raw text.
 * @param packageName - The package whose frontmatter entry should be read.
 * @returns The frontmatter's declared release level, the machine's last-embedded level from the marker line, and the frontmatter-stripped body.
 */
function parseChangeset(
  content: string,
  packageName: string,
): {
  readonly level: ChangesetReleaseLevel | undefined
  readonly machineLevel: ChangesetReleaseLevel | undefined
  readonly body: string
} {
  const { rawLevel, body } = splitFrontmatter(content, packageName)
  const level =
    rawLevel === "patch" || rawLevel === "minor" || rawLevel === "major" ? rawLevel : undefined

  const markerMatch = API_CONTRACT_MARKER_LEVEL_REGEX.exec(body)
  const rawMachineLevel = markerMatch?.[1]
  const machineLevel =
    rawMachineLevel === "patch" || rawMachineLevel === "minor" || rawMachineLevel === "major"
      ? rawMachineLevel
      : undefined

  return { level, machineLevel, body }
}

/**
 * @param input - The section's content.
 * @param input.summary - The deterministic, generated summary of the public-contract diff.
 * @param input.requiredLevel - The minimum SemVer level the diff requires, if any.
 * @param input.apiJsonHash - Hash of the current API JSON, embedded in the marker line for staleness detection.
 * @param input.machineLevel - The machine's own last-computed level, embedded in the marker line separately from frontmatter -- see the module doc comment.
 * @param input.lowerTierSummary - Informational summary of non-public-tier changes, if any -- never implies a release level of its own.
 * @returns The complete generated section (heading, marker line, summary, and optional required-level/lower-tier text) as a single string.
 */
function buildGeneratedSection(input: {
  readonly summary: string
  readonly requiredLevel: RequiredReleaseLevel | undefined
  readonly apiJsonHash: string
  /** Embedded in the marker line itself, separate from frontmatter -- see the module doc comment. */
  readonly machineLevel: ChangesetReleaseLevel | undefined
  /** Non-public-tier changes, informational only -- never implies a release level of its own. */
  readonly lowerTierSummary?: string
}): string {
  const lines = [
    API_CONTRACT_SECTION_HEADING,
    "",
    `${API_CONTRACT_MARKER_START_PREFIX}${input.apiJsonHash} level=${input.machineLevel ?? "none"} ${MARKER_TOKEN_END}`,
    "",
    input.summary,
  ]
  if (input.requiredLevel && input.requiredLevel !== "none") {
    lines.push("", `The minimum required release level is **${input.requiredLevel}**.`)
  }
  if (input.lowerTierSummary) {
    lines.push("", input.lowerTierSummary)
  }
  lines.push("", API_CONTRACT_MARKER_END)
  return lines.join("\n")
}

const LEVEL_RANK: Record<ChangesetReleaseLevel, number> = { patch: 1, minor: 2, major: 3 }

/**
 * @param a - One release level to compare, or `undefined` if absent.
 * @param b - The other release level to compare, or `undefined` if absent.
 * @returns Whichever of `a`/`b` ranks higher (major > minor > patch), or whichever is defined if only one is.
 */
export function maxLevel(
  a: ChangesetReleaseLevel | undefined,
  b: ChangesetReleaseLevel | undefined,
): ChangesetReleaseLevel | undefined {
  if (!a) return b
  if (!b) return a
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b
}

/**
 * Recovers the *human-declared* portion of a changeset's frontmatter level, distinguishing a genuine
 * human declaration from the machine's own prior, possibly-stale conclusion. `declaredLevel`
 * exceeding what the machine itself last definitively claimed (`previousMachineLevel`, ranked with
 * "no prior claim" as rank 0 -- lower than any real level) is the only signal available that a human
 * actually wrote/raised it; anything at or below that rank is conservatively treated as machine-owned
 * and therefore safe to replace or lower. Known tradeoff: a human declaration that happens to exactly
 * coincide with the machine's simultaneous requirement is indistinguishable from the machine's own
 * claim and may be lowered on a later run -- see ADR 0008.
 * @param declaredLevel - The release level currently declared in the changeset's frontmatter, if any.
 * @param previousMachineLevel - The level the machine itself last embedded in the marker line, if any.
 * @returns `declaredLevel` if it strictly exceeds `previousMachineLevel`'s rank (a genuine human override), otherwise `undefined`.
 */
export function recoverHumanLevel(
  declaredLevel: ChangesetReleaseLevel | undefined,
  previousMachineLevel: ChangesetReleaseLevel | undefined,
): ChangesetReleaseLevel | undefined {
  if (declaredLevel === undefined) return undefined
  const machineRank = previousMachineLevel ? LEVEL_RANK[previousMachineLevel] : 0
  return LEVEL_RANK[declaredLevel] > machineRank ? declaredLevel : undefined
}

/**
 * @param level - A required release level, which may include "none".
 * @returns `level` narrowed to a `ChangesetReleaseLevel`, or `undefined` if it's "none" or absent.
 */
function asChangesetLevel(
  level: RequiredReleaseLevel | undefined,
): ChangesetReleaseLevel | undefined {
  return level === "patch" || level === "minor" || level === "major" ? level : undefined
}

interface ApplyChangesetInput {
  readonly root: string
  readonly packageName: string
  readonly impact: ContractImpact
  readonly requiredLevel: RequiredReleaseLevel | undefined
  readonly diff: readonly ApiContractChange[]
  /** Non-public-tier changes (see evidence-types.ts) -- informational only, never affects level derivation. */
  readonly lowerTierDiff: readonly ApiContractChange[]
  readonly summary: string
  readonly apiJsonHash: string
}

/**
 * @param input - The current run's contract impact, required level, diff, and summary, plus where to write the changeset.
 * @returns What the check did (or didn't do) to the target changeset file this run, and the resulting release levels.
 */
export async function applyChangeset(input: ApplyChangesetInput): Promise<ChangesetEvidence> {
  const fileName = await locateTargetFileName(input.root)
  const targetPath = path.join(input.root, CHANGESET_DIR, fileName)
  const relativePath = path.join(CHANGESET_DIR, fileName)
  const existingContent = await readFile(targetPath, "utf8").catch(() => undefined)
  const lowerTierSummary = summarizeLowerTierChanges(input.lowerTierDiff)

  if (input.impact === "unchanged") {
    // No file, or a file the machine never touched (a plain human changeset unrelated to this
    // check) -- leave it completely alone, regardless of any informational content available.
    if (!existingContent?.includes(API_CONTRACT_MARKER_START_PREFIX)) {
      return { action: "none", generatedSectionUpdated: false }
    }

    const {
      level: existingLevel,
      machineLevel: existingMachineLevel,
      body: existingBody,
    } = parseChangeset(existingContent, input.packageName)
    const humanBody = stripGeneratedSection(existingBody, MARKERS)
    const humanLevel = recoverHumanLevel(existingLevel, existingMachineLevel)

    if (lowerTierSummary === undefined) {
      // Nothing public to report and nothing informational either -- clean up the machine's own
      // prior, now-stale conclusion entirely.
      if (humanBody.length === 0 && humanLevel === undefined) {
        await rm(targetPath, { force: true })
        return { action: "removed", path: relativePath, generatedSectionUpdated: true }
      }

      const newContent = renderChangesetFile(input.packageName, humanLevel ?? "patch", humanBody)
      if (newContent === existingContent) {
        return {
          action: "unchanged",
          path: relativePath,
          humanReleaseLevel: humanLevel,
          generatedSectionUpdated: false,
        }
      }
      await writeFile(targetPath, newContent, "utf8")
      return {
        action: "updated",
        path: relativePath,
        humanReleaseLevel: humanLevel,
        generatedSectionUpdated: true,
      }
    }

    // Public impact is unchanged, but there's informational lower-tier content worth keeping --
    // never delete the file (there's something to say), never invent a new public claim this run.
    const generatedSection = buildGeneratedSection({
      summary: "No public API changes detected.",
      requiredLevel: undefined,
      apiJsonHash: input.apiJsonHash,
      machineLevel: existingMachineLevel,
      lowerTierSummary,
    })
    const newBody = [humanBody, generatedSection].filter((s) => s.length > 0).join("\n\n")
    const newContent = renderChangesetFile(input.packageName, humanLevel ?? "patch", newBody)

    if (newContent === existingContent) {
      return {
        action: "unchanged",
        path: relativePath,
        humanReleaseLevel: humanLevel,
        generatedSectionUpdated: false,
      }
    }
    await writeFile(targetPath, newContent, "utf8")
    return {
      action: "updated",
      path: relativePath,
      humanReleaseLevel: humanLevel,
      generatedSectionUpdated: true,
    }
  }

  if (input.impact === "unknown") {
    if (existingContent === undefined) {
      return { action: "none", generatedSectionUpdated: false }
    }
    const {
      level: existingLevel,
      machineLevel: existingMachineLevel,
      body: existingBody,
    } = parseChangeset(existingContent, input.packageName)
    const humanBody = stripGeneratedSection(existingBody, MARKERS)
    const generatedSection = buildGeneratedSection({
      summary: input.summary,
      requiredLevel: undefined,
      apiJsonHash: input.apiJsonHash,
      machineLevel: existingMachineLevel, // pass-through: do NOT erase the machine's last definitive claim
      lowerTierSummary,
    })
    const newBody = [humanBody, generatedSection].filter((s) => s.length > 0).join("\n\n")
    const newContent = renderChangesetFile(input.packageName, existingLevel ?? "patch", newBody)

    if (newContent === existingContent) {
      return {
        action: "unchanged",
        path: relativePath,
        humanReleaseLevel: existingLevel,
        generatedSectionUpdated: false,
      }
    }
    await writeFile(targetPath, newContent, "utf8")
    return {
      action: "updated",
      path: relativePath,
      humanReleaseLevel: existingLevel,
      generatedSectionUpdated: true,
    }
  }

  const requiredLevel = asChangesetLevel(input.requiredLevel)
  if (requiredLevel === undefined) {
    throw new Error(
      `Internal error: impact "${input.impact}" has no valid required release level -- this indicates a bug in semver.ts/compatibility-classifier.ts, not a configuration problem.`,
    )
  }

  const generatedSection = buildGeneratedSection({
    summary: input.summary,
    requiredLevel: input.requiredLevel,
    apiJsonHash: input.apiJsonHash,
    machineLevel: requiredLevel, // definitive: this run's own new claim always supersedes any prior one
    lowerTierSummary,
  })

  if (existingContent === undefined) {
    await mkdir(path.join(input.root, CHANGESET_DIR), { recursive: true })
    await writeFile(
      targetPath,
      renderChangesetFile(input.packageName, requiredLevel, generatedSection),
      "utf8",
    )
    return {
      action: "created",
      path: relativePath,
      requiredReleaseLevel: requiredLevel,
      effectiveReleaseLevel: requiredLevel,
      generatedSectionUpdated: true,
    }
  }

  const {
    level: existingLevel,
    machineLevel: existingMachineLevel,
    body: existingBody,
  } = parseChangeset(existingContent, input.packageName)
  const humanBody = stripGeneratedSection(existingBody, MARKERS)
  const humanLevel = recoverHumanLevel(existingLevel, existingMachineLevel)
  const effectiveLevel = maxLevel(humanLevel, requiredLevel) ?? requiredLevel
  const newBody = [humanBody, generatedSection].filter((s) => s.length > 0).join("\n\n")
  const newContent = renderChangesetFile(input.packageName, effectiveLevel, newBody)

  const evidence: ChangesetEvidence = {
    action: newContent === existingContent ? "unchanged" : "updated",
    path: relativePath,
    humanReleaseLevel: humanLevel,
    requiredReleaseLevel: requiredLevel,
    effectiveReleaseLevel: effectiveLevel,
    generatedSectionUpdated: newContent !== existingContent,
  }

  if (newContent !== existingContent) {
    await writeFile(targetPath, newContent, "utf8")
  }

  return evidence
}

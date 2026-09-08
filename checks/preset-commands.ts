import type { PresetCommandsEvidence } from "../scripts/preset-commands/evidence-types.js"
import { PRESET_COMMAND_EXCEPTION_SCHEMA } from "../scripts/preset-commands/registry.js"
import { guidanceFor } from "../scripts/preset-commands/review-guidance.js"
import { validateExceptionRegistry } from "../scripts/shared/exception-record.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig, PolicyResult } from "../src/types.js"

/**
 * Fails whenever a published preset (`src/presets/*.ts`) spawns an external command with no
 * complete reviewed record in `.repo-contract/exceptions/preset-commands.json`, a stale record
 * whose command is gone, or a `run:` property whose command isn't a statically-resolvable string
 * literal. A pure evidence->verdict function -- the scan script owns loading, reconciling, and
 * writing the registry.
 *
 * The only field a record needs is a non-empty `justification` (the whole review: what capability
 * the command has under the flags the preset passes, and why repo-contract spawning it on a
 * consumer's behalf is acceptable). No policy config, no per-command allowlist -- every command is
 * held to the same one bar.
 * @param input - Wraps the scan evidence.
 * @param input.evidence - The `PresetCommandsEvidence` emitted by scan.ts.
 * @returns the pass/fail outcome and its rationale.
 */
export function evaluatePresetCommandsPolicy(input: {
  readonly evidence: PresetCommandsEvidence
}): PolicyResult {
  const { evidence } = input

  if (!evidence.ok) {
    const errors = evidence.registryError
      ? `\n${evidence.registryError.map((e) => `- ${e}`).join("\n")}`
      : ""
    return { outcome: "fail", rationale: `${evidence.error}${errors}` }
  }

  if (evidence.registryError !== undefined) {
    return {
      outcome: "fail",
      rationale: [
        `${evidence.registryPath} failed to load or reconcile and was left unchanged:`,
        ...evidence.registryError.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  const activeRecords = Object.values(evidence.activeExceptions)
  const revalidated = validateExceptionRegistry(
    [...activeRecords, ...evidence.staleExceptions],
    PRESET_COMMAND_EXCEPTION_SCHEMA,
  )
  if (!revalidated.ok) {
    return {
      outcome: "fail",
      rationale: [
        "preset-commands evidence failed independent registry validation:",
        ...revalidated.errors.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  const findingIds = evidence.findings.map((finding) => finding.id)
  const activeIds = new Set(Object.keys(evidence.activeExceptions))
  const bijectionErrors: string[] = []
  if (new Set(findingIds).size !== findingIds.length) {
    bijectionErrors.push("evidence.findings contains duplicate ids.")
  }
  for (const id of new Set(findingIds)) {
    if (!activeIds.has(id))
      bijectionErrors.push(`command ${JSON.stringify(id)} has no active exception record.`)
  }
  for (const id of activeIds) {
    if (!findingIds.includes(id))
      bijectionErrors.push(`active exception ${JSON.stringify(id)} matches no command.`)
  }
  if (bijectionErrors.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        "preset-commands evidence broke the commands <-> activeExceptions bijection:",
        ...bijectionErrors.map((e) => `- ${e}`),
      ].join("\n"),
    }
  }

  const nonLiteralLines = evidence.nonLiteral.map(
    (nl) => `- ${nl.file}:${String(nl.line)} -- ${nl.detail}`,
  )
  const staleLines = evidence.staleExceptions.map(
    (record) =>
      `- Stale record in ${evidence.registryPath}: ${JSON.stringify(record.id)} -- no preset spawns "${record.command}" any more; delete this entry.`,
  )
  const underjustified = evidence.findings.filter(
    (finding) => evidence.activeExceptions[finding.id]?.justification.trim().length === 0,
  )
  const underjustifiedLines = underjustified.map(
    (finding) =>
      `- ${finding.command} (${finding.file}:${String(finding.line)}) -- fill in "justification". ${guidanceFor(finding.command)}`,
  )

  if (nonLiteralLines.length === 0 && staleLines.length === 0 && underjustifiedLines.length === 0) {
    return {
      outcome: "pass",
      rationale: `${String(evidence.findings.length)} preset command(s), each backed by a reviewed record.`,
    }
  }

  return {
    outcome: "fail",
    rationale: [
      `${String(nonLiteralLines.length + staleLines.length + underjustifiedLines.length)} preset-command issue(s):`,
      ...nonLiteralLines,
      ...underjustifiedLines,
      ...staleLines,
    ].join("\n"),
  }
}

// The reconciled successor to scripts/security-network/network-surface.mjs's former
// ALLOWED_PRESET_COMMANDS allowlist -- see specs/decisions/0007-no-network-surface.md's amendment.
export const presetCommands: CheckDefinitionConfig = {
  run: ["tsx", "scripts/preset-commands/scan.ts"],
  output: { format: "json" },
  policy: ({ result }) => {
    const parsed = requireParsedOutput<PresetCommandsEvidence>(
      result.output,
      "preset-commands check output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    return evaluatePresetCommandsPolicy({ evidence: parsed.value })
  },
}

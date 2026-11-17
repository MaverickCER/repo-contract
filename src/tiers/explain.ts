import { plannedChecks, TIER_NAMES, tierChecks, tierSettings } from "./catalog.js"
import { compareSetting, LOOSENING_RULES } from "./loosening.js"
import type { PlannedCheck, TierName, TierSettings } from "./types.js"

/** What a config is compared against: a tier's defaults, or a stricter standard such as IPC's. */
export interface ExplainBaseline {
  /** A name for the rendered output, such as `"strict"`. */
  readonly name: string
  /** The check ids the baseline turns on. */
  readonly checks: readonly string[]
  readonly settings: TierSettings
  readonly planned: readonly PlannedCheck[]
}

/** One setting looser than the baseline, or a baseline check turned off (`setting: "enabled"`). */
export interface Loosening {
  readonly check: string
  readonly setting: string
  readonly baseline: number | boolean | undefined
  readonly value: number | boolean | undefined
}

/** One check in the config, as `explain` reports it. */
export interface ExplainedCheck {
  readonly id: string
  /** `"tier"` when the baseline turns the check on; `"added"` when only the config does. */
  readonly source: "tier" | "added"
  /** `false` when the tier's overrides turned the check off. */
  readonly enabled: boolean
  /** The numeric settings in force, as `explain` knows them from the tier metadata. */
  readonly settings: Readonly<Record<string, number>>
  readonly loosened: readonly Loosening[]
}

/** What `explainTier` returns, and what `repo-contract explain --json` prints. */
export interface TierExplanation {
  readonly schemaVersion: 1
  /** The tier the config was built from, or `undefined` when it carries no tier metadata. */
  readonly tier: TierName | undefined
  /** The baseline's name, or `undefined` when there was nothing to compare against. */
  readonly baseline: string | undefined
  readonly checks: readonly ExplainedCheck[]
  /** Baseline checks the config does not contain at all. */
  readonly missing: readonly string[]
  /** Every loosening, in check order. */
  readonly loosened: readonly Loosening[]
  readonly planned: readonly PlannedCheck[]
}

/** The part of a config `explainTier` reads. A config built by a tier carries `tier`. */
export interface ExplainableConfig {
  readonly checks: Readonly<Record<string, unknown>>
  readonly tier?: unknown
}

/** Options for {@link renderExplain}. */
export interface RenderExplainOptions {
  /** `"text"` for a terminal (the default), `"markdown"` for a report or step summary. */
  readonly format?: "text" | "markdown"
  /** The heading over the loosened settings. Defaults to `"Loosened"`. */
  readonly heading?: string
}

/** The parts of a tier's metadata `explain` reads. */
interface ReadMetadata {
  readonly name: TierName
  readonly checks: readonly string[]
  readonly off: readonly string[]
  readonly settings: Readonly<Record<string, unknown>>
}

/**
 * @param value - an untrusted object.
 * @returns whether it is a non-null object.
 */
function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null
}

/**
 * Reads the `tier` key a tier function put on the config. Anything else counts as no metadata,
 * since a hand-written config can carry any value there.
 * @param tier - the config's `tier` value.
 * @returns the metadata, or `undefined` when it is missing or malformed.
 */
function readMetadata(tier: unknown): ReadMetadata | undefined {
  if (!isObject(tier)) return undefined
  const { name, checks, off, settings } = tier
  if (
    !TIER_NAMES.includes(name as TierName) ||
    !Array.isArray(checks) ||
    !Array.isArray(off) ||
    !isObject(settings)
  ) {
    return undefined
  }
  return {
    name: name as TierName,
    checks: checks as readonly string[],
    off: off as readonly string[],
    settings,
  }
}

/**
 * @param metadata - the config's tier metadata.
 * @param id - a check id.
 * @returns the numeric settings the tier built that check with; none for a check it did not build.
 */
function numericSettings(
  metadata: ReadMetadata | undefined,
  id: string,
): Readonly<Record<string, number>> {
  if (!metadata?.checks.includes(id)) return {}
  const group = Object.hasOwn(metadata.settings, id) ? metadata.settings[id] : undefined
  if (!isObject(group)) return {}
  return Object.fromEntries(
    Object.entries(group).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  )
}

/**
 * @param check - a check id.
 * @returns the loosening for a baseline check that is off or missing.
 */
function turnedOff(check: string): Loosening {
  return { check, setting: "enabled", baseline: true, value: false }
}

/**
 * @param id - a check the config and the baseline both run.
 * @param settings - its settings in force.
 * @param baseline - what to compare against.
 * @returns every setting of the check looser than the baseline's.
 */
function looserSettings(
  id: string,
  settings: Readonly<Record<string, number>>,
  baseline: ExplainBaseline,
): Loosening[] {
  const baselineGroup = baseline.settings[id as keyof TierSettings] as
    Readonly<Record<string, number | undefined>> | undefined
  return LOOSENING_RULES.filter((rule) => rule.check === id).flatMap((rule) => {
    const expected = baselineGroup?.[rule.setting]
    const value = settings[rule.setting]
    return compareSetting(rule.direction, expected, value) === "looser"
      ? [{ check: id, setting: rule.setting, baseline: expected, value }]
      : []
  })
}

/**
 * @param name - a tier.
 * @returns that tier's defaults as a baseline.
 * @beta
 */
export function tierBaseline(name: TierName): ExplainBaseline {
  return {
    name,
    checks: tierChecks(name),
    settings: tierSettings(name),
    planned: plannedChecks(name),
  }
}

/**
 * Lists what a config runs and every setting looser than the baseline. Without a baseline it
 * compares against the defaults of the tier the config carries. Settings come from the tier
 * metadata alone: a check replaced by hand keeps the metadata's settings, and a config without
 * metadata has its checks compared but not its settings.
 * @param config - a config, usually one spread from a tier.
 * @param baseline - what to compare against; defaults to the config's own tier.
 * @returns the explanation.
 * @beta
 */
export function explainTier(
  config: ExplainableConfig,
  baseline?: ExplainBaseline,
): TierExplanation {
  const metadata = readMetadata(config.tier)
  const against = baseline ?? (metadata ? tierBaseline(metadata.name) : undefined)
  const inBaseline = (id: string): boolean => against?.checks.includes(id) ?? false

  const checks = Object.keys(config.checks).map((id): ExplainedCheck => {
    const enabled = !metadata?.off.includes(id)
    const settings = numericSettings(metadata, id)
    let loosened: Loosening[] = []
    if (against && inBaseline(id)) {
      loosened = enabled ? (metadata ? looserSettings(id, settings, against) : []) : [turnedOff(id)]
    }
    return { id, source: inBaseline(id) ? "tier" : "added", enabled, settings, loosened }
  })
  const missing = (against?.checks ?? []).filter((id) => !Object.hasOwn(config.checks, id))

  return {
    schemaVersion: 1,
    tier: metadata?.name,
    baseline: against?.name,
    checks,
    missing,
    loosened: [...checks.flatMap((check) => check.loosened), ...missing.map(turnedOff)],
    planned: against?.planned ?? [],
  }
}

/**
 * @param settings - one check's numeric settings.
 * @returns them as `name value` pairs, such as `lines 80, statements 80`.
 */
function describeSettings(settings: Readonly<Record<string, number>>): string {
  return Object.entries(settings)
    .map(([name, value]) => `${name} ${String(value)}`)
    .join(", ")
}

/**
 * @param check - one explained check.
 * @returns its status and settings, such as `off` or `added; lines 80`.
 */
function describeCheck(check: ExplainedCheck): string {
  return [
    check.enabled ? undefined : "off",
    check.source === "added" ? "added" : undefined,
    describeSettings(check.settings) || undefined,
  ]
    .filter((part) => part !== undefined)
    .join("; ")
}

/**
 * @param loosening - one loosening.
 * @param missing - the baseline checks the config lacks.
 * @param code - wraps a setting name for the format.
 * @returns one line describing it, such as `Coverage branches: 70 (baseline 80)`.
 */
function describeLoosening(
  loosening: Loosening,
  missing: readonly string[],
  code: (text: string) => string,
): string {
  if (loosening.setting === "enabled") {
    const how = missing.includes(loosening.check) ? "not in checks" : "turned off"
    return `${loosening.check}: ${how} (baseline runs it)`
  }
  const value = loosening.value === undefined ? "not judged" : String(loosening.value)
  return `${loosening.check} ${code(loosening.setting)}: ${value} (baseline ${String(loosening.baseline)})`
}

/**
 * @param explanation - what {@link explainTier} returned.
 * @param code - wraps a name for the format.
 * @returns one sentence naming the tier and the baseline.
 */
function describeComparison(explanation: TierExplanation, code: (text: string) => string): string {
  const { tier, baseline } = explanation
  if (baseline === undefined) return "No tier metadata and no baseline, so nothing is compared."
  if (tier === undefined) {
    return `No tier metadata: checks are compared with ${code(baseline)}, settings are not.`
  }
  return `Tier ${code(tier)}, compared with ${code(baseline)}.`
}

/**
 * Renders an explanation for a person: each check with its settings, then the loosened settings
 * under their own heading, then the planned checks.
 * @param explanation - what {@link explainTier} returned.
 * @param options - the format and heading.
 * @returns the text, ending in a newline.
 * @beta
 */
export function renderExplain(
  explanation: TierExplanation,
  options: RenderExplainOptions = {},
): string {
  const { heading = "Loosened" } = options
  // Every format but markdown renders as text, so text needs no default of its own.
  const markdown = options.format === "markdown"
  const code = markdown ? (text: string) => `\`${text}\`` : (text: string) => text
  const loosened = explanation.loosened.map((loosening) =>
    describeLoosening(loosening, explanation.missing, code),
  )
  if (loosened.length === 0) loosened.push("Nothing is loosened.")
  const planned = explanation.planned.map(
    ({ id, tier, reason }) => `${markdown ? `**${id}**` : id} (${tier}): ${reason}`,
  )

  const lines = [describeComparison(explanation, code), ""]
  if (markdown) {
    lines.push("| Check | Status and settings |", "| --- | --- |")
    lines.push(...explanation.checks.map((check) => `| ${check.id} | ${describeCheck(check)} |`))
    lines.push("", `### ${heading}`, "", ...loosened.map((line) => `- ${line}`))
    if (planned.length > 0) {
      lines.push("", "### Planned for a later release", "", ...planned.map((line) => `- ${line}`))
    }
  } else {
    const width = Math.max(0, ...explanation.checks.map(({ id }) => id.length))
    lines.push("Checks:")
    lines.push(
      ...explanation.checks.map((check) =>
        `  ${check.id.padEnd(width)}  ${describeCheck(check)}`.trimEnd(),
      ),
    )
    lines.push("", `${heading}:`, ...loosened.map((line) => `  ${line}`))
    if (planned.length > 0) {
      lines.push("", "Planned for a later release:", ...planned.map((line) => `  ${line}`))
    }
  }
  return `${lines.join("\n")}\n`
}

import { notImplemented } from "../not-implemented.js"
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

/**
 * @param name - a tier.
 * @returns that tier's defaults as a baseline.
 * @beta
 */
export function tierBaseline(name: TierName): ExplainBaseline {
  return notImplemented("R1e", name)
}

/**
 * Lists what a config runs and every setting looser than the baseline. Without a baseline it
 * compares against the defaults of the tier the config carries.
 * @param config - a config, usually one spread from a tier.
 * @param baseline - what to compare against; defaults to the config's own tier.
 * @returns the explanation.
 * @beta
 */
export function explainTier(
  config: ExplainableConfig,
  baseline?: ExplainBaseline,
): TierExplanation {
  return notImplemented("R1e", config, baseline)
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
  return notImplemented("R1e", explanation, options)
}

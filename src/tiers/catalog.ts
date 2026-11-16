import { notImplemented } from "../not-implemented.js"
import type { PlannedCheck, TierCheckId, TierDefinition, TierName, TierSettings } from "./types.js"

/** The tier names, loosest first. */
export const TIER_NAMES: readonly TierName[] = ["basic", "app", "library", "strict"]

/** The checks that only matter to a package someone installs. On a `private: true` package they pass as not applicable. */
export const LIBRARY_ONLY_CHECKS: readonly TierCheckId[] = [
  "Packaging",
  "TypeResolution",
  "BundledDependencies",
  "QuickStart",
]

/**
 * Each tier's own definition. A tier's full check list is its `adds` after every tier it extends.
 * @param name - the tier.
 * @returns its definition.
 */
export function tierDefinition(name: TierName): TierDefinition {
  return notImplemented("R1", name)
}

/**
 * @param name - the tier.
 * @returns every check the tier turns on, the checks of the tiers below it first, in schedule order.
 */
export function tierChecks(name: TierName): readonly TierCheckId[] {
  return notImplemented("R1", name)
}

/**
 * @param name - the tier.
 * @returns the tier's default settings.
 */
export function tierSettings(name: TierName): TierSettings {
  return notImplemented("R1", name)
}

/**
 * @param name - the tier.
 * @returns the planned checks at this tier and below.
 */
export function plannedChecks(name: TierName): readonly PlannedCheck[] {
  return notImplemented("R1", name)
}

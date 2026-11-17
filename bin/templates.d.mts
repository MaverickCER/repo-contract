import type { PresetName } from "./preset-catalog.d.mts"

export declare const CONTRACT_RUNNER_TEMPLATE: string

export declare function buildConfigTemplate(detectedPresets: readonly PresetName[]): string

export declare function buildTierConfigTemplate(
  tier: "basic" | "app" | "library" | "strict",
): string

export declare function spreadTierOf(
  text: string,
): "basic" | "app" | "library" | "strict" | undefined

export declare function tierInitHeadline(
  requested: "basic" | "app" | "library" | "strict",
  keptText: string | undefined,
): { lines: string[]; tier: "basic" | "app" | "library" | "strict" | undefined }

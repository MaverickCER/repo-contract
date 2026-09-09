import type { PresetName } from "./preset-catalog.d.mts"

export declare const CONTRACT_RUNNER_TEMPLATE: string

export declare function buildConfigTemplate(detectedPresets: readonly PresetName[]): string

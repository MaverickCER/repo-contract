export type PresetName =
  | "test"
  | "e2e"
  | "lint"
  | "format"
  | "typecheck"
  | "deadCode"
  | "duplication"
  | "stylelint"
  | "markdownlint"
  | "brokenLinks"
  | "securityDeps"
  | "securitySecrets"
  | "license"
  | "commitlint"
  | "publint"
  | "arethetypeswrong"

export declare const PRESET_DEPENDENCIES: Readonly<Record<PresetName, string | null>>

export declare const FACTORY_PRESETS: ReadonlySet<PresetName>

export interface SkippedPreset {
  readonly preset: PresetName
  readonly dependency: string
}

export interface DetectPresetsResult {
  readonly detected: readonly PresetName[]
  readonly skipped: readonly SkippedPreset[]
}

export declare function detectPresets(packageJson: {
  // A real package.json naturally has both fields -- this type accepts `dependencies` for
  // shape-compatibility with that, even though detectPresets's implementation only ever reads
  // `devDependencies` (see preset-catalog.mjs's own doc comment for why).
  readonly dependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
}): DetectPresetsResult

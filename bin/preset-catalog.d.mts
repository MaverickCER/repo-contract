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
  | "distNoUrls"
  | "securityDeps"
  | "securitySecrets"
  | "license"
  | "commitlint"
  | "publint"
  | "arethetypeswrong"
  | "aiReview"
  | "bundledDependencies"
  | "quickStart"

export declare const DIST_OUTPUT: "dist/"

export declare const AGENT_COMMAND: "agent command"

export declare const PUBLISHED_PACKAGE: "published package"

export declare const QUICK_START_BLOCK: "quick-start block"

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
  // A package.json usually has both fields, so this type accepts `dependencies` too. The
  // implementation reads only `devDependencies` (preset-catalog.mjs's doc comment says why).
  readonly dependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
  // Read only to detect a published `dist/` (the `distNoUrls` preset).
  readonly main?: string
  readonly module?: string
  readonly types?: string
  readonly files?: readonly string[]
  readonly exports?: unknown
  // Read only to detect a published package (the `bundledDependencies` preset).
  readonly private?: unknown
}): DetectPresetsResult

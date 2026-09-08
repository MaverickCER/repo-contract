/**
 * Shapes for the `preset-commands` self-hosting check -- `scripts/preset-commands/scan.ts`
 * discovers every external command a published preset (`src/presets/*.ts`) spawns as its `run:`
 * property's first token, reconciles `.repo-contract/exceptions/preset-commands.json` against that
 * set, and `checks/preset-commands.ts`'s policy reads (never re-derives) the result. See
 * specs/decisions/0007-no-network-surface.md and
 * specs/decisions/0013-reusable-exception-policy-helper.md's "review surface" amendment.
 *
 * Replaces the former `ALLOWED_PRESET_COMMANDS` allowlist in
 * `scripts/security-network/network-surface.mjs`: instead of "a command not on the list fails",
 * every* preset command now needs its own reviewed record. The record's `id` is keyed by the
 * command name alone (`preset-command:<command>`), so one review covers a command however many
 * presets spawn it, and editing a preset file never churns the registry.
 */

/** One external command a published preset spawns, discovered from its `run:` first token. */
export interface PresetCommandFinding {
  /** `preset-command:<command>` -- see `derivePresetCommandId`. */
  readonly id: string
  /** The command name (the `run:` array's first element). */
  readonly command: string
  /** A preset file that spawns it (the first one discovered), for the reviewer. */
  readonly file: string
  /** The 1-based line of that `run:` property. */
  readonly line: number
}

/** A `run:` property whose first element is not a statically-resolvable string literal -- a hard failure, never reconcilable (no command name to key a record by). */
export interface NonLiteralPresetCommand {
  readonly file: string
  readonly line: number
  readonly detail: string
}

/** One row of preset-commands.json. `justification` is the whole review: what capability the command has under the flags the preset passes, and why repo-contract spawning it on a consumer's behalf is acceptable. */
export interface PresetCommandExceptionRecord {
  /** `preset-command:<command>` -- must equal `derivePresetCommandId(record)`. */
  readonly id: string
  readonly version: 1
  readonly justification: string
  readonly command: string
}

export type PresetCommandsEvidence =
  | {
      readonly ok: true
      readonly registryPath: string
      readonly findings: readonly PresetCommandFinding[]
      readonly nonLiteral: readonly NonLiteralPresetCommand[]
      readonly activeExceptions: Readonly<Record<string, PresetCommandExceptionRecord>>
      readonly staleExceptions: readonly PresetCommandExceptionRecord[]
      readonly scaffoldedIds: readonly string[]
      readonly registryError?: readonly string[]
    }
  | {
      readonly ok: false
      readonly error: string
      readonly registryError?: readonly string[]
    }

/**
 * The check-namespaced semantic identity of one preset command: `preset-command:<command>`.
 * Injective over a run once findings are deduped by command; stable across preset-file edits.
 * @param finding - The finding's (or record's) command name.
 * @param finding.command - The command name.
 * @returns The semantic id.
 */
export function derivePresetCommandId(finding: { readonly command: string }): string {
  return `preset-command:${finding.command}`
}

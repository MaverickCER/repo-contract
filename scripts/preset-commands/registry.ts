import type { PresetCommandExceptionRecord, PresetCommandFinding } from "./evidence-types.js"
import { derivePresetCommandId } from "./evidence-types.js"
import type { ExceptionRegistrySchema } from "../shared/exception-record.js"

export type { PresetCommandExceptionRecord } from "./evidence-types.js"

// A command name is the first token of a preset's `run:` array -- an npm-package bin name or a
// path segment. This keeps out whitespace, path separators, and shell metacharacters that would
// never be a real bin name and could smuggle intent into an id.
const COMMAND_NAME = /^[A-Za-z0-9._@/-]{1,64}$/

/**
 * Builds a fresh, blank exception record for a command with no matching record yet.
 * @param finding - The unmatched finding.
 * @param id - The canonical id `reconcileExceptions` computed (equals `finding.id`).
 * @returns The blank stub record.
 */
export function createPresetCommandStub(
  finding: PresetCommandFinding,
  id: string,
): PresetCommandExceptionRecord {
  return { id, version: 1, justification: "", command: finding.command }
}

/** The per-registry schema for preset-commands.json. */
export const PRESET_COMMAND_EXCEPTION_SCHEMA: ExceptionRegistrySchema<PresetCommandExceptionRecord> =
  {
    namespace: "preset-command:",
    metadataKeys: ["command"],
    validateRecord(core, raw, index, errors) {
      const at = `exceptions[${String(index)}]`
      const { command } = raw

      const commandValid = typeof command === "string" && COMMAND_NAME.test(command)
      if (!commandValid) {
        errors.push(`${at}.command must be a plain command name (got ${JSON.stringify(command)}).`)
        return undefined
      }

      const derived = derivePresetCommandId({ command })
      if (derived !== core.id) {
        errors.push(
          `${at}.id ${JSON.stringify(core.id)} does not match the id derived from its own command (${JSON.stringify(derived)}).`,
        )
        return undefined
      }

      return { id: core.id, version: 1, justification: core.justification, command }
    },
  }

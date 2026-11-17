import { parseAffectedConfig } from "./config.js"
import type { AffectedOptions } from "./types.js"

/** Where a repository's settings came from in package.json. */
export type ContractConfigSource = "contract" | "repo-contract" | "none"

/** The settings repo-contract reads from package.json. Other keys under `"contract"` belong to other tools. */
export interface ContractConfig {
  readonly affected: AffectedOptions
  /** `"repo-contract"` means the legacy `"repo-contract".affected` key was read; `doctor` reports it. */
  readonly source: ContractConfigSource
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// Own properties only: a manifest is parsed JSON, so an inherited key can only come from a caller's
// hand-built object, and must not pass for a declared setting.
const own = (value: unknown, key: string): unknown =>
  isRecord(value) && Object.hasOwn(value, key) ? value[key] : undefined

const contractBlock = (manifest: unknown): unknown => own(own(manifest, "contract"), "affected")
const legacyBlock = (manifest: unknown): unknown => own(own(manifest, "repo-contract"), "affected")

/**
 * Says which of the two affected-settings keys a parsed package.json declares.
 * @param manifest - the parsed package.json.
 * @returns whether `"contract".affected` and the legacy `"repo-contract".affected` are present.
 * @internal
 */
export function declaredAffectedKeys(manifest: unknown): {
  readonly contract: boolean
  readonly legacy: boolean
} {
  return {
    contract: contractBlock(manifest) !== undefined,
    legacy: legacyBlock(manifest) !== undefined,
  }
}

/**
 * Says whether package.json's `"contract"` key holds something other than an object. Another tool
 * owns such a key, so repo-contract reads no settings from it.
 * @param manifest - the parsed package.json.
 * @returns `true` when the key is present and is not an object.
 * @internal
 */
export function foreignContractKey(manifest: unknown): boolean {
  const contract = own(manifest, "contract")
  return contract !== undefined && !isRecord(contract)
}

const invalid = (path: string, detail: string): { readonly error: string } => ({
  error: `invalid configuration in package.json (${path}): ${detail}`,
})

const read = (
  path: string,
  source: ContractConfigSource,
  block: unknown,
): { readonly config: ContractConfig } | { readonly error: string } => {
  const parsed = parseAffectedConfig(block)
  return "error" in parsed
    ? invalid(path, parsed.error)
    : { config: { affected: parsed.options, source } }
}

/**
 * Reads `"contract".affected` from a parsed package.json, through `parseAffectedConfig`. Falls back
 * to the legacy `"repo-contract".affected` when the new key is absent. When both are present, the
 * new key wins and the legacy block is not read, so a broken legacy block cannot fail a migrated
 * repository; `doctor` warns about it. A `"contract"` key that is not an object belongs to another
 * tool and is skipped like an absent one.
 * @param manifest - the parsed package.json, or `undefined` when there is none.
 * @returns the settings, or a one-line description of what is wrong, naming the key it read.
 */
export function readContractConfig(
  manifest: unknown,
): { readonly config: ContractConfig } | { readonly error: string } {
  if (manifest === undefined) return { config: { affected: {}, source: "none" } }
  if (!isRecord(manifest)) {
    return { error: "invalid configuration in package.json: the file must hold a JSON object" }
  }
  const contract = contractBlock(manifest)
  if (contract !== undefined) return read("contract.affected", "contract", contract)
  const legacy = legacyBlock(manifest)
  if (legacy !== undefined) return read("repo-contract.affected", "repo-contract", legacy)
  // A non-object "contract" or "repo-contract" value belongs to another tool, so it reads as no
  // settings. `doctor` reports a non-object "contract".
  return { config: { affected: {}, source: "none" } }
}

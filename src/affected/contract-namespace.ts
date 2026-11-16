import { notImplemented } from "../not-implemented.js"
import type { AffectedOptions } from "./types.js"

/** Where a repository's settings came from in package.json. */
export type ContractConfigSource = "contract" | "repo-contract" | "none"

/** The settings repo-contract reads from package.json. Other keys under `"contract"` belong to other tools. */
export interface ContractConfig {
  readonly affected: AffectedOptions
  /** `"repo-contract"` means the legacy `"repo-contract".affected` key was read; `doctor` reports it. */
  readonly source: ContractConfigSource
}

/**
 * Reads `"contract".affected` from a parsed package.json, through `parseAffectedConfig`. Falls back
 * to the legacy `"repo-contract".affected`. Fails when both are present, or the block is invalid.
 * @param manifest - the parsed package.json.
 * @returns the settings, or a one-line description of what is wrong.
 */
export function readContractConfig(
  manifest: unknown,
): { readonly config: ContractConfig } | { readonly error: string } {
  return notImplemented("R5", manifest)
}

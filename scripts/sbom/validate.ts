import type { SbomSummary } from "./types.js"

const EXPECTED_BOM_FORMAT = "CycloneDX"
const TOOL_GROUP = "@cyclonedx"
const TOOL_NAME = "cyclonedx-npm"

/**
 * Whether `value` is a non-null, non-array object -- the same defensive shape guard
 * `scripts/security-socket/scan.ts`'s own `isPlainObject` uses, duplicated here rather than
 * imported: this script is self-hosting tooling outside `src/`, and importing an internal helper
 * from a sibling check's own script would be exactly the kind of cross-check-script coupling
 * `specs/architecture.md`'s module boundaries avoid.
 * @param value - The candidate value to check.
 * @returns `true` if `value` is a plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * The real `@cyclonedx/cyclonedx-npm` version that produced this document, read straight back off
 * the document's own self-reported `metadata.tools.components` entry (cyclonedx-npm always records
 * itself there, confirmed directly against a real run -- see spawn.ts's own doc comment) -- never a
 * second, independent lookup (e.g. re-reading `node_modules/@cyclonedx/cyclonedx-npm/package.json`)
 * that could in principle drift from what actually ran. Falls back to `"unknown"` if that entry is
 * ever missing or reshaped by a future tool version -- a cosmetic provenance detail, never a reason
 * to fail a document that otherwise validated.
 * @param metadata - The parsed document's own top-level `"metadata"` field.
 * @returns The tool's version, or `"unknown"`.
 */
function extractToolVersion(metadata: unknown): string {
  if (!isPlainObject(metadata)) return "unknown"
  const tools = metadata.tools
  const components = isPlainObject(tools) ? tools.components : undefined
  if (!Array.isArray(components)) return "unknown"
  for (const component of components) {
    if (
      isPlainObject(component) &&
      component.group === TOOL_GROUP &&
      component.name === TOOL_NAME &&
      typeof component.version === "string" &&
      component.version.length > 0
    ) {
      return component.version
    }
  }
  return "unknown"
}

/**
 * Confirms `parsed` is a genuinely well-formed CycloneDX document -- carrying the exact
 * `bomFormat`/a real `specVersion`/a real `components` array -- and pulls out the small summary
 * this check's own policy needs. Never re-validates full spec conformance itself (that's
 * `--validate`'s own ajv-backed pass inside cyclonedx-npm, plus this repository's own independent,
 * out-of-band validation against the real published CycloneDX schema -- see README.md's SBOM
 * section); this is only the minimum shape guard every self-hosting check in this repository
 * applies before trusting its own tool's JSON output (mirrors `checks/security-deps.ts`'s
 * `validateAuditReport`).
 * @param parsed - The parsed contents of docs/sbom.cdx.json.
 * @returns The extracted summary, or a rejection reason for the caller's own rationale.
 */
export function validateSbomDocument(
  parsed: unknown,
):
  | { readonly ok: true; readonly value: SbomSummary }
  | { readonly ok: false; readonly reason: string } {
  if (!isPlainObject(parsed)) {
    return { ok: false, reason: "docs/sbom.cdx.json does not contain a JSON object." }
  }

  if (parsed.bomFormat !== EXPECTED_BOM_FORMAT) {
    return {
      ok: false,
      reason: `docs/sbom.cdx.json's "bomFormat" is ${JSON.stringify(parsed.bomFormat)}, expected ${JSON.stringify(EXPECTED_BOM_FORMAT)}.`,
    }
  }

  if (typeof parsed.specVersion !== "string" || parsed.specVersion.length === 0) {
    return { ok: false, reason: 'docs/sbom.cdx.json has no valid "specVersion" string.' }
  }

  if (!Array.isArray(parsed.components)) {
    return { ok: false, reason: 'docs/sbom.cdx.json has no "components" array.' }
  }

  return {
    ok: true,
    value: {
      bomFormat: parsed.bomFormat,
      specVersion: parsed.specVersion,
      componentCount: parsed.components.length,
      toolVersion: extractToolVersion(parsed.metadata),
    },
  }
}

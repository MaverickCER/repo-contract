// Shared types for the "sbom" check's own generation pipeline (spawn.ts / validate.ts /
// generate.ts / run.ts, plus checks/sbom.ts's own policy). This pipeline has no
// render.ts/print-lines.ts, because there is no from-scratch rendering job here. A real tool's
// already-valid output is only validated and passed through (see generate.ts's module doc comment).

/**
 * The small, repo-contract-owned summary this check actually reasons about: never a re-authored
 * copy of the CycloneDX schema itself (see validate.ts's own doc comment). Every field is read
 * straight back off the real document cyclonedx-npm wrote to docs/sbom.cdx.json.
 */
export interface SbomSummary {
  /** The document's own top-level `"bomFormat"`: expected to always be `"CycloneDX"`. */
  readonly bomFormat: string
  /** The document's own top-level `"specVersion"`: expected to match `CYCLONEDX_SPEC_VERSION` (spawn.ts). */
  readonly specVersion: string
  /** `document.components.length`: the number of components this SBOM actually inventories. */
  readonly componentCount: number
  /** The real `@cyclonedx/cyclonedx-npm` version that produced this document (see validate.ts's `extractToolVersion`). */
  readonly toolVersion: string
}

/**
 * `run.ts`'s own stdout contract: the full `SbomSummary` plus where the real document was
 * written. If generation failed at any step, it is a rejection reason instead. The steps are
 * the CLI itself, reading its output back, and validating its shape. `checks/sbom.ts`'s `policy` parses this directly.
 */
export type SbomEvidence =
  | ({
      readonly ok: true
      readonly outputPath: string
      /** The runtime inventory: only what installing the package brings in. */
      readonly productionOutputPath: string
      readonly productionComponentCount: number
    } & SbomSummary)
  | { readonly ok: false; readonly reason: string }

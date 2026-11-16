// ajv-formats-draft2019 ships no types. It adds the draft 2019-09 string formats ajv-formats
// lacks, `iri-reference` and `idn-email` among them, which the CycloneDX schema uses. It is the
// format plugin @cyclonedx/cyclonedx-library's own validator loads, so test/unit/presets/sbom.test.ts
// validates SBOMs the way that library does.
declare module "ajv-formats-draft2019" {
  import type { Ajv } from "ajv"

  /** Registers the plugin's formats on `ajv` (all of them when `formats` is omitted). */
  export default function addFormats(ajv: Ajv, formats?: readonly string[]): Ajv
}

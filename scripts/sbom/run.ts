// Entry point for the "sbom" check, invoked via `run: ["tsx", "scripts/sbom/run.ts"]` in
// repo-contract.config.ts. Prints ONLY the JSON evidence to stdout (for `output: { format: "json" }`
// to parse) -- mirrors scripts/dead-code/check.ts's / scripts/security-socket/scan.ts's own stdout
// contract. The real deliverable, docs/sbom.cdx.json, is written as a side effect of
// `generateSbom` itself (see generate.ts's own doc comment), not printed here.

import { pathToFileURL } from "node:url"
import { generateSbom } from "./generate.js"

// Mirrors scripts/openssf-scorecard/run.ts's / scripts/suppression-governance/check.ts's own
// "only run when invoked directly, not when imported by a test" guard.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = await generateSbom(process.cwd())
  process.stdout.write(JSON.stringify(evidence))
}

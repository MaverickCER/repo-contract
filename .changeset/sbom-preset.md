---
"repo-contract": minor
---

`repo-contract/presets` gains `sbom(options?)`, a check that keeps CycloneDX 1.6 SBOMs in step with `package-lock.json`.

- **What it writes.** `docs/sbom.cdx.json` lists every locked package, dev dependencies with `scope: "excluded"`. `docs/sbom.production.cdx.json` lists every locked package not marked `dev`. Each component carries its purl, the hashes from `integrity`, its declared license and where it was resolved from. Each document holds the full dependency graph.
- **How.** It builds the documents from the lockfile through `node -e`, with no tool to install, and never runs `npm ls`. The same lockfile gives byte-identical output. There is no timestamp, and the serial number is derived from the content.
- **What it fails.** A document that is missing, is not a JSON object, or differs from what the lockfile gives. `serialNumber`, `metadata.timestamp`, key order and formatting are ignored. A lockfile without a `packages` map (lockfileVersion 1) or one that cannot be read also fails.
- **Regenerating.** `write: true` writes the documents instead. GUIDE.md shows a four-line script that runs it. `fix` names that command in the failure message.
- **Not added by `init`.** The check fails until the documents exist, so `init` lists it under "Not detected".
- **This repository dogfoods it.** repo-contract's own `docs/sbom.cdx.json` and `docs/sbom.production.cdx.json` now come from `sbom({ write: true })`, and `@cyclonedx/cyclonedx-npm` is no longer a dev dependency.

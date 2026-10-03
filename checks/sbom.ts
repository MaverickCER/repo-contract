import { runGit } from "../scripts/diff-files.js"
import type { SbomEvidence } from "../scripts/sbom/types.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig } from "../src/types.js"

/**
 * Dogfoods repo-contract's own contract/evidence mechanism a further time (alongside
 * `openssf-scorecard`) to produce `docs/sbom.cdx.json` -- a real, spec-compliant CycloneDX
 * Software Bill of Materials for this repository's own npm dependency graph (direct + transitive,
 * as resolved in package-lock.json; no other ecosystem). See README.md's own SBOM section for the
 * exact spec version targeted and how it was confirmed, and scripts/sbom/spawn.ts's own doc
 * comment for the exact flags used and why.
 *
 * Unlike `openssf-scorecard`, this check needs no `dependsOn`: it reads no other check's evidence,
 * so `run` (scripts/sbom/run.ts -> generate.ts) does the genuine work -- spawning cyclonedx-npm and
 * writing docs/sbom.cdx.json -- entirely by itself, the ordinary pattern every other self-hosting
 * check in this repository already uses (see generate.ts's own doc comment). `policy` below only
 * interprets that already-complete result and adds this repository's own evidence metadata
 * (date/commit/the real cyclonedx-npm version that ran) to its rationale -- mirroring the
 * provenance pattern `checks/openssf-scorecard.ts`'s `ScorecardProvenance` establishes, kept
 * deliberately flatter here (`SbomProvenance` below: just `date`/`commit`/`toolVersion`, no nested
 * `repo`/`tool` objects or a second "evaluator version" field): this check genuinely invokes a
 * real, versioned upstream tool against a real repository name it never needs to look up (no
 * GitHub-API-shaped fields to carry, unlike openssf-scorecard's own self-written evaluator).
 *
 * Declared as a writer in repo-contract.config.ts (alongside `api-docs-report`), not a reader: it
 * genuinely regenerates docs/sbom.cdx.json on every run, and -- thanks to
 * `--output-reproducible` (spawn.ts) -- does so byte-identically given an unchanged
 * package-lock.json, so the same blanket "working tree is clean after the contract run" CI gate
 * every other writer's output goes through catches a stale committed copy here too, with no special
 * exclusion needed (contrast `docs/OpenSSF-Scorecard.md`, which stamps a fresh timestamp on every
 * run and is gitignored/CI-gate-excluded for exactly that reason -- this check deliberately avoids
 * that path instead of reproducing it).
 *
 * No separate build-model.ts/render.ts/print-lines.ts split: this generator's own "model" is
 * already the real, complete, schema-valid CycloneDX document cyclonedx-npm itself produced --
 * there is no from-scratch rendering job the way `openssf-scorecard`'s/the former
 * `iso-12207-alignment`'s own Markdown-report generators had. Reformatting or re-serializing that
 * document through an extra rendering layer would risk silently diverging from the real, valid
 * output this check exists to pass through -- see scripts/sbom/spawn.ts's own comment on why
 * `--output-file` writes it directly rather than this code re-serializing captured stdout. The one
 * genuinely repo-contract-owned piece -- the small `SbomSummary` (bomFormat/specVersion/
 * componentCount/toolVersion) `policy` below reports on -- is validated by `validate.ts`'s
 * `validateSbomDocument`, a single, thoroughly unit-tested pure function (mirrors
 * `checks/security-deps.ts`'s `validateAuditReport`); no generic multi-file split was introduced
 * beyond `spawn.ts`/`validate.ts`/`generate.ts`/`run.ts` for a generator this size.
 *
 * This check's own PASS/FAIL is about whether cyclonedx-npm ran and produced a well-formed
 * document -- never about the dependency graph's own size or shape (a large graph is not "worse"
 * SBOM evidence, just a bigger one) -- the same "evidence-gathering succeeded, not the score"
 * framing `openssf-scorecard`'s own module doc comment establishes.
 */
export interface SbomProvenance {
  /** ISO 8601 timestamp of when this generation ran. */
  readonly date: string
  /** The full commit SHA checked out when this generation ran (`scripts/diff-files.ts`'s `runGit(["rev-parse", "HEAD"], root)`). */
  readonly commit: string
  /** The real `@cyclonedx/cyclonedx-npm` version that generated this document (read back off the document's own `metadata.tools` entry -- see `scripts/sbom/validate.ts`). */
  readonly toolVersion: string
}

export const sbom: CheckDefinitionConfig = {
  run: ["tsx", "scripts/sbom/run.ts"],
  output: { format: "json" },
  policy: async ({ result }) => {
    const parsed = requireParsedOutput<SbomEvidence>(
      result.output,
      "SBOM generation output could not be parsed as JSON.",
    )
    if (!parsed.ok) return parsed.result

    const evidence = parsed.value
    if (!evidence.ok) {
      return { outcome: "fail", rationale: evidence.reason }
    }

    const root = process.cwd()
    const commit = (await runGit(["rev-parse", "HEAD"], root))?.trim() ?? "unknown"
    const provenance: SbomProvenance = {
      date: new Date().toISOString(),
      commit,
      toolVersion: evidence.toolVersion,
    }

    return {
      outcome: "pass",
      rationale:
        `Wrote ${evidence.outputPath}: ${String(evidence.componentCount)} component(s) (the build environment), ` +
        `and ${evidence.productionOutputPath}: ${String(evidence.productionComponentCount)} component(s) (what installing the package brings in), CycloneDX ${evidence.specVersion}. ` +
        `Generated by @cyclonedx/cyclonedx-npm@${provenance.toolVersion} at commit ${provenance.commit} on ${provenance.date}.`,
    }
  },
}

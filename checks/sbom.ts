import { runGit } from "../scripts/diff-files.js"
import type { SbomEvidence } from "../scripts/sbom/types.js"
import { requireParsedOutput } from "./shared/require-parsed-output.js"
import type { CheckDefinitionConfig } from "../src/types.js"

/**
 * Dogfoods repo-contract's own contract/evidence mechanism a further time (alongside
 * `openssf-scorecard`) to produce `docs/sbom.cdx.json`. That is a real, spec-compliant CycloneDX
 * Software Bill of Materials for this repository's own npm dependency graph. It covers direct and
 * transitive dependencies as resolved in package-lock.json, and no other ecosystem. SECURITY.md's
 * SBOMs section says what each document covers. The doc comment in scripts/sbom/spawn.ts gives
 * the exact flags used and why.
 *
 * Unlike `openssf-scorecard`, this check needs no `dependsOn`: it reads no other check's evidence.
 * `run` (scripts/sbom/run.ts -> generate.ts) therefore does the genuine work by itself: spawning
 * cyclonedx-npm and writing docs/sbom.cdx.json. That is the ordinary pattern every other
 * self-hosting check in this repository uses (see generate.ts's own doc comment). `policy` below
 * only interprets that already-complete result. It adds this repository's own evidence metadata
 * (date/commit/the real cyclonedx-npm version that ran) to its rationale. This mirrors the
 * provenance pattern of `checks/openssf-scorecard.ts`'s `ScorecardProvenance`, kept deliberately
 * flatter here. `SbomProvenance` below has only `date`/`commit`/`toolVersion`: no nested
 * `repo`/`tool` objects and no second "evaluator version" field. This check invokes a real,
 * versioned upstream tool against a real repository name it never needs to look up. It has no
 * GitHub-API-shaped fields to carry, unlike openssf-scorecard's own self-written evaluator.
 *
 * Declared as a writer in repo-contract.config.ts, beside `api-docs-report`, because it regenerates
 * docs/sbom.cdx.json on every run. `--output-reproducible` (spawn.ts) makes that output
 * byte-identical for an unchanged package-lock.json. So the CI step that requires a clean working
 * tree after the contract run catches a stale committed copy, with no exclusion. By contrast,
 * `docs/OpenSSF-Scorecard.md` stamps a timestamp on every run, so it is gitignored and excluded.
 *
 * No separate build-model.ts/render.ts/print-lines.ts split. This generator's own "model" is
 * already the real, complete, schema-valid CycloneDX document cyclonedx-npm itself produced.
 * There is no from-scratch rendering job like the Markdown-report generators of
 * `openssf-scorecard` and the former `iso-12207-alignment`. Passing that document through an
 * extra rendering or re-serializing layer would risk silently diverging from the real, valid
 * output this check exists to pass through. The comment in scripts/sbom/spawn.ts says why
 * `--output-file` writes it directly rather than this code re-serializing captured stdout. The one
 * genuinely repo-contract-owned piece is the small `SbomSummary` that `policy` below reports on
 * (bomFormat/specVersion/componentCount/toolVersion). `validate.ts`'s `validateSbomDocument`
 * validates it: a single, thoroughly unit-tested pure function that mirrors
 * `checks/security-deps.ts`'s `validateAuditReport`. A generator this size gets no generic
 * multi-file split beyond `spawn.ts`/`validate.ts`/`generate.ts`/`run.ts`.
 *
 * This check's own PASS/FAIL is about whether cyclonedx-npm ran and produced a well-formed
 * document. It is never about the dependency graph's own size or shape: a large graph is not
 * "worse" SBOM evidence, only a bigger one. This is the same "evidence-gathering succeeded, not
 * the score" framing that `openssf-scorecard`'s own module doc comment establishes.
 */
export interface SbomProvenance {
  /** ISO 8601 timestamp of when this generation ran. */
  readonly date: string
  /** The full commit SHA checked out when this generation ran (`scripts/diff-files.ts`'s `runGit(["rev-parse", "HEAD"], root)`). */
  readonly commit: string
  /** The real `@cyclonedx/cyclonedx-npm` version that generated this document (read back off the document's own `metadata.tools` entry: see `scripts/sbom/validate.ts`). */
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

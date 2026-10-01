// Assembles results.json's `metadata` field in a fixed key order (environment -> package ->
// configuration -> timing -> generation -> versions -> git -> generatedBy) so diffs between runs
// stay stable. Adapted from env-cap's/data-cap's own benchmark-fixtures/metadata.mjs: those import
// a single shared generator.mjs's GENERATOR_VERSION, since both of their categories share one
// tiered fixture ladder; repo-contract's three categories each own a genuinely different kind of
// fixture (a synthetic check graph, a synthetic evidence/policy payload, a synthetic TypeScript
// public API surface -- see each category's own fixtures.mjs), so `generatorVersion` and
// `benchmarkSuiteVersion` are passed in by the caller instead of imported from one shared module.

import { collectEnvironmentInfo, collectGitInfo, collectProvenance } from "./hardware-info.mjs"
import { collectPackageSize } from "./package-size.mjs"

export const BENCHMARK_SCHEMA_VERSION = 1
export const BENCHMARK_TOOL_VERSION = "1.0.0"

export function buildMetadata({
  repoRoot,
  startedAt,
  finishedAt,
  configuration,
  repoContractVersion,
  fixtureSeed,
  generatorVersion,
  benchmarkSuiteVersion,
}) {
  return {
    environment: collectEnvironmentInfo(),
    package: collectPackageSize(repoRoot),
    configuration,
    timing: {
      startedAtUtc: startedAt.toISOString(),
      finishedAtUtc: finishedAt.toISOString(),
      totalSuiteDurationMs: finishedAt.getTime() - startedAt.getTime(),
    },
    generation: { fixtureSeed, generatorVersion },
    versions: {
      benchmarkSchemaVersion: BENCHMARK_SCHEMA_VERSION,
      benchmarkSuiteVersion,
      benchmarkToolVersion: BENCHMARK_TOOL_VERSION,
      repoContractVersion,
    },
    git: collectGitInfo(repoRoot),
    generatedBy: collectProvenance().generatedBy,
  }
}

/**
 * How this repository's contract covers each check of the internal-package-contract standard
 * (`standardChecks()` in `internal-package-contract/checks/standard`). This repository hosts the
 * engine that standard runs on, so it composes its own `repo-contract.config.ts` instead of calling
 * `standardChecks()`. Each entry names the check id here that covers the standard check, or says
 * why none does. The test in test/unit/config/standard-coverage.test.ts fails in two cases: a
 * standard check is missing from this map, or a named id is not in the config.
 */

/** A standard check is either run here under an id, or left out for a stated reason. */
export type StandardCoverage = { readonly runs: string } | { readonly omitted: string }

export const STANDARD_COVERAGE: Readonly<Record<string, StandardCoverage>> = {
  ApiDocs: {
    omitted:
      "CI's `contract` job runs `npm run docs:api` before the contract, so a TypeDoc error fails that job.",
  },
  ApiDocsReport: { runs: "api-docs-report" },
  ReadmeExample: {
    omitted:
      "The README demo is `examples/demo`; CI's `examples` job runs it through scripts/run-examples.mjs, and `required` waits for that job.",
  },
  Lint: { runs: "lint" },
  Format: { runs: "format" },
  Schema: { runs: "schema" },
  Build: { runs: "build" },
  ApiContract: { runs: "api-contract" },
  SurfaceContract: { runs: "surface-contract" },
  Typecheck: { runs: "typecheck" },
  CleanCheckout: { runs: "clean-checkout" },
  Tests: { runs: "test-unit" },
  Architecture: { runs: "architecture" },
  GithubActions: { runs: "github-actions" },
  GitHygiene: { runs: "git-hygiene" },
  GitHooks: {
    omitted:
      "This repository keeps its own hooks in `.githooks/` (`npm run setup`); the check expects the standard's bundled hooks.",
  },
  LandingPage: { runs: "landing-page" },
  AdoptionMode: {
    omitted:
      "This repository is not adopting the standard: every check here can fail the run, so there is no adoption period to judge.",
  },
  GeneratedRegions: { runs: "generated-regions" },
  PromptBlocks: { runs: "prompt-blocks" },
  EnvContract: { runs: "env-contract" },
  ReadmeStructure: { runs: "readme-structure" },
  ScorecardWorkflow: { runs: "scorecard-workflow" },
  EngineMatrix: { runs: "engine-matrix" },
  ManagedFiles: { runs: "managed-files" },
  PinConsistency: { runs: "pin-consistency" },
  BranchProtection: { runs: "branch-protection" },
  Coverage: { runs: "coverage" },
  Crap: { runs: "crap" },
  Size: { runs: "size" },
  NoMinify: { runs: "no-minify" },
  DistNoUrls: { runs: "dist-no-urls" },
  Duplication: { runs: "duplication" },
  Packaging: { runs: "publint" },
  TypeResolution: { runs: "arethetypeswrong" },
  PackedConsumer: { runs: "packed-consumer" },
  Licenses: { runs: "license" },
  DocsMarkdown: { runs: "docs" },
  BenchmarkGuides: { runs: "benchmark-guides" },
  BenchmarkComplexity: { runs: "benchmark-complexity" },
  BenchmarkCoverage: {
    omitted:
      "Public functions that take several inputs, mostly in `./affected` and `./metrics`, have no benchmark and no `notBenchmarked` reason yet; the check fails until each has one.",
  },
  DocsLinks: { runs: "docs" },
  DocsFragments: { runs: "docs-fragments" },
  Prose: { runs: "prose" },
  Accessibility: { runs: "accessibility" },
  SecurityDeps: { runs: "security-deps" },
  SecurityDevDeps: { runs: "security-dev-deps" },
  SecuritySecrets: { runs: "security-secrets" },
  SecuritySocket: { runs: "security-socket" },
  CodeScanning: { runs: "code-scanning" },
  Suppressions: { runs: "suppression-governance" },
  DeadCode: { runs: "dead-code" },
  Commits: { runs: "commitlint" },
  CodeRabbit: { runs: "coderabbitai" },
  Mutation: { runs: "mutation" },
}

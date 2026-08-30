import type { JsonAssertionResult, JsonTestResult, JsonTestResults } from "vitest/reporters"
import type { ParsedOutput, PolicyResult } from "../../types.js"

type VitestJsonReport = JsonTestResults
type VitestJsonTestSuite = JsonTestResult
type VitestJsonAssertion = JsonAssertionResult

/**
 * Interprets Vitest's own `--reporter=json` output shape -- and nothing
 * else. Shared between the `test` preset (a single, un-categorized
 * `vitest run --reporter=json`) and this repository's own
 * `test-unit`/`test-integration`/`test-property`/`test-e2e` checks, whose
 * `run` splits tests into four mutually exclusive categories via
 * scripts/run-test-category.mjs -- a repository-specific concern this
 * function knows nothing about. Each of those four checks owns its own
 * category-specific semantics on top of this evaluator; this function must
 * stay narrowly scoped to "parse Vitest's JSON reporter shape," never grow
 * into a general "testing policy" abstraction. A category's own
 * `output.success === false` (vitest crashed / produced unparseable output)
 * is kept distinct from a substantive test failure, exactly as every other
 * preset in this package already does via `ParsedOutput.success`.
 * @param output - the vitest check's parsed `--reporter=json` output to evaluate.
 * @returns the pass/fail outcome and its rationale.
 */
export function evaluateVitestJsonPolicy(output: ParsedOutput<unknown> | undefined): PolicyResult {
  if (!output?.success) {
    return { outcome: "fail", rationale: "Vitest output could not be parsed as JSON." }
  }

  const report = output.value as VitestJsonReport

  // `output.value` is `unknown` -- valid JSON that isn't Vitest's reporter
  // shape (a wrapper that printed `{}`, a config dump, a future schema
  // change) must produce a fail verdict, not a TypeError out of the policy
  // that `runPolicies` rethrows as `PolicyThrewError` and rejects the whole
  // `runRepoContract()` promise with. `numFailedTests`/`numFailedTestSuites`
  // being `undefined` (not `0`) already falls through the pass branch below,
  // so `testResults` must be guarded before it is walked.
  if (!Array.isArray(report.testResults)) {
    return { outcome: "fail", rationale: "Vitest produced invalid JSON report data." }
  }

  if (report.numFailedTests === 0 && report.numFailedTestSuites === 0) {
    return {
      outcome: "pass",
      rationale: `Vitest completed ${String(report.numTotalTests)} test(s) with 0 failures across ${String(report.numTotalTestSuites)} suite(s).`,
    }
  }

  const failures = report.testResults.flatMap((suite: VitestJsonTestSuite): string[] =>
    suite.assertionResults
      .filter((test: VitestJsonAssertion) => test.status === "failed")
      .map((test: VitestJsonAssertion) => {
        const location = test.location
          ? `:${String(test.location.line)}:${String(test.location.column)}`
          : ""

        const messages = (test.failureMessages ?? [])
          .map((message: string) => message.trim())
          .filter(Boolean)
          .join(" | ")

        // This mutant (dropping .filter(Boolean).join(" — "), returning the bare array instead)
        // is proven killed under direct, unmocked `vitest run` of
        // test/unit/presets/shared/vitest-json-policy.test.ts -- applying this exact replacement
        // by hand and re-running fails 4 of that file's tests, including two that assert the
        // complete rationale string via `toBe` specifically to make this mutation observable --
        // but it survives every `npx stryker run` against this file (scoped or full, reproduced
        // three times, once with concurrency forced to 1): this mutant's own `coveredBy`/
        // `testsCompleted` show only 6 of the file's 11 tests ever ran against it, never the two
        // `toBe` tests that would kill it. See stryker.config.mjs's own comment for the identical
        // "coverage-attribution quirk" already found and worked around for `perTest` mode -- this
        // is the same class of bug surfacing under `"all"` mode too, for this one line.
        // Stryker disable next-line MethodExpression -- proven killed under direct vitest execution but Stryker's own coverage attribution never runs the two tests that would kill it; see the comment above.
        return [`${suite.name}${location}`, test.fullName, messages].filter(Boolean).join(" — ")
      }),
  )

  return {
    outcome: "fail",
    rationale: [
      `Vitest reported ${String(report.numFailedTests)} failing test(s) across ${String(report.numFailedTestSuites)} failing suite(s):`,
      ...failures.map((failure: string) => `- ${failure}`),
    ].join("\n"),
  }
}

import type { CheckDefinitionConfig } from "../types.js"
import { checkDependencyInstalled } from "./shared/missing-dependency.js"
import { checkTerminatedAbnormally } from "./shared/terminal-status.js"

/**
 * Playwright's own `--reporter=json` contract -- not published as a
 * TypeScript type by the tool. Suites nest (a project, then a file, then
 * `describe` blocks), so failing specs are collected recursively.
 */
interface PlaywrightTestResult {
  readonly status?: string
  readonly error?: { readonly message?: string }
}

interface PlaywrightTest {
  readonly results?: readonly PlaywrightTestResult[]
}

interface PlaywrightSpec {
  readonly title: string
  readonly file?: string
  readonly line?: number
  readonly ok: boolean
  readonly tests?: readonly PlaywrightTest[]
}

interface PlaywrightSuite {
  readonly title: string
  readonly specs?: readonly PlaywrightSpec[]
  readonly suites?: readonly PlaywrightSuite[]
}

interface PlaywrightStats {
  readonly expected: number
  readonly unexpected: number
  readonly flaky: number
  readonly skipped: number
}

interface PlaywrightReport {
  readonly suites?: readonly PlaywrightSuite[]
  readonly stats?: PlaywrightStats
}

/**
 * Recursively collects one human-readable line per failing spec across a (possibly nested) suite tree.
 * @param suites - the suite tree to walk, as `PlaywrightReport.suites` or a suite's own nested `suites`.
 * @returns one rendered `file:line title -- message` line per failing spec, depth-first.
 */
function collectFailingSpecs(suites: readonly PlaywrightSuite[]): string[] {
  const details: string[] = []

  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      if (spec.ok) continue

      const location = spec.line !== undefined ? `:${String(spec.line)}` : ""
      // Provably equivalent, not a coverage gap: whatever non-array/non-test
      // garbage a mutated `?? []` fallback substitutes here, every field
      // access on it below (`.results`, `.error`, `.message`) resolves
      // safely to `undefined` via its own optional chaining -- confirmed by
      // hand-tracing both fallback sites -- converging on the exact same
      // `message: undefined` this line already produces for a genuinely
      // empty `spec.tests`/`t.results`. No test can observe a difference.
      // Stryker disable next-line ArrayDeclaration -- any fallback garbage here resolves safely to undefined via optional chaining below, same as a genuinely empty array
      const lastResult = (spec.tests ?? []).flatMap((t) => t.results ?? []).at(-1)
      const message = lastResult?.error?.message?.trim()

      details.push(
        `${spec.file ?? suite.title}${location} ${spec.title}${message ? ` — ${message}` : ""}`,
      )
    }

    if (suite.suites) details.push(...collectFailingSpecs(suite.suites))
  }

  return details
}

/** End-to-end test execution via Playwright, reading its JSON reporter output. */
export const e2e: CheckDefinitionConfig = {
  run: ["playwright", "test", "--reporter=json"],
  output: { format: "json" },
  policy: ({ result }) => {
    const missing = checkDependencyInstalled(result, "@playwright/test")
    if (missing) return missing

    const terminated = checkTerminatedAbnormally(result, "Playwright")
    if (terminated) return terminated

    if (!result.output?.success) {
      return { outcome: "fail", rationale: "Playwright output could not be parsed as JSON." }
    }

    // `output.success` only means `JSON.parse` didn't throw -- `value` is `unknown` at
    // runtime. Guard it is a real object before trusting the cast, matching how
    // dead-code.ts / duplication.ts guard theirs, so `.stats` never throws out of the policy.
    const value: unknown = result.output.value

    if (typeof value !== "object" || value === null) {
      return { outcome: "fail", rationale: "Playwright produced invalid JSON report data." }
    }

    const report = value as PlaywrightReport
    const stats = report.stats

    if (!stats) {
      return { outcome: "fail", rationale: "Playwright produced invalid JSON report data." }
    }

    if (stats.unexpected === 0 && stats.flaky === 0) {
      return {
        outcome: "pass",
        rationale: `Playwright completed ${String(stats.expected)} test(s) with 0 unexpected failures.`,
      }
    }

    if (stats.unexpected > 0) {
      // Provably equivalent, not a coverage gap: collectFailingSpecs itself
      // only ever reads `.specs`/`.suites` off each element via safe
      // optional chaining (see its own comment), so substituting any
      // non-suite garbage for a genuinely absent `report.suites` still
      // yields zero collected detail lines either way.
      // Stryker disable next-line ArrayDeclaration -- collectFailingSpecs only reads .specs/.suites via safe optional chaining, so fallback garbage yields zero details either way
      const details = collectFailingSpecs(report.suites ?? [])

      return {
        outcome: "fail",
        rationale: [
          `Playwright reported ${String(stats.unexpected)} unexpected failure(s):`,
          ...details.map((detail) => `- ${detail}`),
        ].join("\n"),
      }
    }

    return {
      outcome: "warn",
      rationale: `Playwright completed with ${String(stats.flaky)} flaky test(s) that eventually passed on retry.`,
    }
  },
}

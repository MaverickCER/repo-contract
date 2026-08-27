import { cruise } from "dependency-cruiser"
import { describe, expect, it } from "vitest"

/**
 * Proves the layering-rule *mechanism* .dependency-cruiser.cjs relies on is
 * sound -- both that a forbidden import direction is actually flagged (a
 * true positive) and that a legitimate one is not (a true negative) -- using
 * small, dedicated fixture module trees under ./fixtures/ shaped like the
 * real src/execution -> src/policy (forbidden) and src/evidence ->
 * src/execution (permitted) relationships ADR 0001 describes. This is rule
 * *quality*, distinct from rule *existence*: an overly-broad rule that
 * rejects legitimate architecture would fail the true-negative case here
 * even though the rule "exists" and technically runs.
 *
 * Uses dependency-cruiser's own Node API directly against the fixture
 * files -- never spawns the `depcruise` CLI or touches the real
 * .dependency-cruiser.cjs/src/ (see scripts/check-architecture.mjs for
 * that).
 */
describe(".dependency-cruiser.cjs-style layering rules -- true positive / true negative", () => {
  it("flags a forbidden import direction (execution-shaped -> policy-shaped)", async () => {
    const result = await cruise(["test/unit/architecture/fixtures/violating"], {
      outputType: "json",
      validate: true,
      ruleSet: {
        forbidden: [
          {
            name: "no-execution-to-policy",
            severity: "error",
            from: { path: "fixtures/violating/execution" },
            to: { path: "fixtures/violating/policy" },
          },
        ],
      },
      tsPreCompilationDeps: true,
      tsConfig: { fileName: "tsconfig.json" },
    })

    const parsed = JSON.parse(result.output as string) as {
      summary: { violations: readonly { rule: { name: string } }[] }
    }

    expect(parsed.summary.violations).toHaveLength(1)
    expect(parsed.summary.violations[0]?.rule.name).toBe("no-execution-to-policy")
  })

  it("does not flag a legitimate import direction (evidence-shaped -> execution-shaped)", async () => {
    const result = await cruise(["test/unit/architecture/fixtures/clean"], {
      outputType: "json",
      validate: true,
      ruleSet: {
        forbidden: [
          // Mirrors .dependency-cruiser.cjs's real
          // execution-must-not-import-evidence-or-policy rule's exact shape (from: execution, to:
          // evidence), applied to this fixture's one real edge -- evidence/build.ts importing
          // execution/run.ts, the *opposite* direction. A rule engine that matched from/to as an
          // unordered pair (rather than strictly directional) would wrongly flag this edge too;
          // this fails loudly if that regresses, rather than testing an unrelated `to: policy`
          // pattern the fixture's one real edge could never match regardless of directionality.
          {
            name: "no-execution-to-evidence",
            severity: "error",
            from: { path: "fixtures/clean/execution" },
            to: { path: "fixtures/clean/evidence" },
          },
        ],
      },
      tsPreCompilationDeps: true,
      tsConfig: { fileName: "tsconfig.json" },
    })

    const parsed = JSON.parse(result.output as string) as {
      summary: { violations: readonly unknown[]; totalCruised: number }
    }

    expect(parsed.summary.violations).toHaveLength(0)
    // Confirms the clean fixture was actually analyzed (not silently
    // skipped, which would make the "0 violations" assertion vacuous).
    expect(parsed.summary.totalCruised).toBe(2)
  })
})

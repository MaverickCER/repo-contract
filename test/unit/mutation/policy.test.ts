import { beforeEach, describe, expect, it, vi } from "vitest"
import { mutation } from "../../../checks/mutation.js"
import { deriveSuppressionId } from "../../../scripts/suppression-governance/evidence-types.js"
import type {
  SuppressionExceptionRecord,
  SuppressionFinding,
} from "../../../scripts/suppression-governance/evidence-types.js"
import type { CheckEvidence, Evidence, PolicyContext } from "../../../src/types.js"

// Same real-fs-collision rationale as test/unit/presets/duplication.test.ts (and
// test/unit/presets/security-secrets.test.ts, which reads its own JSON report the same
// dynamic-`import("node:fs/promises")` way `checks/mutation.ts` does) -- mutation's own policy
// reads a fixed relative path with no injectable cwd, and this repository's own `mutation` check
// touches that exact same real path concurrently during `npm run contract`.
const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }))
vi.mock("node:fs/promises", () => ({ readFile }))

beforeEach(() => {
  readFile.mockReset()
})

function fakeCheckEvidence(overrides: Partial<CheckEvidence> = {}): CheckEvidence {
  return {
    command: "tool",
    args: [],
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    status: "completed",
    ...overrides,
  }
}

function contextWithDependencies(
  dependencies: Readonly<Record<string, CheckEvidence>>,
): PolicyContext {
  const result = fakeCheckEvidence()
  const evidence: Evidence = {
    version: 1,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    checks: {},
  }
  return { result, evidence, dependencies }
}

// Builds the parsed `suppression-governance` evidence a `dependencies["suppression-governance"]`
// carries, from a list of (finding, record) pairs plus any stale records.
function suppressionGovernanceEvidence(input: {
  readonly pairs?: readonly {
    readonly finding: SuppressionFinding
    readonly record: SuppressionExceptionRecord
  }[]
  readonly stale?: readonly SuppressionExceptionRecord[]
  readonly ok?: false
  readonly error?: string
}): CheckEvidence {
  if (input.ok === false) {
    return fakeCheckEvidence({
      output: { format: "json", success: true, value: { ok: false, error: input.error } },
    })
  }
  const pairs = input.pairs ?? []
  const activeExceptions: Record<string, SuppressionExceptionRecord> = {}
  for (const { finding, record } of pairs) activeExceptions[finding.id] = record
  return fakeCheckEvidence({
    output: {
      format: "json",
      success: true,
      value: {
        ok: true,
        registryPath: ".repo-contract/exceptions/disable-comments.json",
        findings: pairs.map((pair) => pair.finding),
        activeExceptions,
        staleExceptions: input.stale ?? [],
        scaffoldedIds: [],
      },
    },
  })
}

function strykerFinding(overrides: Partial<SuppressionFinding> = {}): SuppressionFinding {
  const base = {
    domain: "stryker",
    rule: ["ConditionalExpression"],
    file: "src/example.ts",
    line: 10,
    content: "Stryker disable next-line ConditionalExpression -- reason text",
    reason: "reason text",
    ...overrides,
  }
  return { ...base, id: deriveSuppressionId(base) }
}

function strykerRecord(
  finding: SuppressionFinding,
  overrides: Partial<SuppressionExceptionRecord> = {},
): SuppressionExceptionRecord {
  return {
    id: finding.id,
    version: 1,
    justification: "Why this is deliberately bypassed, alternatives considered, finding confirmed.",
    category: "equivalent-mutant",
    domain: finding.domain,
    file: finding.file,
    line: finding.line,
    rule: [...finding.rule],
    verificationMethod: "mutation-run",
    ...overrides,
  }
}

function fullyJustifiedPair(): {
  finding: SuppressionFinding
  record: SuppressionExceptionRecord
} {
  const finding = strykerFinding()
  return { finding, record: strykerRecord(finding) }
}

function strykerReport(mutants: readonly Record<string, unknown>[]): unknown {
  return {
    schemaVersion: "1",
    files: { "src/example.ts": { language: "typescript", source: "", mutants } },
  }
}

function killedMutant(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    mutatorName: "ConditionalExpression",
    replacement: "true",
    status: "Killed",
    ...overrides,
  }
}

function commentIgnoredMutant(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 2,
    mutatorName: "ConditionalExpression",
    replacement: "true",
    status: "Ignored",
    statusReason: "Ignored using a comment",
    ...overrides,
  }
}

describe("mutation policy", () => {
  it("fails when Stryker did not produce its expected JSON report", async () => {
    readFile.mockRejectedValue(new Error("ENOENT"))
    const result = await mutation.policy(contextWithDependencies({}))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("did not produce its expected JSON report")
  })

  it("fails when the report file contains invalid JSON", async () => {
    readFile.mockResolvedValue("not json")
    const result = await mutation.policy(contextWithDependencies({}))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("invalid JSON evidence")
  })

  it("fails with a clear rationale, instead of throwing, when the report has no files object", async () => {
    readFile.mockResolvedValue(JSON.stringify({ schemaVersion: "1" }))
    const result = await mutation.policy(contextWithDependencies({}))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain('"files" object')
  })

  it("fails with a clear rationale, instead of throwing, when the report's files field is null", async () => {
    readFile.mockResolvedValue(JSON.stringify({ schemaVersion: "1", files: null }))
    const result = await mutation.policy(contextWithDependencies({}))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain('"files" object')
  })

  it("fails when Stryker produced no mutants", async () => {
    readFile.mockResolvedValue(JSON.stringify(strykerReport([])))
    const result = await mutation.policy(contextWithDependencies({}))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Stryker produced no mutants")
  })

  it("passes on killed mutants alone -- the suppression gate is skipped entirely with no comment-ignored mutants", async () => {
    readFile.mockResolvedValue(JSON.stringify(strykerReport([killedMutant()])))
    const result = await mutation.policy(contextWithDependencies({}))
    expect(result.outcome).toBe("pass")
  })

  it("fails on a Survived mutant regardless of the suppression gate", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(
        strykerReport([{ id: 3, mutatorName: "X", replacement: "y", status: "Survived" }]),
      ),
    )
    const result = await mutation.policy(contextWithDependencies({}))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Survived")
  })

  it("fails on an Ignored mutant whose statusReason is not the comment-ignore marker", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(
        strykerReport([
          {
            id: 4,
            mutatorName: "X",
            replacement: "y",
            status: "Ignored",
            statusReason: "Ignored because of excludedMutations config",
          },
        ]),
      ),
    )
    const result = await mutation.policy(contextWithDependencies({}))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Unjustified ignores")
  })

  it("accepts RuntimeError and CompileError mutants", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(
        strykerReport([
          { id: 5, mutatorName: "X", replacement: "y", status: "RuntimeError" },
          { id: 6, mutatorName: "X", replacement: "y", status: "CompileError" },
        ]),
      ),
    )
    const result = await mutation.policy(contextWithDependencies({}))
    expect(result.outcome).toBe("pass")
  })

  it("accepts a static mutant skipped by the config-level ignoreStatic option, without consulting the suppression gate", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(
        strykerReport([
          killedMutant(),
          {
            id: 7,
            mutatorName: "X",
            replacement: "y",
            status: "Ignored",
            statusReason: 'Static mutant (and "ignoreStatic" was enabled)',
          },
        ]),
      ),
    )
    const result = await mutation.policy(contextWithDependencies({}))
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("1 Static (ignoreStatic)")
    expect(result.rationale).not.toContain("Unjustified ignores")
  })

  it("accepts a comment-ignored mutant when every Stryker-domain registry record is fully justified", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(strykerReport([killedMutant(), commentIgnoredMutant()])),
    )
    const dependencies = {
      "suppression-governance": suppressionGovernanceEvidence({ pairs: [fullyJustifiedPair()] }),
    }
    const result = await mutation.policy(contextWithDependencies(dependencies))
    expect(result.outcome).toBe("pass")
  })

  it("rejects a comment-ignored mutant when a Stryker-domain registry record is under-justified, naming it", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(strykerReport([killedMutant(), commentIgnoredMutant()])),
    )
    const finding = strykerFinding()
    const dependencies = {
      "suppression-governance": suppressionGovernanceEvidence({
        pairs: [{ finding, record: strykerRecord(finding, { justification: "" }) }],
      }),
    }
    const result = await mutation.policy(contextWithDependencies(dependencies))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Stryker suppressions")
    expect(result.rationale).toContain("src/example.ts:10")
  })

  it("ignores a non-stryker registry record entirely, even if under-justified", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(strykerReport([killedMutant(), commentIgnoredMutant()])),
    )
    const finding = strykerFinding({
      domain: "eslint",
      rule: ["no-console"],
      content: "eslint-disable-next-line no-console",
      reason: "",
    })
    const dependencies = {
      "suppression-governance": suppressionGovernanceEvidence({
        pairs: [
          { finding, record: strykerRecord(finding, { justification: "", domain: "eslint" }) },
        ],
      }),
    }
    const result = await mutation.policy(contextWithDependencies(dependencies))
    expect(result.outcome).toBe("pass")
  })

  it("rejects a comment-ignored mutant when suppression-governance's dependency evidence is missing entirely", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(strykerReport([killedMutant(), commentIgnoredMutant()])),
    )
    const result = await mutation.policy(contextWithDependencies({}))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Stryker suppression registry unverifiable")
  })

  it("fails specifically because of an unrelated, under-justified Stryker record -- proving a true global gate, not an incidental per-mutant match", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(strykerReport([killedMutant(), commentIgnoredMutant()])),
    )
    // Fully justified, at the exact location of the reported comment-ignored mutant.
    const related = fullyJustifiedPair()
    // Insufficient, and deliberately at a different file/line, unrelated to the reported mutant --
    // Stryker's own report gives no per-mutant back-reference to a specific disable comment, so
    // this must still fail the whole check.
    const unrelatedFinding = strykerFinding({
      file: "src/unrelated-other-file.ts",
      line: 999,
      content: "Stryker disable next-line ConditionalExpression -- unrelated reason",
      reason: "unrelated reason",
    })
    const dependencies = {
      "suppression-governance": suppressionGovernanceEvidence({
        pairs: [
          related,
          {
            finding: unrelatedFinding,
            record: strykerRecord(unrelatedFinding, { justification: "" }),
          },
        ],
      }),
    }
    const result = await mutation.policy(contextWithDependencies(dependencies))
    expect(result.outcome).toBe("fail")
    // The unrelated record must be named -- not merely that *something* failed.
    expect(result.rationale).toContain("src/unrelated-other-file.ts:999")
    // And the fully-justified record must not itself be flagged as an offender.
    expect(result.rationale).not.toContain("src/example.ts:10")
  })

  it("rejects a comment-ignored mutant when suppression-governance's own evidence is ok: false", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(strykerReport([killedMutant(), commentIgnoredMutant()])),
    )
    const dependencies = {
      "suppression-governance": suppressionGovernanceEvidence({
        ok: false,
        error: ".repo-contract/exceptions/disable-comments.json failed validation.",
      }),
    }
    const result = await mutation.policy(contextWithDependencies(dependencies))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Stryker suppression registry unverifiable")
  })

  it("fails on a NoCoverage mutant regardless of the suppression gate", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(
        strykerReport([{ id: 7, mutatorName: "X", replacement: "y", status: "NoCoverage" }]),
      ),
    )
    const result = await mutation.policy(contextWithDependencies({}))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("No coverage")
    expect(result.rationale).toContain("1 No coverage")
  })

  it("fails on a Timeout mutant regardless of the suppression gate", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(
        strykerReport([{ id: 8, mutatorName: "X", replacement: "y", status: "Timeout" }]),
      ),
    )
    const result = await mutation.policy(contextWithDependencies({}))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Timed out")
    expect(result.rationale).toContain("1 Timed out")
  })

  it("fails on a mutant status this policy does not recognize, rather than silently accepting it", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(
        strykerReport([
          // A real value the type declares as StrykerMutantStatus, but the runtime JSON isn't
          // trusted to actually match -- see this file's own KNOWN_MUTANT_STATUSES comment.
          { id: 9, mutatorName: "X", replacement: "y", status: "Pending" },
        ]),
      ),
    )
    const result = await mutation.policy(contextWithDependencies({}))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Unexpected statuses")
    expect(result.rationale).toContain("1 Unknown")
  })

  it("renders a mutant's exact file:line:column when its report entry carries a location", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(
        strykerReport([
          {
            id: 10,
            mutatorName: "ConditionalExpression",
            replacement: "false",
            status: "Survived",
            location: { start: { line: 42, column: 7 }, end: { line: 42, column: 12 } },
          },
        ]),
      ),
    )
    const result = await mutation.policy(contextWithDependencies({}))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("src/example.ts:42:7")
  })

  it("falls back to the bare file path when a mutant's report entry carries no location", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(
        strykerReport([{ id: 11, mutatorName: "X", replacement: "y", status: "Survived" }]),
      ),
    )
    const result = await mutation.policy(contextWithDependencies({}))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("src/example.ts — X: y")
  })

  it("computes the exact mutation score from Killed/RuntimeError/CompileError against every applicable mutant", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(
        strykerReport([
          killedMutant({ id: 12 }),
          { id: 13, mutatorName: "X", replacement: "y", status: "Survived" },
        ]),
      ),
    )
    const result = await mutation.policy(contextWithDependencies({}))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Detected mutation score: 50.00% (2 Total).")
  })

  it("excludes a justified comment-ignored mutant from the score's denominator, not just its numerator", async () => {
    readFile.mockResolvedValue(
      JSON.stringify(strykerReport([killedMutant({ id: 14 }), commentIgnoredMutant({ id: 15 })])),
    )
    const dependencies = {
      "suppression-governance": suppressionGovernanceEvidence({ pairs: [fullyJustifiedPair()] }),
    }
    const result = await mutation.policy(contextWithDependencies(dependencies))
    expect(result.outcome).toBe("pass")
    // 1 Killed / 1 applicable (the Ignored mutant is excluded from applicableMutants entirely) --
    // if it were wrongly counted in the denominator this would read 50.00%, not 100.00%.
    expect(result.rationale).toContain("Detected mutation score: 100.00% (2 Total).")
  })
})

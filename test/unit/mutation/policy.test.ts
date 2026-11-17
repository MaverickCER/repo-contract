import { beforeEach, describe, expect, it, vi } from "vitest"
import { mutation } from "../../../checks/mutation.js"
import { deriveSuppressionId } from "../../../scripts/suppression-governance/evidence-types.js"
import type {
  SuppressionExceptionRecord,
  SuppressionFinding,
} from "../../../scripts/suppression-governance/evidence-types.js"
import type { CheckEvidence, Evidence, PolicyContext } from "../../../src/types.js"

// The wrapper and the preset under it read the Stryker report, and the preset reads the mutation
// registry, through node:fs/promises. The real files are what `npm run contract` writes, so a
// test must never touch them.
// The registry loader probes for a symbolic link first; here no path exists to be one.
const { readFile, lstat } = vi.hoisted(() => ({
  readFile: vi.fn(),
  lstat: () => Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
}))
vi.mock("node:fs/promises", () => ({ readFile, lstat }))

const REPORT = "reports/mutation/mutation.json"

/** Serves `report` at the report path; every other file, the registry included, is missing. */
function serveReport(report: unknown): void {
  readFile.mockImplementation((file: string) =>
    file === REPORT
      ? Promise.resolve(JSON.stringify(report))
      : Promise.reject(Object.assign(new Error(`ENOENT: ${file}`), { code: "ENOENT" })),
  )
}

beforeEach(() => {
  readFile.mockReset()
})

function fakeCheckEvidence(overrides: Partial<CheckEvidence> = {}): CheckEvidence {
  return {
    command: "node",
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

function runReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    state: "ran",
    report: REPORT,
    exitCode: 0,
    shard: null,
    mutate: null,
    timeouts: { rerun: 0, caught: 0 },
    inputs: null,
    message: "Stryker ran every mutant cold.",
    ...overrides,
  }
}

function context(
  dependencies: Readonly<Record<string, CheckEvidence>> = {},
  run: unknown = runReport(),
): PolicyContext {
  const result = fakeCheckEvidence({ output: { format: "json", success: true, value: run } })
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

const SOURCE = "export const x = a ? b : c\n"

function strykerReport(mutants: readonly Record<string, unknown>[]): unknown {
  return {
    schemaVersion: "1",
    files: { "src/example.ts": { language: "typescript", source: SOURCE, mutants } },
  }
}

function mutant(status: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "1",
    mutatorName: "ConditionalExpression",
    replacement: "true",
    status,
    testsCompleted: 1,
    location: { start: { line: 1, column: 18 }, end: { line: 1, column: 27 } },
    ...overrides,
  }
}

const commentIgnored = (): Record<string, unknown> =>
  mutant("Ignored", { id: "2", statusReason: "Ignored using a comment" })

const justified = (): Record<string, CheckEvidence> => ({
  "suppression-governance": suppressionGovernanceEvidence({ pairs: [fullyJustifiedPair()] }),
})

describe("repo-contract's own mutation check: the preset at 100 plus two private rules", () => {
  it("runs the preset's command from bin/, at a score floor of 100, against stryker.config.mjs", () => {
    expect(mutation.run).toEqual([
      "node",
      "bin/repo-contract.mjs",
      "mutation",
      "run",
      "--json",
      "--cache",
      "off",
      "--confirm-timeouts",
      "5",
      "--config",
      "stryker.config.mjs",
    ])
    expect(mutation.isolated).toBe(true)
    expect(mutation.output).toEqual({ format: "json" })
  })

  it("passes on killed mutants alone, with the preset's own rationale", async () => {
    serveReport(strykerReport([mutant("Killed")]))
    const result = await mutation.policy(context())
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("score 100.00% of 1 scored mutants (minimum 100%)")
  })

  it("fails a single survivor: the floor is 100", async () => {
    serveReport(strykerReport([mutant("Killed"), mutant("Survived", { id: "3" })]))
    const result = await mutation.policy(context())
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Below the minimum score of 100%")
  })

  it("accepts a static mutant without consulting the suppression gate", async () => {
    serveReport(
      strykerReport([
        mutant("Killed"),
        mutant("Ignored", {
          id: "7",
          statusReason: 'Static mutant (and "ignoreStatic" was enabled)',
        }),
      ]),
    )
    const result = await mutation.policy(context())
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("static, skipped by ignoreStatic")
  })

  it("fails an Ignored mutant left out for any other reason, naming it and its reason", async () => {
    serveReport(
      strykerReport([
        mutant("Killed"),
        mutant("Ignored", { id: "8", statusReason: "Excluded by mutator.excludedMutations" }),
      ]),
    )
    const result = await mutation.policy(context(justified()))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Ignored without a reviewed reason (1)")
    expect(result.rationale).toContain(
      'src/example.ts:1:18 [ConditionalExpression] "a ? b : c" -> "true" (Excluded by mutator.excludedMutations)',
    )
  })

  it("fails an Ignored mutant with no reason at all", async () => {
    serveReport(strykerReport([mutant("Killed"), mutant("Ignored", { id: "9" })]))
    const result = await mutation.policy(context())
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("(no reason given)")
  })

  it("accepts a comment-ignored mutant when every Stryker-domain record is fully justified", async () => {
    serveReport(strykerReport([mutant("Killed"), commentIgnored()]))
    const result = await mutation.policy(context(justified()))
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("ignored by a Stryker disable comment")
  })

  it("rejects a comment-ignored mutant when a Stryker-domain record is under-justified, naming it", async () => {
    serveReport(strykerReport([mutant("Killed"), commentIgnored()]))
    const finding = strykerFinding()
    const dependencies = {
      "suppression-governance": suppressionGovernanceEvidence({
        pairs: [{ finding, record: strykerRecord(finding, { justification: "" }) }],
      }),
    }
    const result = await mutation.policy(context(dependencies))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Under-justified or stale Stryker suppressions (1):")
    expect(result.rationale).toContain("src/example.ts:10")
  })

  it("rejects a comment-ignored mutant when a Stryker-domain record is stale", async () => {
    serveReport(strykerReport([mutant("Killed"), commentIgnored()]))
    const stale = strykerRecord(strykerFinding({ line: 77 }))
    const dependencies = {
      "suppression-governance": suppressionGovernanceEvidence({
        pairs: [fullyJustifiedPair()],
        stale: [stale],
      }),
    }
    const result = await mutation.policy(context(dependencies))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain(
      `- stale: ${JSON.stringify(stale.id)} (directive gone; delete this entry)`,
    )
  })

  it("does not judge a stale record of another domain", async () => {
    serveReport(strykerReport([mutant("Killed"), commentIgnored()]))
    const stale = strykerRecord(strykerFinding({ line: 77 }), { domain: "eslint" })
    const dependencies = {
      "suppression-governance": suppressionGovernanceEvidence({
        pairs: [fullyJustifiedPair()],
        stale: [stale],
      }),
    }
    const result = await mutation.policy(context(dependencies))
    expect(result.outcome).toBe("pass")
  })

  it("ignores an under-justified record of another domain", async () => {
    serveReport(strykerReport([mutant("Killed"), commentIgnored()]))
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
    const result = await mutation.policy(context(dependencies))
    expect(result.outcome).toBe("pass")
  })

  it("rejects a comment-ignored mutant when suppression-governance left no evidence", async () => {
    serveReport(strykerReport([mutant("Killed"), commentIgnored()]))
    const result = await mutation.policy(context())
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain(
      "Stryker suppression registry unverifiable: suppression-governance produced no usable evidence.",
    )
  })

  it("rejects a comment-ignored mutant when suppression-governance's output did not parse", async () => {
    serveReport(strykerReport([mutant("Killed"), commentIgnored()]))
    const dependencies = {
      "suppression-governance": fakeCheckEvidence({
        output: { format: "json", success: false, error: "Unexpected token" },
      }),
    }
    const result = await mutation.policy(context(dependencies))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("produced no usable evidence")
  })

  it("rejects a comment-ignored mutant when suppression-governance's evidence is ok: false", async () => {
    serveReport(strykerReport([mutant("Killed"), commentIgnored()]))
    const dependencies = {
      "suppression-governance": suppressionGovernanceEvidence({
        ok: false,
        error: ".repo-contract/exceptions/disable-comments.json failed validation.",
      }),
    }
    const result = await mutation.policy(context(dependencies))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain(
      "Stryker suppression registry unverifiable: .repo-contract/exceptions/disable-comments.json failed validation.",
    )
  })

  it("gates globally: an unrelated under-justified Stryker record fails the run", async () => {
    serveReport(strykerReport([mutant("Killed"), commentIgnored()]))
    const unrelated = strykerFinding({
      file: "src/unrelated-other-file.ts",
      line: 999,
      content: "Stryker disable next-line ConditionalExpression -- unrelated reason",
      reason: "unrelated reason",
    })
    const dependencies = {
      "suppression-governance": suppressionGovernanceEvidence({
        pairs: [
          fullyJustifiedPair(),
          { finding: unrelated, record: strykerRecord(unrelated, { justification: "" }) },
        ],
      }),
    }
    const result = await mutation.policy(context(dependencies))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("src/unrelated-other-file.ts:999")
    expect(result.rationale).not.toContain("src/example.ts:10")
  })

  it("keeps the preset's failure and adds its own when both fail", async () => {
    serveReport(strykerReport([mutant("Survived", { id: "3" }), mutant("Ignored", { id: "8" })]))
    const result = await mutation.policy(context())
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Below the minimum score of 100%")
    expect(result.rationale).toContain("Ignored without a reviewed reason (1)")
  })

  it("returns the preset's verdict untouched, reading nothing, when the run reported an error", async () => {
    const result = await mutation.policy(
      context({}, runReport({ state: "error", message: "Stryker could not start." })),
    )
    expect(result).toEqual({ outcome: "fail", rationale: "Mutation: Stryker could not start." })
    expect(readFile).not.toHaveBeenCalled()
  })

  it("returns the preset's pass untouched when there was nothing to mutate", async () => {
    const result = await mutation.policy(
      context({}, runReport({ state: "nothing-to-mutate", message: "Nothing to mutate." })),
    )
    expect(result).toEqual({ outcome: "pass", rationale: "Mutation: Nothing to mutate." })
    expect(readFile).not.toHaveBeenCalled()
  })

  it("returns the preset's verdict when the command printed no run report", async () => {
    const result = await mutation.policy(context({}, { schemaVersion: 2 }))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("printed an invalid report")
    expect(readFile).not.toHaveBeenCalled()
  })

  it("returns the preset's verdict when the report cannot be read", async () => {
    serveReport(undefined)
    readFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
    const result = await mutation.policy(context())
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toBe(`Mutation: cannot read the Stryker report ${REPORT}.`)
  })

  it("fails when the run judged a report other than the one stryker.config.mjs writes", async () => {
    readFile.mockImplementation((file: string) =>
      file === "elsewhere.json"
        ? Promise.resolve(JSON.stringify(strykerReport([mutant("Killed")])))
        : Promise.reject(Object.assign(new Error(`ENOENT: ${file}`), { code: "ENOENT" })),
    )
    const result = await mutation.policy(
      context({}, runReport({ state: "adopted", report: "elsewhere.json" })),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain(
      `The run judged elsewhere.json, not ${REPORT}, so its ignored mutants cannot be checked.`,
    )
  })

  it("returns the preset's verdict when the report has no files object", async () => {
    serveReport({ schemaVersion: "1" })
    const result = await mutation.policy(context())
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toBe(
      'Mutation: The mutation report is not an object with a "files" object.',
    )
  })
})

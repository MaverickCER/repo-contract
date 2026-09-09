import { describe, expect, it } from "vitest"
import { evaluateDeadCodePolicy } from "../../../checks/dead-code.js"
import type {
  DeadCodeEvidence,
  DeadCodeExceptionRecord,
  DeadCodeFinding,
} from "../../../scripts/dead-code/evidence-types.js"
import { deriveDeadCodeId } from "../../../scripts/dead-code/evidence-types.js"
import { createDeadCodeStub } from "../../../scripts/dead-code/registry.js"

function finding(kind: string, name: string): DeadCodeFinding {
  return {
    id: deriveDeadCodeId({ kind: kind as never, name }),
    kind: kind as never,
    name,
    file: "package.json",
    location: "",
  }
}

function record(from: DeadCodeFinding, justification: string): DeadCodeExceptionRecord {
  return { ...createDeadCodeStub(from, from.id), justification }
}

function evidence(
  pairs: readonly { readonly finding: DeadCodeFinding; readonly justification: string }[],
  extras: {
    readonly stale?: readonly DeadCodeExceptionRecord[]
    readonly registryError?: readonly string[]
  } = {},
): DeadCodeEvidence {
  const activeExceptions: Record<string, DeadCodeExceptionRecord> = {}
  for (const p of pairs) activeExceptions[p.finding.id] = record(p.finding, p.justification)
  return {
    ok: true,
    registryPath: ".repo-contract/exceptions/dead-code.json",
    findings: pairs.map((p) => p.finding),
    activeExceptions,
    staleExceptions: extras.stale ?? [],
    scaffoldedIds: [],
    ...(extras.registryError !== undefined ? { registryError: extras.registryError } : {}),
  }
}

describe("evaluateDeadCodePolicy", () => {
  it("passes with 0 findings", () => {
    const result = evaluateDeadCodePolicy({ evidence: evidence([]) })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("0 issues")
  })

  it("passes when every finding has a non-empty justification", () => {
    const f = finding("unused-dev-dependency", "oxlint")
    const result = evaluateDeadCodePolicy({
      evidence: evidence([{ finding: f, justification: "Spawned by name; never imported." }]),
    })
    expect(result.outcome).toBe("pass")
  })

  it("fails a finding backed by a blank justification, naming kind/name/location", () => {
    const f = finding("unused-export", "foo")
    const result = evaluateDeadCodePolicy({
      evidence: evidence([{ finding: f, justification: "" }]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("unused-export")
    expect(result.rationale).toContain("foo")
  })

  it("fails on a stale record whose finding is gone", () => {
    const gone = finding("unused-dev-dependency", "curl")
    const result = evaluateDeadCodePolicy({
      evidence: evidence([], { stale: [record(gone, "was needed once")] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Stale record")
    expect(result.rationale).toContain(gone.id)
  })

  it("fails on a registryError", () => {
    const result = evaluateDeadCodePolicy({
      evidence: evidence([], { registryError: ["exceptions[0] is broken"] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("failed to load or reconcile")
  })

  it("fails when the check itself could not run", () => {
    const result = evaluateDeadCodePolicy({
      evidence: { ok: false, error: "The `knip` CLI is not installed." },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("knip")
  })

  it("fails on a broken bijection", () => {
    const f = finding("unused-export", "foo")
    const result = evaluateDeadCodePolicy({
      evidence: {
        ok: true,
        registryPath: ".repo-contract/exceptions/dead-code.json",
        findings: [f],
        activeExceptions: {},
        staleExceptions: [],
        scaffoldedIds: [],
      },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("bijection")
  })
})

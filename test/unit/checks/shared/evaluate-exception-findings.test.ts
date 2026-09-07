import { describe, expect, it } from "vitest"
import {
  evaluateExceptionFindings,
  stageMissingFields,
} from "../../../../checks/shared/evaluate-exception-findings.js"
import { isVerified } from "../../../../scripts/shared/exception-record.js"
import type { ExceptionVerification } from "../../../../scripts/shared/exception-record.js"
import { evaluateExceptionRecord, hashRequirementFields } from "../../../../src/helpers/index.js"
import type { ExceptionPolicyConfig } from "../../../../src/helpers/index.js"

interface Finding {
  readonly id: string
  readonly category: string
}

interface Record_ {
  readonly id: string
  readonly justification: string
  readonly verification?: ExceptionVerification
}

function finding(overrides: Partial<Finding> = {}): Finding {
  return { id: "f1", category: "medium", ...overrides }
}

function record(overrides: Partial<Record_> = {}): Record_ {
  return { id: "f1", justification: "", ...overrides }
}

const matchById = (item: Finding, records: readonly Record_[]): Record_ | undefined =>
  records.find((r) => r.id === item.id)

const POLICY: ExceptionPolicyConfig = {
  g: {
    rules: {
      high: { mode: "forbidden" },
      medium: { mode: "exception", requirements: ["justification"] },
      low: { mode: "allowed" },
    },
  },
}

function fieldValue(rec: Record_, requirement: string): string {
  if (requirement === "justification") return rec.justification
  return ""
}

function evaluate(item: Finding, rec: Record_) {
  return evaluateExceptionRecord({
    record: rec,
    classifications: [{ group: "g", category: item.category }],
    config: POLICY,
    globalDefault: { mode: "forbidden" },
    fieldValue,
  })
}

describe("evaluateExceptionFindings", () => {
  it("matches each item to its record via matchRecord and evaluates it", () => {
    const items = [finding({ id: "f1", category: "medium" })]
    const records = [record({ id: "f1", justification: "Because." })]

    const result = evaluateExceptionFindings({ items, records, matchRecord: matchById, evaluate })

    expect(result.matched).toHaveLength(1)
    expect(result.matched[0]?.determinant.verdict).toBe("permitted")
    expect(result.unmatchedFindings).toEqual([])
    expect(result.staleExceptions).toEqual([])
  })

  it("reports an exception-mode finding with no backing record as unmatched, not as automatically failing or passing", () => {
    const items = [finding({ id: "f1", category: "medium" })]
    const result = evaluateExceptionFindings({
      items,
      records: [],
      matchRecord: matchById,
      evaluate,
    })

    expect(result.matched).toEqual([])
    expect(result.unmatchedFindings).toEqual(items)
  })

  it("reports a record matching nothing this run as stale", () => {
    const records = [record({ id: "gone", justification: "Because." })]
    const result = evaluateExceptionFindings({
      items: [],
      records,
      matchRecord: matchById,
      evaluate,
    })

    expect(result.staleExceptions).toEqual(records)
  })

  it("summary reports accurate counts across matched verdicts, unmatched findings, and stale records", () => {
    const items = [
      finding({ id: "forbidden-one", category: "high" }),
      finding({ id: "insufficient-one", category: "medium" }),
      finding({ id: "permitted-one", category: "medium" }),
      finding({ id: "unmatched-one", category: "medium" }),
    ]
    const records = [
      record({ id: "forbidden-one", justification: "Because." }),
      record({ id: "insufficient-one", justification: "" }),
      record({ id: "permitted-one", justification: "Because." }),
      record({ id: "stale-one", justification: "Because." }),
    ]

    const result = evaluateExceptionFindings({ items, records, matchRecord: matchById, evaluate })

    expect(result.summary).toContain("4 finding(s) evaluated")
    expect(result.summary).toContain("1 permitted")
    expect(result.summary).toContain("1 forbidden")
    expect(result.summary).toContain("1 insufficient")
    expect(result.summary).toContain("1 unmatched")
    expect(result.summary).toContain("1 stale exception record(s)")
  })

  describe("cross-cutting invariants", () => {
    it("an unmatched exception-mode finding never passes just because a different finding's category is permitted elsewhere", () => {
      const items = [
        finding({ id: "permitted-elsewhere", category: "medium" }),
        finding({ id: "unmatched-here", category: "medium" }),
      ]
      const records = [record({ id: "permitted-elsewhere", justification: "Because." })]

      const result = evaluateExceptionFindings({ items, records, matchRecord: matchById, evaluate })

      expect(result.matched).toHaveLength(1)
      expect(result.matched[0]?.item.id).toBe("permitted-elsewhere")
      expect(result.unmatchedFindings).toEqual([
        finding({ id: "unmatched-here", category: "medium" }),
      ])
    })

    it("one identity's justified record never permits a different identity's finding, even in the same category with no matcher wired to confuse them", () => {
      const items = [finding({ id: "unrelated-finding", category: "medium" })]
      // A fully-justified record exists in the registry, but under a different identity --
      // matchRecord (by id) correctly finds nothing for "unrelated-finding".
      const records = [record({ id: "someone-elses-record", justification: "Fully justified." })]

      const result = evaluateExceptionFindings({ items, records, matchRecord: matchById, evaluate })

      expect(result.matched).toEqual([])
      expect(result.unmatchedFindings).toEqual(items)
      expect(result.staleExceptions).toEqual(records)
    })
  })
})

describe("content-bound verification staleness, end to end through evaluateExceptionRecord", () => {
  const VERIFIED_POLICY: ExceptionPolicyConfig = {
    g: {
      rules: {
        medium: {
          mode: "exception",
          requirements: ["justification", "verification.verifiedBy"],
        },
      },
    },
  }

  function fieldValueWithVerification(rec: Record_, requirement: string): string {
    if (requirement === "justification") return rec.justification
    if (requirement === "verification.verifiedBy") {
      return isVerified(rec, ["justification"], fieldValueWithVerification) && rec.verification
        ? rec.verification.verifiedBy
        : ""
    }
    return ""
  }

  it("a freshly-verified record (hash matches current justification) is permitted", () => {
    const unverified = record({ id: "r1", justification: "Because." })
    const hash = hashRequirementFields(unverified, ["justification"], fieldValueWithVerification)
    const verified: Record_ = {
      ...unverified,
      verification: {
        method: "independent-human-review",
        verifiedBy: "alice",
        verifiedAt: "2026-01-01T00:00:00.000Z",
        verifiedContentHash: hash,
      },
    }

    const determinant = evaluateExceptionRecord({
      record: verified,
      classifications: [{ group: "g", category: "medium" }],
      config: VERIFIED_POLICY,
      globalDefault: { mode: "forbidden" },
      fieldValue: fieldValueWithVerification,
    })

    expect(determinant.verdict).toBe("permitted")
    expect(determinant.missing).toEqual([])
  })

  it("editing the verified field afterward silently reverts verification to missing, naming exactly 'verification.verifiedBy'", () => {
    const original = record({ id: "r1", justification: "Original justification." })
    const hash = hashRequirementFields(original, ["justification"], fieldValueWithVerification)
    const edited: Record_ = {
      id: "r1",
      justification: "Edited justification -- verification is now stale.",
      verification: {
        method: "independent-human-review",
        verifiedBy: "alice",
        verifiedAt: "2026-01-01T00:00:00.000Z",
        verifiedContentHash: hash,
      },
    }

    const determinant = evaluateExceptionRecord({
      record: edited,
      classifications: [{ group: "g", category: "medium" }],
      config: VERIFIED_POLICY,
      globalDefault: { mode: "forbidden" },
      fieldValue: fieldValueWithVerification,
    })

    expect(determinant.verdict).toBe("insufficient")
    expect(determinant.missing).toEqual(["verification.verifiedBy"])
  })
})

describe("stageMissingFields", () => {
  it("hides the verification field while any authoring field is still missing", () => {
    const staged = stageMissingFields(
      ["justification", "verification.verifiedBy"],
      "verification.verifiedBy",
    )
    expect(staged).toEqual(["justification"])
  })

  it("shows the verification field once it is the only remaining missing field", () => {
    const staged = stageMissingFields(["verification.verifiedBy"], "verification.verifiedBy")
    expect(staged).toEqual(["verification.verifiedBy"])
  })

  it("returns an empty list unchanged when nothing is missing", () => {
    expect(stageMissingFields([], "verification.verifiedBy")).toEqual([])
  })

  it("is a no-op when the verification field was never part of missing at all", () => {
    expect(
      stageMissingFields(["justification", "alternatives"], "verification.verifiedBy"),
    ).toEqual(["justification", "alternatives"])
  })

  describe("staged rationale, end to end through evaluateExceptionRecord's own raw missing list", () => {
    const STAGED_POLICY: ExceptionPolicyConfig = {
      g: {
        rules: {
          medium: {
            mode: "exception",
            requirements: ["justification", "verification.verifiedBy"],
          },
        },
      },
    }

    function fieldValueForStaging(rec: Record_, requirement: string): string {
      if (requirement === "justification") return rec.justification
      if (requirement === "verification.verifiedBy") {
        return isVerified(rec, ["justification"], fieldValueForStaging) && rec.verification
          ? rec.verification.verifiedBy
          : ""
      }
      return ""
    }

    it("a freshly-discovered finding's first failure lists only authoring fields, never verification.verifiedBy", () => {
      const fresh = record({ id: "r1", justification: "" })
      const determinant = evaluateExceptionRecord({
        record: fresh,
        classifications: [{ group: "g", category: "medium" }],
        config: STAGED_POLICY,
        globalDefault: { mode: "forbidden" },
        fieldValue: fieldValueForStaging,
      })

      // The core's own raw missing list genuinely includes both -- staging is a presentation
      // choice layered on top, not a change to evaluateExceptionRecord's own semantics.
      expect(determinant.missing).toEqual(["justification", "verification.verifiedBy"])

      const staged = stageMissingFields(determinant.missing, "verification.verifiedBy")
      expect(staged).toEqual(["justification"])
    })

    it("a second run with every authoring field complete adds verification.verifiedBy to the staged list", () => {
      const authored = record({ id: "r1", justification: "Because." })
      const determinant = evaluateExceptionRecord({
        record: authored,
        classifications: [{ group: "g", category: "medium" }],
        config: STAGED_POLICY,
        globalDefault: { mode: "forbidden" },
        fieldValue: fieldValueForStaging,
      })

      expect(determinant.missing).toEqual(["verification.verifiedBy"])

      const staged = stageMissingFields(determinant.missing, "verification.verifiedBy")
      expect(staged).toEqual(["verification.verifiedBy"])
    })
  })
})

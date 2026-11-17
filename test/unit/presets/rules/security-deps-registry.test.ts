import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  EXCEPTION_TYPES,
  emptyV2Fields,
  validateExceptionPolicyConfig,
  validateExceptionRegistry,
} from "../../../../src/helpers/index.js"
import type { PersistedExceptionRegistry } from "../../../../src/helpers/index.js"
import { securityDeps } from "../../../../src/presets/security-deps.js"
import {
  auditReportProblem,
  createSecurityDepsStub,
  judgeAuditFindings,
  normalizeAuditFindings,
  SECURITY_DEPS_EXCEPTION_SCHEMA,
  SECURITY_DEPS_POLICY,
  SECURITY_DEPS_REQUIREMENTS,
  securityDepsExceptionId,
} from "../../../../src/presets/rules/security-deps-registry.js"
import type {
  AuditFinding,
  AuditSeverity,
  SecurityDepsExceptionRecord,
} from "../../../../src/presets/rules/security-deps-registry.js"
import { fakeCheckEvidence, fakeContext } from "../fixtures.js"

function finding(pkg: string, severity: AuditSeverity, range = "<1.0.0"): AuditFinding {
  return { id: securityDepsExceptionId({ package: pkg, range }), package: pkg, range, severity }
}

function complete(f: AuditFinding): SecurityDepsExceptionRecord {
  return {
    ...createSecurityDepsStub(f, f.id),
    justification: "Reached only through tooling.",
    alternatives: "Replace the parent dependency.",
    remediation: "Upgrade when a patch ships.",
    method: "independent-human-review",
    exceptionType: "scheduled-remediation",
    ruleBroken: "No known vulnerability ships.",
    attempted: "An overrides entry.",
    constraint: "No patched release.",
    whyPreferable: "A dated record beats dropping the feature.",
    residualRisk: "The advisory itself.",
    revisitWhen: "A patch ships.",
    expires: "2027-01-31",
  }
}

function registry(
  activeRecords: readonly SecurityDepsExceptionRecord[],
  staleRecords: readonly SecurityDepsExceptionRecord[] = [],
): PersistedExceptionRegistry<SecurityDepsExceptionRecord> {
  return { activeRecords, staleRecords, newStubIds: [] }
}

describe("identity and normalization", () => {
  it("securityDepsExceptionId is security-deps:<package>@<range>", () => {
    expect(securityDepsExceptionId({ package: "tar", range: "<6.2.1" })).toBe(
      "security-deps:tar@<6.2.1",
    )
  })

  it("normalizeAuditFindings returns one finding per vulnerable package", () => {
    const report = {
      vulnerabilities: {
        tar: { severity: "high", range: "<6.2.1" },
        semver: { severity: "info", range: ">=7.0.0 <7.5.2" },
      },
    }
    expect(normalizeAuditFindings(report)).toEqual([
      finding("tar", "high", "<6.2.1"),
      finding("semver", "info", ">=7.0.0 <7.5.2"),
    ])
  })

  it("normalizeAuditFindings maps an undocumented severity to unknown and a missing range to unknown", () => {
    const report = {
      vulnerabilities: {
        a: { severity: "severe", range: "" },
        b: { severity: 3 },
        c: null,
      },
    }
    expect(normalizeAuditFindings(report)).toEqual([
      finding("a", "unknown", "unknown"),
      finding("b", "unknown", "unknown"),
      finding("c", "unknown", "unknown"),
    ])
  })

  it("keeps every documented severity", () => {
    for (const severity of ["info", "low", "moderate", "high", "critical"] as const) {
      expect(normalizeAuditFindings({ vulnerabilities: { a: { severity } } })[0]?.severity).toBe(
        severity,
      )
    }
  })

  it("returns no findings for a report without a vulnerabilities object", () => {
    for (const report of [null, 3, {}, { vulnerabilities: [] }, { vulnerabilities: null }]) {
      expect(normalizeAuditFindings(report)).toEqual([])
    }
  })
})

describe("auditReportProblem", () => {
  it("accepts a completed report", () => {
    expect(auditReportProblem({ vulnerabilities: {} })).toBeUndefined()
    expect(auditReportProblem({ error: undefined, vulnerabilities: { a: {} } })).toBeUndefined()
  })

  it("names a scan npm could not run", () => {
    expect(auditReportProblem({ error: { code: "ENOAUDIT", summary: "offline" } })).toBe(
      "npm audit could not complete the scan: ENOAUDIT: offline.",
    )
    expect(auditReportProblem({ error: { code: 7 } })).toBe(
      "npm audit could not complete the scan.",
    )
    expect(auditReportProblem({ error: "boom", vulnerabilities: {} })).toBe(
      "npm audit could not complete the scan.",
    )
  })

  it("rejects a report with no vulnerabilities object", () => {
    const message =
      'npm audit\'s report has no "vulnerabilities" object, so the scan may not have completed.'
    for (const report of [
      {},
      { vulnerabilities: [] },
      { vulnerabilities: null },
      { vulnerabilities: 3 },
      { error: null },
    ]) {
      expect(auditReportProblem(report)).toBe(message)
    }
  })

  it("rejects a value that is not a report object", () => {
    for (const report of [null, [], "x", 1]) {
      expect(auditReportProblem(report)).toBe("npm audit produced invalid JSON report data.")
    }
  })
})

describe("records", () => {
  it("createSecurityDepsStub writes a blank version 2 record with package, range and severity", () => {
    const f = finding("tar", "high", "<6.2.1")
    expect(createSecurityDepsStub(f, f.id)).toEqual({
      id: "security-deps:tar@<6.2.1",
      version: 2,
      justification: "",
      alternatives: "",
      remediation: "",
      method: "",
      exceptionType: "",
      ...emptyV2Fields(),
      package: "tar",
      range: "<6.2.1",
      severity: "high",
    })
  })

  it("SECURITY_DEPS_EXCEPTION_SCHEMA accepts a stub and a complete record", () => {
    const f = finding("tar", "high")
    for (const record of [createSecurityDepsStub(f, f.id), complete(f)]) {
      expect(validateExceptionRegistry([record], SECURITY_DEPS_EXCEPTION_SCHEMA)).toEqual({
        ok: true,
        records: [record],
      })
    }
  })

  it("accepts a legacy version 1 record", () => {
    const record = {
      id: "security-deps:tar@<1.0.0",
      version: 1,
      justification: "j",
      alternatives: "",
      remediation: "",
      method: "",
      exceptionType: "",
      package: "tar",
      range: "<1.0.0",
      severity: "low",
    }
    expect(validateExceptionRegistry([record], SECURITY_DEPS_EXCEPTION_SCHEMA)).toEqual({
      ok: true,
      records: [record],
    })
  })

  it("SECURITY_DEPS_EXCEPTION_SCHEMA rejects a record outside the security-deps: namespace", () => {
    const f = finding("tar", "high")
    const result = validateExceptionRegistry(
      [{ ...complete(f), id: "socket:tar@<1.0.0" }],
      SECURITY_DEPS_EXCEPTION_SCHEMA,
    )
    expect(result.ok ? [] : result.errors).toEqual([
      'exceptions[0].id must be a non-empty string beginning with "security-deps:" (got "socket:tar@<1.0.0").',
    ])
  })

  it("SECURITY_DEPS_EXCEPTION_SCHEMA accepts all eight exception types", () => {
    const f = finding("tar", "high")
    for (const exceptionType of EXCEPTION_TYPES) {
      const method =
        exceptionType === "validated-false-positive"
          ? "mechanical-reverification"
          : "independent-human-review"
      const result = validateExceptionRegistry(
        [{ ...complete(f), exceptionType, method }],
        SECURITY_DEPS_EXCEPTION_SCHEMA,
      )
      expect(result.ok).toBe(true)
    }
  })

  it("rejects an id that does not match its own package and range", () => {
    const f = finding("tar", "high")
    const result = validateExceptionRegistry(
      [{ ...complete(f), range: "<2.0.0" }],
      SECURITY_DEPS_EXCEPTION_SCHEMA,
    )
    expect(result.ok ? [] : result.errors).toEqual([
      'exceptions[0].id "security-deps:tar@<1.0.0" does not match the id derived from its own package and range ("security-deps:tar@<2.0.0").',
    ])
  })

  it("names every bad identity field at once", () => {
    const f = finding("tar", "high")
    const result = validateExceptionRegistry(
      [{ ...complete(f), package: "", range: 3, severity: "severe", method: "vibes" }],
      SECURITY_DEPS_EXCEPTION_SCHEMA,
    )
    const errors = result.ok ? [] : result.errors
    expect(errors).toContain(
      'exceptions[0].method must be "" or one of "mechanical-reverification", "independent-human-review", "policy-rule" (got "vibes").',
    )
    expect(errors).toContain("exceptions[0].package must be a non-empty string.")
    expect(errors).toContain("exceptions[0].range must be a non-empty string.")
    expect(errors).toContain(
      'exceptions[0].severity must be one of "info", "low", "moderate", "high", "critical", "unknown" (got "severe").',
    )
  })

  it.each([
    ["package", { package: "" }, "exceptions[0].package must be a non-empty string."],
    ["range", { range: "" }, "exceptions[0].range must be a non-empty string."],
  ])("reports only the bad %s, not an id mismatch derived from it", (_field, change, error) => {
    const f = finding("tar", "high")
    const result = validateExceptionRegistry(
      [{ ...complete(f), ...change }],
      SECURITY_DEPS_EXCEPTION_SCHEMA,
    )
    expect(result.ok ? [] : result.errors).toEqual([error])
  })

  it("validateRecord returns no record when a security field is invalid", () => {
    const f = finding("tar", "high")
    const { id, justification, ...raw } = { ...complete(f), method: "vibes" }
    const errors: string[] = []
    expect(
      SECURITY_DEPS_EXCEPTION_SCHEMA.validateRecord(
        { id, version: 1, justification },
        raw,
        0,
        errors,
      ),
    ).toBeUndefined()
    expect(errors).toEqual([
      'exceptions[0].method must be "" or one of "mechanical-reverification", "independent-human-review", "policy-rule" (got "vibes").',
    ])
  })

  it("accepts the unknown severity in a record", () => {
    const f = finding("tar", "unknown")
    expect(validateExceptionRegistry([complete(f)], SECURITY_DEPS_EXCEPTION_SCHEMA).ok).toBe(true)
  })

  it("rejects an extra key", () => {
    const f = finding("tar", "high")
    expect(
      validateExceptionRegistry([{ ...complete(f), note: "x" }], SECURITY_DEPS_EXCEPTION_SCHEMA).ok,
    ).toBe(false)
  })

  it("ships a policy that validateExceptionPolicyConfig accepts", () => {
    expect(validateExceptionPolicyConfig(SECURITY_DEPS_POLICY, SECURITY_DEPS_REQUIREMENTS)).toEqual(
      [],
    )
  })
})

describe("judgeAuditFindings", () => {
  it("judgeAuditFindings fails a critical advisory even with a complete record", () => {
    const f = finding("tar", "critical")
    expect(judgeAuditFindings([f], registry([complete(f)]))).toEqual({
      outcome: "fail",
      rationale: [
        "1 npm audit finding(s) or stale record(s) need attention:",
        "- security-deps:tar@<1.0.0 [critical]: a critical advisory is never waivable; upgrade or remove the package.",
      ].join("\n"),
    })
  })

  it("judgeAuditFindings passes a high advisory with a complete record", () => {
    const f = finding("tar", "high")
    expect(judgeAuditFindings([f], registry([complete(f)]))).toEqual({
      outcome: "pass",
      rationale: "1 npm audit finding(s), each accepted by a complete exception record.",
    })
  })

  it("passes every lower severity, unknown included, with a complete record", () => {
    for (const severity of ["low", "moderate", "high", "unknown"] as const) {
      const f = finding("tar", severity)
      expect(judgeAuditFindings([f], registry([complete(f)])).outcome).toBe("pass")
    }
  })

  it("lets a legacy version 1 record with its security fields accept a lower advisory", () => {
    const f = finding("tar", "moderate")
    const full = complete(f)
    const legacy: SecurityDepsExceptionRecord = {
      id: full.id,
      version: 1,
      justification: full.justification,
      alternatives: full.alternatives,
      remediation: full.remediation,
      method: full.method,
      exceptionType: full.exceptionType,
      package: full.package,
      range: full.range,
      severity: full.severity,
    }
    expect(judgeAuditFindings([f], registry([legacy])).outcome).toBe("pass")
  })

  it("treats a record written for a milder advisory as incomplete once npm reports a higher one", () => {
    const now = finding("tar", "high")
    const record = complete(finding("tar", "moderate"))
    expect(record.id).toBe(now.id)
    expect(judgeAuditFindings([now], registry([record]))).toEqual({
      outcome: "fail",
      rationale: [
        "1 npm audit finding(s) or stale record(s) need attention:",
        "- security-deps:tar@<1.0.0 [high]: the record is incomplete: it accepts a moderate advisory, and npm audit now reports high. Review it, then set its severity to high.",
      ].join("\n"),
    })
  })

  it.each([
    ["moderate", "low"],
    ["high", "moderate"],
    ["high", "low"],
    ["critical", "high"],
  ] as const)("lets a %s record cover a %s advisory", (recorded, reported) => {
    const record = complete(finding("tar", recorded))
    expect(judgeAuditFindings([finding("tar", reported)], registry([record])).outcome).toBe("pass")
  })

  it.each([
    ["unknown", "high"],
    ["unknown", "low"],
    ["high", "unknown"],
    ["critical", "unknown"],
    ["info", "low"],
  ] as const)(
    "does not let a %s record cover a %s advisory: unknown matches only itself",
    (recorded, reported) => {
      const record = complete(finding("tar", recorded))
      const result = judgeAuditFindings([finding("tar", reported)], registry([record]))
      expect(result.outcome).toBe("fail")
      expect(result.rationale).toContain(
        `it accepts a ${recorded} advisory, and npm audit now reports ${reported}.`,
      )
    },
  )

  it("judgeAuditFindings fails a lower advisory whose record is blank and lists the missing fields", () => {
    const f = finding("tar", "low")
    expect(judgeAuditFindings([f], registry([createSecurityDepsStub(f, f.id)]))).toEqual({
      outcome: "fail",
      rationale: [
        "1 npm audit finding(s) or stale record(s) need attention:",
        "- security-deps:tar@<1.0.0 [low]: the record is incomplete (missing: justification, alternatives, remediation, method, exceptionType, ruleBroken, attempted, constraint, whyPreferable, residualRisk, revisitWhen).",
      ].join("\n"),
    })
  })

  it("fails a finding the registry holds no record for", () => {
    const f = finding("tar", "high")
    expect(judgeAuditFindings([f], registry([]))).toEqual({
      outcome: "fail",
      rationale: [
        "1 npm audit finding(s) or stale record(s) need attention:",
        "- security-deps:tar@<1.0.0 [high]: no exception record.",
      ].join("\n"),
    })
  })

  it("judgeAuditFindings fails a stale record and says to delete it", () => {
    const f = finding("tar", "high")
    expect(judgeAuditFindings([], registry([], [complete(f)]))).toEqual({
      outcome: "fail",
      rationale: [
        "1 npm audit finding(s) or stale record(s) need attention:",
        '- "security-deps:tar@<1.0.0" is stale: npm audit no longer reports it; delete this record.',
      ].join("\n"),
    })
  })

  it("counts offenders and stale records together", () => {
    const low = finding("a", "low")
    const gone = finding("b", "high")
    const result = judgeAuditFindings(
      [low],
      registry([createSecurityDepsStub(low, low.id)], [complete(gone)]),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale.split("\n")[0]).toBe(
      "2 npm audit finding(s) or stale record(s) need attention:",
    )
  })

  it("judgeAuditFindings reports info findings without blocking", () => {
    const info = finding("semver", "info")
    expect(judgeAuditFindings([info], registry([]))).toEqual({
      outcome: "warn",
      rationale:
        "0 blocking npm audit finding(s) remain. 1 info-severity finding(s) remain and never block.",
    })
    const high = finding("tar", "high")
    expect(judgeAuditFindings([info, high], registry([complete(high)]))).toEqual({
      outcome: "warn",
      rationale:
        "1 npm audit finding(s), each accepted by a complete exception record. 1 info-severity finding(s) remain and never block.",
    })
  })

  it("passes with today's text when npm audit finds nothing", () => {
    expect(judgeAuditFindings([], registry([]))).toEqual({
      outcome: "pass",
      rationale:
        "Runtime dependency policy passed. 0 critical, 0 high, 0 moderate, and 0 low vulnerabilities were found.",
    })
  })
})

describe("the securityDeps preset with a registry", () => {
  let dir: string
  let registryPath: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "repo-contract-security-deps-"))
    registryPath = path.join(dir, ".repo-contract", "exceptions", "security-deps.json")
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  function audit(value: unknown) {
    return fakeContext(fakeCheckEvidence({ output: { format: "json", success: true, value } }))
  }

  it("securityDeps() with no registry keeps today's verdicts and writes nothing", async () => {
    const check = securityDeps({ registry: false })
    expect(check.run).toEqual(["npm", "audit", "--omit=dev", "--json"])
    const report = {
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 } },
      vulnerabilities: { tar: { severity: "high", range: "<6.2.1" } },
    }
    const result = await check.policy(audit(report))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("npm audit found 1 runtime vulnerability(ies):")
    await expect(readFile(registryPath, "utf8")).rejects.toThrow(/ENOENT/)
  })

  it("securityDeps({ registry }) writes a stub for a new advisory and fails until it is filled", async () => {
    const check = securityDeps({ registry: registryPath })
    expect(check.run).toEqual(["npm", "audit", "--omit=dev", "--json"])
    expect(check.output).toEqual({ format: "json" })
    const report = {
      vulnerabilities: {
        tar: { severity: "high", range: "<6.2.1" },
        semver: { severity: "info", range: "<7.5.2" },
      },
    }

    const first = await check.policy(audit(report))
    expect(first.outcome).toBe("fail")
    expect(first.rationale).toContain("- security-deps:tar@<6.2.1 [high]: the record is incomplete")
    const written = JSON.parse(await readFile(registryPath, "utf8")) as {
      exceptions: SecurityDepsExceptionRecord[]
    }
    // An info finding never blocks, so it gets no stub.
    expect(written.exceptions.map((record) => record.id)).toEqual(["security-deps:tar@<6.2.1"])

    const f = finding("tar", "high", "<6.2.1")
    const { writeExceptionRegistry } = await import("../../../../src/helpers/index.js")
    await writeExceptionRegistry({ path: registryPath, records: [{ ...complete(f) }] })
    const second = await check.policy(audit(report))
    expect(second).toEqual({
      outcome: "warn",
      rationale:
        "1 npm audit finding(s), each accepted by a complete exception record. 1 info-severity finding(s) remain and never block.",
    })

    const fixed = await check.policy(audit({ vulnerabilities: {} }))
    expect(fixed.outcome).toBe("fail")
    expect(fixed.rationale).toContain("is stale")
  })

  it("fails on a registry that does not load and leaves it unchanged", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises")
    await mkdir(path.dirname(registryPath), { recursive: true })
    await writeFile(registryPath, "{ not json")
    const result = await securityDeps({ registry: registryPath }).policy(
      audit({ vulnerabilities: {} }),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain(`${registryPath} failed to load and was left unchanged:`)
    expect(await readFile(registryPath, "utf8")).toBe("{ not json")
  })

  it("fails before touching the registry when the audit did not run", async () => {
    const check = securityDeps({ registry: registryPath })
    const cases = [
      [
        fakeContext(fakeCheckEvidence({ output: { format: "json", success: false, error: "x" } })),
        "npm audit output could not be parsed as JSON.",
      ],
      [audit(null), "npm audit produced invalid JSON report data."],
      [audit({ error: { code: "E500" } }), "npm audit could not complete the scan: E500."],
    ] as const
    for (const [context, rationale] of cases) {
      expect(await check.policy(context)).toEqual({ outcome: "fail", rationale })
    }
    await expect(readFile(registryPath, "utf8")).rejects.toThrow(/ENOENT/)
  })

  it("fails when npm audit terminated abnormally", async () => {
    const result = await securityDeps({ registry: registryPath }).policy(
      fakeContext(fakeCheckEvidence({ status: "timed_out", exitCode: null })),
    )
    expect(result.outcome).toBe("fail")
  })
})

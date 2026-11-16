import { describe, it } from "vitest"

describe("R2x securityDeps registry", () => {
  it.todo("securityDepsExceptionId is security-deps:<package>@<range>")
  it.todo("normalizeAuditFindings returns one finding per vulnerable package")
  it.todo(
    "normalizeAuditFindings maps an undocumented severity to unknown and a missing range to unknown",
  )
  it.todo("createSecurityDepsStub writes a blank version 2 record with package, range and severity")
  it.todo("SECURITY_DEPS_EXCEPTION_SCHEMA rejects a record outside the security-deps: namespace")
  it.todo("SECURITY_DEPS_EXCEPTION_SCHEMA accepts all eight exception types")
  it.todo("judgeAuditFindings fails a critical advisory even with a complete record")
  it.todo("judgeAuditFindings passes a high advisory with a complete record")
  it.todo(
    "judgeAuditFindings fails a lower advisory whose record is blank and lists the missing fields",
  )
  it.todo("judgeAuditFindings fails a stale record and says to delete it")
  it.todo("judgeAuditFindings reports info findings without blocking")
  it.todo("securityDeps() with no registry keeps today's verdicts and writes nothing")
  it.todo(
    "securityDeps({ registry }) writes a stub for a new advisory and fails until it is filled",
  )
})

import { describe, expect, it, vi, beforeEach } from "vitest"
import { securitySecrets } from "../../../src/presets/security-secrets.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"

// Same real-fs-collision rationale as duplication.test.ts -- see that
// file's comment. `securitySecrets`'s policy reads a fixed relative path
// with no injectable cwd, and this repository's own `security-secrets`
// check touches that exact same real path concurrently during
// `npm run contract`.
const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }))
vi.mock("node:fs/promises", () => ({ readFile }))

beforeEach(() => {
  readFile.mockReset()
})

describe("securitySecrets preset", () => {
  it("shells out to secretlint --format json --output reports/secretlint.json **/*", () => {
    expect(securitySecrets.run).toEqual([
      "secretlint",
      "--format",
      "json",
      "--output",
      "reports/secretlint.json",
      "**/*",
    ])
  })

  it("fails with an actionable message when secretlint is not installed", async () => {
    const result = await securitySecrets.policy(fakeContext(enoentEvidence("secretlint")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`secretlint`")
  })

  it("reads the report from reports/secretlint.json", async () => {
    readFile.mockResolvedValue("[]")
    await securitySecrets.policy(fakeContext(fakeCheckEvidence()))
    expect(readFile).toHaveBeenCalledWith("reports/secretlint.json", "utf8")
  })

  it("fails when the report file was never written", async () => {
    readFile.mockRejectedValue(new Error("ENOENT"))
    const result = await securitySecrets.policy(fakeContext(fakeCheckEvidence()))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Secretlint did not produce its expected JSON report.",
    })
  })

  it("fails when the report file contains invalid JSON", async () => {
    readFile.mockResolvedValue("not json")
    const result = await securitySecrets.policy(fakeContext(fakeCheckEvidence()))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Secretlint produced invalid JSON evidence.",
    })
  })

  it("passes when every file has 0 messages", async () => {
    readFile.mockResolvedValue(JSON.stringify([{ filePath: "a.env", messages: [] }]))
    const result = await securitySecrets.policy(fakeContext(fakeCheckEvidence()))
    expect(result).toEqual({ outcome: "pass", rationale: "Secretlint found 0 potential secrets." })
  })

  it("fails cleanly (does not throw) when the report JSON is valid but not an array", async () => {
    readFile.mockResolvedValue("{}")
    const result = await securitySecrets.policy(fakeContext(fakeCheckEvidence()))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "Secretlint produced invalid JSON report data.",
    })
  })

  it("fails, naming the abort, when the run was cancelled before secretlint wrote a report", async () => {
    const result = await securitySecrets.policy(
      fakeContext(fakeCheckEvidence({ status: "aborted", exitCode: null })),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("the run was aborted")
    expect(readFile).not.toHaveBeenCalled()
  })

  it("fails and lists each finding's location without leaking the secret value, exact rationale including the disclosure notice", async () => {
    readFile.mockResolvedValue(
      JSON.stringify([
        {
          filePath: ".env",
          messages: [
            {
              message: "found a secret",
              line: 4,
              column: 1,
              ruleId: "@secretlint/secretlint-rule-aws",
            },
          ],
        },
        {
          filePath: ".env.production",
          messages: [{ message: "found another secret", line: 1, column: 3 }],
        },
      ]),
    )

    const result = await securitySecrets.policy(fakeContext(fakeCheckEvidence()))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toBe(
      [
        "Secretlint found 2 potential secret(s):",
        "- .env:4:1 [@secretlint/secretlint-rule-aws]",
        "- .env.production:1:3",
        "Potential secret values are intentionally omitted. Remove the secret, replace it with an appropriate secret-management mechanism, and rotate any credential that may already have been exposed.",
      ].join("\n"),
    )
    expect(result.rationale).not.toContain("found a secret")
    expect(result.rationale).not.toContain("found another secret")
  })
})

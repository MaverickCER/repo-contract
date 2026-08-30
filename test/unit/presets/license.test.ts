import { describe, expect, it } from "vitest"
import { license } from "../../../src/presets/license.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"

describe("license preset", () => {
  it("shells out to licensee --production --osi --errors-only --ndjson", () => {
    expect(license.run).toEqual(["licensee", "--production", "--osi", "--errors-only", "--ndjson"])
  })

  it("fails with an actionable message when licensee is not installed", async () => {
    const result = await license.policy(fakeContext(enoentEvidence("licensee")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`licensee`")
  })

  it("passes when stdout is empty and the process exited 0 on its own", async () => {
    const result = await license.policy(
      fakeContext(fakeCheckEvidence({ stdout: "", status: "completed", exitCode: 0 })),
    )
    expect(result).toEqual({
      outcome: "pass",
      rationale: "licensee found 0 production dependencies with a non-OSI-approved license.",
    })
  })

  it("fails (not passes) when licensee exits non-zero with empty stdout -- it never evaluated anything", async () => {
    const result = await license.policy(
      fakeContext(
        fakeCheckEvidence({
          stdout: "",
          status: "completed",
          exitCode: 1,
          stderr: "Error: no such file or directory - node_modules",
        }),
      ),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("did not evaluate any dependency licenses")
    expect(result.rationale).toContain("node_modules")
  })

  it("skips blank lines between ndjson records rather than failing on them", async () => {
    const stdout = [
      JSON.stringify({ name: "left-pad", version: "1.0.0", license: "WTFPL" }),
      "",
      "  ",
      JSON.stringify({ name: "z-pkg", version: "9.0.0", license: "GPL" }),
    ].join("\n")
    const result = await license.policy(fakeContext(fakeCheckEvidence({ stdout })))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("2 production dependency(ies)")
  })

  it("passes when stdout is whitespace-only (trimmed before the emptiness check)", async () => {
    const result = await license.policy(fakeContext(fakeCheckEvidence({ stdout: "  \n  " })))
    expect(result).toEqual({
      outcome: "pass",
      rationale: "licensee found 0 production dependencies with a non-OSI-approved license.",
    })
  })

  it("fails and lists each offending dependency, sorted alphabetically regardless of ndjson order, joined by newline", async () => {
    const stdout = [
      JSON.stringify({ name: "z-pkg", version: "9.0.0", license: "GPL" }),
      JSON.stringify({ name: "left-pad", version: "1.0.0", license: "WTFPL" }),
      JSON.stringify({ name: "some-pkg", version: "2.0.0" }),
    ].join("\n")
    const result = await license.policy(fakeContext(fakeCheckEvidence({ stdout })))

    expect(result.outcome).toBe("fail")
    expect(result.rationale).toBe(
      [
        "licensee found 3 production dependency(ies) without an OSI-approved license:",
        "- left-pad@1.0.0: WTFPL",
        "- some-pkg@2.0.0: unknown license",
        "- z-pkg@9.0.0: GPL",
      ].join("\n"),
    )
  })

  it("fails with invalid-JSON message when stdout is not valid ndjson", async () => {
    const result = await license.policy(fakeContext(fakeCheckEvidence({ stdout: "not json" })))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "licensee produced invalid JSON evidence.",
    })
  })
})

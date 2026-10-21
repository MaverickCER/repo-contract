import { describe, expect, it } from "vitest"
import { license } from "../../../src/presets/license.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"

describe("license preset", () => {
  const CONFIG_FILE_STDERR = "repo-contract license preset: using .licensee.json\n"

  it("runs licensee through a node launcher that adds --osi only when there is no .licensee.json", () => {
    expect(license.run.slice(0, 2)).toEqual(["node", "-e"])
    const launcher = license.run[2]
    expect(launcher).toContain('fs.existsSync(path.join(cwd, ".licensee.json"))')
    expect(launcher).toContain('const policyFlags = useConfigFile ? [] : ["--osi"]')
    expect(launcher).toContain('"--production", ...policyFlags, "--errors-only", "--ndjson"')
  })

  it("fails with an actionable message when the launcher reports licensee is not installed", async () => {
    const result = await license.policy(
      fakeContext(
        fakeCheckEvidence({
          exitCode: 127,
          stderr: "repo-contract license preset: licensee is not installed\n",
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale:
        "`licensee` is required by this preset but was not found. Install `licensee` as a development dependency and run the contract again.",
    })
  })

  it("does not call licensee missing for exit 127 without the launcher's marker", async () => {
    const result = await license.policy(
      fakeContext(fakeCheckEvidence({ exitCode: 127, stderr: "something else\n" })),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("did not evaluate any dependency licenses")
  })

  it("does not call licensee missing for the launcher's marker on another exit code", async () => {
    const result = await license.policy(
      fakeContext(
        fakeCheckEvidence({
          exitCode: 1,
          stderr: "repo-contract license preset: licensee is not installed\n",
        }),
      ),
    )
    expect(result.rationale).toContain("did not evaluate any dependency licenses")
  })

  it("still reports licensee missing on ENOENT when a config overrides run to spawn licensee directly", async () => {
    const result = await license.policy(fakeContext(enoentEvidence("licensee")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`licensee` is required")
  })

  it("does not misreport a missing node as missing licensee", async () => {
    const result = await license.policy(fakeContext(enoentEvidence("node")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).not.toContain("`licensee` is required")
  })

  it("names .licensee.json as the policy in a pass when the launcher used it", async () => {
    const result = await license.policy(
      fakeContext(fakeCheckEvidence({ stdout: "", stderr: CONFIG_FILE_STDERR })),
    )
    expect(result).toEqual({
      outcome: "pass",
      rationale:
        "licensee found 0 production dependencies with a license .licensee.json does not approve.",
    })
  })

  it("names .licensee.json as the policy in a fail when the launcher used it", async () => {
    const stdout = JSON.stringify({ name: "left-pad", version: "1.0.0", license: "WTFPL" })
    const result = await license.policy(
      fakeContext(fakeCheckEvidence({ stdout, exitCode: 1, stderr: CONFIG_FILE_STDERR })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: [
        "licensee found 1 production dependency(ies) that .licensee.json does not approve:",
        "- left-pad@1.0.0: WTFPL",
      ].join("\n"),
    })
  })

  it("only treats the marker as the policy when it is the first stderr line", async () => {
    const result = await license.policy(
      fakeContext(fakeCheckEvidence({ stdout: "", stderr: `noise\n${CONFIG_FILE_STDERR}` })),
    )
    expect(result.rationale).toContain("non-OSI-approved")
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

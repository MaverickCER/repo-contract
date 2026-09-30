import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CheckEvidence, PolicyContext } from "../../../src/types.js"

const { runGit } = vi.hoisted(() => ({
  runGit: vi.fn().mockResolvedValue("abc123abc123abc123abc123abc123abc123abc1\n"),
}))
vi.mock("../../../scripts/diff-files.js", () => ({ runGit }))

const { sbom } = await import("../../../checks/sbom.js")

function evidence(overrides: Partial<CheckEvidence> = {}): CheckEvidence {
  return {
    command: "tsx",
    args: ["scripts/sbom/run.ts"],
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

function ctx(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    result: evidence(),
    evidence: { version: 1, startedAt: "", completedAt: "", durationMs: 0, checks: {} },
    dependencies: {},
    ...overrides,
  }
}

describe("sbom.policy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runGit.mockResolvedValue("abc123abc123abc123abc123abc123abc123abc1\n")
  })

  it("fails with requireParsedOutput's rationale when output never parsed", async () => {
    const result = await sbom.policy(
      ctx({ result: evidence({ output: { format: "json", success: false, error: "boom" } }) }),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("boom")
    expect(result.rationale).toContain("SBOM generation output could not be parsed as JSON.")
  })

  it("fails, surfacing generate.ts's own rejection reason verbatim, when generation itself failed", async () => {
    const result = await sbom.policy(
      ctx({
        result: evidence({
          output: {
            format: "json",
            success: true,
            value: { ok: false, reason: "cyclonedx-npm exited with code 1: boom" },
          },
        }),
      }),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "cyclonedx-npm exited with code 1: boom",
    })
    // A failed generation never had a real commit/date worth computing.
    expect(runGit).not.toHaveBeenCalled()
  })

  it("passes, reporting the component count, spec version, tool version, and commit in its rationale", async () => {
    const result = await sbom.policy(
      ctx({
        result: evidence({
          output: {
            format: "json",
            success: true,
            value: {
              ok: true,
              outputPath: "docs/sbom.cdx.json",
              bomFormat: "CycloneDX",
              specVersion: "1.6",
              componentCount: 1203,
              toolVersion: "6.0.1",
            },
          },
        }),
      }),
    )
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("Wrote docs/sbom.cdx.json")
    expect(result.rationale).toContain("1203 component(s)")
    expect(result.rationale).toContain("CycloneDX 1.6")
    expect(result.rationale).toContain("@cyclonedx/cyclonedx-npm@6.0.1")
    expect(result.rationale).toContain("abc123abc123abc123abc123abc123abc123abc1")
    expect(runGit).toHaveBeenCalledWith(["rev-parse", "HEAD"], process.cwd())
  })

  it('falls back to commit "unknown" when runGit cannot resolve HEAD', async () => {
    runGit.mockResolvedValueOnce(undefined)
    const result = await sbom.policy(
      ctx({
        result: evidence({
          output: {
            format: "json",
            success: true,
            value: {
              ok: true,
              outputPath: "docs/sbom.cdx.json",
              bomFormat: "CycloneDX",
              specVersion: "1.6",
              componentCount: 0,
              toolVersion: "unknown",
            },
          },
        }),
      }),
    )
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("commit unknown")
  })
})

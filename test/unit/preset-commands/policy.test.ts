import { describe, expect, it } from "vitest"
import { evaluatePresetCommandsPolicy } from "../../../checks/preset-commands.js"
import type {
  PresetCommandExceptionRecord,
  PresetCommandFinding,
  PresetCommandsEvidence,
} from "../../../scripts/preset-commands/evidence-types.js"
import { derivePresetCommandId } from "../../../scripts/preset-commands/evidence-types.js"

function finding(command: string): PresetCommandFinding {
  return {
    id: derivePresetCommandId({ command }),
    command,
    file: `src/presets/${command}.ts`,
    line: 8,
  }
}

function record(command: string, justification: string): PresetCommandExceptionRecord {
  return { id: derivePresetCommandId({ command }), version: 1, justification, command }
}

function evidence(
  pairs: readonly { readonly command: string; readonly justification: string }[],
  extras: {
    readonly stale?: readonly PresetCommandExceptionRecord[]
    readonly nonLiteral?: readonly { file: string; line: number; detail: string }[]
    readonly registryError?: readonly string[]
  } = {},
): PresetCommandsEvidence {
  const findings = pairs.map((p) => finding(p.command))
  const activeExceptions: Record<string, PresetCommandExceptionRecord> = {}
  for (const p of pairs)
    activeExceptions[derivePresetCommandId({ command: p.command })] = record(
      p.command,
      p.justification,
    )
  return {
    ok: true,
    registryPath: ".repo-contract/exceptions/preset-commands.json",
    findings,
    nonLiteral: extras.nonLiteral ?? [],
    activeExceptions,
    staleExceptions: extras.stale ?? [],
    scaffoldedIds: [],
    ...(extras.registryError !== undefined ? { registryError: extras.registryError } : {}),
  }
}

describe("evaluatePresetCommandsPolicy", () => {
  it("passes when every command has a non-empty justification", () => {
    const result = evaluatePresetCommandsPolicy({
      evidence: evidence([
        { command: "eslint", justification: "no network" },
        { command: "tsc", justification: "no network" },
      ]),
    })
    expect(result.outcome).toBe("pass")
    expect(result.rationale).toContain("2 preset command(s)")
  })

  it("fails a command with a blank justification and includes the review guidance", () => {
    const result = evaluatePresetCommandsPolicy({
      evidence: evidence([{ command: "linkinator", justification: "" }]),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("linkinator")
    expect(result.rationale).toContain("--recurse")
  })

  it("fails on a stale record whose command is gone", () => {
    const result = evaluatePresetCommandsPolicy({
      evidence: evidence([{ command: "eslint", justification: "ok" }], {
        stale: [record("curl", "old")],
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("Stale record")
    expect(result.rationale).toContain("preset-command:curl")
  })

  it("fails on a non-literal run property", () => {
    const result = evaluatePresetCommandsPolicy({
      evidence: evidence([], {
        nonLiteral: [{ file: "src/presets/x.ts", line: 3, detail: "not a literal" }],
      }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("src/presets/x.ts:3")
  })

  it("fails on a registryError", () => {
    const result = evaluatePresetCommandsPolicy({
      evidence: evidence([], { registryError: ["exceptions[0] is broken"] }),
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("failed to load or reconcile")
  })

  it("fails on a broken bijection", () => {
    const result = evaluatePresetCommandsPolicy({
      evidence: {
        ok: true,
        registryPath: ".repo-contract/exceptions/preset-commands.json",
        findings: [finding("eslint")],
        nonLiteral: [],
        activeExceptions: {},
        staleExceptions: [],
        scaffoldedIds: [],
      },
    })
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("bijection")
  })
})

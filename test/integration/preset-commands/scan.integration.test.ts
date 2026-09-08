import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { reconcileExceptions } from "../../../src/helpers/index.js"
import { runPresetCommandsScan, scanPresetCommands } from "../../../scripts/preset-commands/scan.js"
import { createPresetCommandStub } from "../../../scripts/preset-commands/registry.js"
import type {
  PresetCommandExceptionRecord,
  PresetCommandFinding,
} from "../../../scripts/preset-commands/evidence-types.js"

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const runningInsideMutationSandbox = REPO_ROOT.split(path.sep).includes(".stryker-tmp")

describe("preset-commands scan -- full real path", () => {
  it.runIf(!runningInsideMutationSandbox)(
    "discovers this repository's own preset commands and its registry reconciles clean (read-only)",
    async () => {
      const { findings, nonLiteral } = await scanPresetCommands(REPO_ROOT)
      expect(nonLiteral).toEqual([])
      expect(findings.length).toBeGreaterThanOrEqual(10)
      expect(findings.map((f) => f.command)).toContain("eslint")

      const { readFileSync } = await import("node:fs")
      const parsed = JSON.parse(
        readFileSync(
          new URL("../../../.repo-contract/exceptions/preset-commands.json", import.meta.url),
          "utf8",
        ),
      ) as { exceptions: PresetCommandExceptionRecord[] }

      const reconciled = reconcileExceptions<PresetCommandFinding, PresetCommandExceptionRecord>({
        existing: parsed.exceptions,
        findings: [...findings],
        deriveId: (finding) => finding.id,
        createStub: createPresetCommandStub,
      })
      expect(reconciled.ok).toBe(true)
      if (reconciled.ok) {
        expect(reconciled.reconciliation.staleRecords).toEqual([])
        expect(reconciled.reconciliation.newStubIds).toEqual([])
      }
    },
  )

  let scratch: string
  beforeEach(async () => {
    scratch = await mkdtemp(path.join(os.tmpdir(), "repo-contract-preset-commands-integration-"))
  })
  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true })
  })

  it("scaffolds a blank stub for a fresh preset command", async () => {
    await mkdir(path.join(scratch, "src", "presets"), { recursive: true })
    await writeFile(
      path.join(scratch, "src", "presets", "x.ts"),
      'export const x = { run: ["some-new-tool", "--flag"] }\n',
      "utf8",
    )

    const evidence = await runPresetCommandsScan(scratch)
    expect(evidence.ok).toBe(true)
    if (!evidence.ok) return
    expect(evidence.registryError).toBeUndefined()
    expect(evidence.scaffoldedIds).toEqual(["preset-command:some-new-tool"])
    expect(evidence.activeExceptions["preset-command:some-new-tool"]?.justification).toBe("")
  })
})

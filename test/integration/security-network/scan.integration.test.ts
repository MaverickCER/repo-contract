import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { reconcileExceptions } from "../../../src/helpers/index.js"
import {
  runSecurityNetworkScan,
  scanForNetworkCapability,
} from "../../../scripts/security-network/scan.js"
import {
  createNetworkStub,
  deriveNetworkExceptionId,
} from "../../../scripts/security-network/registry.js"
import type {
  NetworkCapabilityFinding,
  NetworkExceptionRecord,
} from "../../../scripts/security-network/evidence-types.js"

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const runningInsideMutationSandbox = REPO_ROOT.split(path.sep).includes(".stryker-tmp")

describe("security-network scan -- full real path", () => {
  it.runIf(!runningInsideMutationSandbox)(
    "this repository's own src/ is network-free and its registry reconciles clean (read-only composition, no write)",
    async () => {
      const { filesScanned, findings } = await scanForNetworkCapability(REPO_ROOT)
      expect(filesScanned).toBeGreaterThan(0)
      expect(findings).toEqual([])

      const reconciled = reconcileExceptions<NetworkCapabilityFinding, NetworkExceptionRecord>({
        existing: [],
        findings: [...findings],
        deriveId: (finding) => finding.id,
        createStub: createNetworkStub,
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
    scratch = await mkdtemp(path.join(os.tmpdir(), "repo-contract-security-network-integration-"))
  })
  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true })
  })

  it("creates the exceptions directory and scaffolds a stub for a fresh finding", async () => {
    await mkdir(path.join(scratch, "src"), { recursive: true })
    await writeFile(
      path.join(scratch, "src", "bad.ts"),
      'import { request } from "node:https"\nexport const x = request\n',
      "utf8",
    )

    const evidence = await runSecurityNetworkScan(scratch)

    expect(evidence.registryError).toBeUndefined()
    expect(evidence.findings.length).toBeGreaterThan(0)
    expect(evidence.scaffoldedIds.length).toBe(evidence.findings.length)
    for (const finding of evidence.findings) {
      expect(evidence.activeExceptions[finding.id]?.justification).toBe("")
      expect(deriveNetworkExceptionId(finding)).toBe(finding.id)
    }
  })
})

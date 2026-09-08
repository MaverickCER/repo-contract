import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runSecurityNetworkScan } from "../../../scripts/security-network/scan.js"

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const runningInsideMutationSandbox = REPO_ROOT.split(path.sep).includes(".stryker-tmp")

describe("runSecurityNetworkScan -- full real path", () => {
  it.runIf(!runningInsideMutationSandbox)(
    "reports a reconciled, clean registry against this repository's own src/ (no error, no stale, no scaffolded stub)",
    async () => {
      const evidence = await runSecurityNetworkScan(REPO_ROOT)

      expect(evidence.registryError).toBeUndefined()
      expect(evidence.filesScanned).toBeGreaterThan(0)
      expect(evidence.findings).toEqual([])
      expect(evidence.activeExceptions).toEqual({})
      expect(evidence.staleExceptions).toEqual([])
      expect(evidence.scaffoldedIds).toEqual([])
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
    // A brand-new tree with a src/ file that performs network I/O and no registry.
    const { mkdir, writeFile } = await import("node:fs/promises")
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
    }
  })
})

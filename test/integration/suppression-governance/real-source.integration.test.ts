import path from "node:path"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { reconcileExceptions, serializeExceptionRegistry } from "../../../src/helpers/index.js"
import { discoverSuppressions } from "../../../scripts/suppression-governance/discover-suppressions.js"
import { listSourceFiles } from "../../../scripts/suppression-governance/find-source-files.js"
import {
  SUPPRESSION_EXCEPTION_SCHEMA,
  asFlatRecords,
  createSuppressionStub,
  deriveSuppressionId,
  validateExceptionRegistry,
} from "../../../scripts/suppression-governance/evidence-types.js"
import type {
  SuppressionExceptionRecord,
  SuppressionFinding,
} from "../../../scripts/suppression-governance/evidence-types.js"

/**
 * Proves the committed disable-comments.json is currently reconciled with this repository's own
 * real source -- previously only ever verified as a side effect of actually running the full
 * `suppression-governance` check via `npm run contract`, never as part of `npm test`.
 *
 * Deliberately calls the execution-layer functions directly (listSourceFiles -> discoverSuppressions
 * -> reconcileExceptions) rather than `runSuppressionGovernanceCheck`, which has a real `writeFile`
 * side effect on disagreement -- this composition has no write path at all.
 */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url))

// A real, on-disk Stryker mutation-testing sandbox is a temporary, deliberately-mutated copy of
// this repository -- Stryker instruments every `mutate`-scope file, shifting line numbers. This
// test's premise ("the committed registry has zero drift against the current source tree") is
// about the real, committed repository, not a sandbox copy. Detected structurally.
const runningInsideMutationSandbox = REPO_ROOT.split(path.sep).includes(".stryker-tmp")

describe("disable-comments.json stays reconciled with real source", () => {
  it.runIf(!runningInsideMutationSandbox)(
    "the committed registry has zero stale records and zero unscaffolded findings against the real, current source tree, and is byte-identical to its canonical serialization",
    async () => {
      const registryUrl = new URL(
        "../../../.repo-contract/exceptions/disable-comments.json",
        import.meta.url,
      )
      const currentContent = await readFile(registryUrl, "utf8")
      const parsed = JSON.parse(currentContent) as { exceptions: unknown }

      const validated = validateExceptionRegistry(parsed.exceptions, SUPPRESSION_EXCEPTION_SCHEMA)
      expect(validated.ok, validated.ok ? undefined : JSON.stringify(validated.errors)).toBe(true)
      if (!validated.ok) return

      const files = await listSourceFiles(REPO_ROOT)
      const discovered = await discoverSuppressions(REPO_ROOT, files)

      const seen = new Set<string>()
      const findings: SuppressionFinding[] = []
      for (const item of discovered) {
        const id = deriveSuppressionId(item)
        const identity = JSON.stringify([
          item.file,
          item.line,
          item.domain,
          item.rule,
          item.content,
          item.reason,
        ])
        if (seen.has(identity)) continue
        seen.add(identity)
        findings.push({
          id,
          domain: item.domain,
          rule: [...item.rule],
          file: item.file,
          line: item.line,
          content: item.content,
          reason: item.reason,
        })
      }

      const reconciled = reconcileExceptions<SuppressionFinding, SuppressionExceptionRecord>({
        existing: validated.records,
        findings,
        deriveId: (finding) => finding.id,
        createStub: createSuppressionStub,
      })
      expect(reconciled.ok, reconciled.ok ? undefined : reconciled.error).toBe(true)
      if (!reconciled.ok) return

      expect(reconciled.reconciliation.staleRecords).toEqual([])
      expect(reconciled.reconciliation.newStubIds).toEqual([])

      const serialized = serializeExceptionRegistry(
        asFlatRecords([
          ...reconciled.reconciliation.activeRecords,
          ...reconciled.reconciliation.staleRecords,
        ]),
      )
      expect(currentContent).toBe(serialized)
    },
  )
})

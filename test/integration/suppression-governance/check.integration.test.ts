import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runSuppressionGovernanceCheck } from "../../../scripts/suppression-governance/check.js"
import type { SuppressionExceptionRecord } from "../../../scripts/suppression-governance/evidence-types.js"

// Repo-root-relative registry location -- kept in lockstep with
// scripts/suppression-governance/check.ts's own REGISTRY_RELATIVE_PATH.
const REGISTRY_RELATIVE_PATH = path.join(".repo-contract", "exceptions", "disable-comments.json")

/**
 * The complete real path: a real scratch directory, real files on disk, real registry reads/
 * writes -- no subprocess spawned for the check itself, per the project's
 * real-behavior-over-mocking house style.
 */

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-suppression-governance-integration-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function write(relativePath: string, content: string): Promise<void> {
  const target = path.join(root, relativePath)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content, "utf8")
}

async function readRegistry(): Promise<{ exceptions: SuppressionExceptionRecord[] }> {
  return JSON.parse(await readFile(path.join(root, REGISTRY_RELATIVE_PATH), "utf8")) as {
    exceptions: SuppressionExceptionRecord[]
  }
}

describe("runSuppressionGovernanceCheck -- full real path", () => {
  it("scaffolds a missing registry into existence on the first run", async () => {
    await write("src/example.ts", "// eslint-disable-next-line no-console\nconsole.log(1)\n")

    const evidence = await runSuppressionGovernanceCheck(root)

    expect(evidence.ok).toBe(true)
    if (!evidence.ok) return
    expect(evidence.findings).toHaveLength(1)
    expect(evidence.scaffoldedIds).toEqual(["suppression:eslint:no-console:src/example.ts:1"])
    expect(evidence.staleExceptions).toEqual([])

    const { exceptions } = await readRegistry()
    expect(exceptions).toEqual([
      {
        id: "suppression:eslint:no-console:src/example.ts:1",
        version: 1,
        justification: "",
        category: "",
        domain: "eslint",
        file: "src/example.ts",
        line: 1,
        rule: ["no-console"],
        verificationMethod: "",
      },
    ])
  })

  it("is idempotent: a second run with no source changes produces byte-identical registry contents", async () => {
    await write("src/example.ts", "// eslint-disable-next-line no-console\nconsole.log(1)\n")

    await runSuppressionGovernanceCheck(root)
    const firstContent = await readFile(path.join(root, REGISTRY_RELATIVE_PATH), "utf8")

    const secondEvidence = await runSuppressionGovernanceCheck(root)
    const secondContent = await readFile(path.join(root, REGISTRY_RELATIVE_PATH), "utf8")

    expect(secondContent).toBe(firstContent)
    expect(secondEvidence.ok).toBe(true)
    if (secondEvidence.ok) {
      expect(secondEvidence.scaffoldedIds).toEqual([])
      expect(secondEvidence.staleExceptions).toEqual([])
    }
  })

  it("preserves a hand-added justification/category/verificationMethod across a run where the directive is untouched", async () => {
    await write("src/example.ts", "// eslint-disable-next-line no-console\nconsole.log(1)\n")
    await runSuppressionGovernanceCheck(root)

    const registryPath = path.join(root, REGISTRY_RELATIVE_PATH)
    const { exceptions } = await readRegistry()
    const [first] = exceptions
    if (!first) throw new Error("expected the registry to contain one record")
    await writeFile(
      registryPath,
      JSON.stringify(
        {
          exceptions: [
            {
              ...first,
              justification: "Debug logging is intentional here.",
              category: "rule-not-applicable",
              verificationMethod: "static-reasoning",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    )

    const evidence = await runSuppressionGovernanceCheck(root)

    expect(evidence.ok).toBe(true)
    if (evidence.ok) {
      const record = evidence.activeExceptions[first.id]
      expect(record?.justification).toBe("Debug logging is intentional here.")
      expect(record?.category).toBe("rule-not-applicable")
      expect(record?.verificationMethod).toBe("static-reasoning")
      expect(evidence.scaffoldedIds).toEqual([])
    }

    const after = await readRegistry()
    expect(after.exceptions[0]?.justification).toBe("Debug logging is intentional here.")
    expect(after.exceptions[0]?.category).toBe("rule-not-applicable")
  })

  it("a fully-classified record survives two consecutive runs byte-identically", async () => {
    await write("src/example.ts", "// eslint-disable-next-line no-console\nconsole.log(1)\n")
    await runSuppressionGovernanceCheck(root)

    const registryPath = path.join(root, REGISTRY_RELATIVE_PATH)
    const { exceptions } = await readRegistry()
    const [first] = exceptions
    if (!first) throw new Error("expected the registry to contain one record")
    await writeFile(
      registryPath,
      JSON.stringify(
        {
          exceptions: [
            {
              ...first,
              justification: "Because.",
              category: "equivalent-mutant",
              verificationMethod: "mutation-run",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    )

    await runSuppressionGovernanceCheck(root)
    const run1Bytes = await readFile(registryPath, "utf8")

    await runSuppressionGovernanceCheck(root)
    const run2Bytes = await readFile(registryPath, "utf8")

    expect(run2Bytes).toBe(run1Bytes)
  })

  it("surfaces -- never removes -- a registry record whose directive was deleted from source", async () => {
    await write("src/example.ts", "// eslint-disable-next-line no-console\nconsole.log(1)\n")
    await runSuppressionGovernanceCheck(root)

    await write("src/example.ts", "console.log(1)\n")
    const evidence = await runSuppressionGovernanceCheck(root)

    expect(evidence.ok).toBe(true)
    if (evidence.ok) {
      expect(evidence.findings).toHaveLength(0)
      expect(evidence.activeExceptions).toEqual({})
      expect(evidence.staleExceptions.map((r) => r.id)).toEqual([
        "suppression:eslint:no-console:src/example.ts:1",
      ])
    }

    // The stale record is kept on disk -- retiring it is an explicit human edit.
    const { exceptions } = await readRegistry()
    expect(exceptions).toHaveLength(1)
  })

  it("leaves a malformed pre-existing registry untouched and reports ok: false", async () => {
    await write("src/example.ts", "// eslint-disable-next-line no-console\nconsole.log(1)\n")
    const registryPath = path.join(root, REGISTRY_RELATIVE_PATH)
    const corrupted = JSON.stringify({ exceptions: [{ id: "suppression:x", version: 9 }] })
    await mkdir(path.dirname(registryPath), { recursive: true })
    await writeFile(registryPath, corrupted, "utf8")

    const evidence = await runSuppressionGovernanceCheck(root)

    expect(evidence.ok).toBe(false)
    if (!evidence.ok) {
      expect(evidence.registryValidationErrors?.length).toBeGreaterThan(0)
    }
    expect(await readFile(registryPath, "utf8")).toBe(corrupted)
  })

  it("reports ok: true even when a discovered suppression would later be judged forbidden by policy", async () => {
    await write(
      "src/example.ts",
      "// eslint-disable-next-line security/detect-object-injection\nconst x = obj[key]\n",
    )

    const evidence = await runSuppressionGovernanceCheck(root)

    expect(evidence.ok).toBe(true)
  })

  it("normalizes file paths to repository-relative POSIX paths regardless of directory nesting", async () => {
    await write(
      "src/nested/deep/example.ts",
      "// eslint-disable-next-line no-console\nconsole.log(1)\n",
    )

    const evidence = await runSuppressionGovernanceCheck(root)

    expect(evidence.ok).toBe(true)
    if (evidence.ok) {
      expect(evidence.findings[0]?.file).toBe("src/nested/deep/example.ts")
      expect(evidence.findings[0]?.id).toBe(
        "suppression:eslint:no-console:src/nested/deep/example.ts:1",
      )
    }
  })
})

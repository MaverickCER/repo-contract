import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runSuppressionGovernanceCheck } from "../../../scripts/suppression-governance/check.js"
import type { DisableCommentRecord } from "../../../scripts/suppression-governance/evidence-types.js"

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

describe("runSuppressionGovernanceCheck -- full real path", () => {
  it("synchronizes a missing registry into existence on the first run", async () => {
    await write("src/example.ts", "// eslint-disable-next-line no-console\nconsole.log(1)\n")

    const evidence = await runSuppressionGovernanceCheck(root)

    expect(evidence.ok).toBe(true)
    if (!evidence.ok) return
    expect(evidence.newCount).toBe(1)
    expect(evidence.records).toHaveLength(1)

    const onDisk = JSON.parse(
      await readFile(path.join(root, "disable-comments.json"), "utf8"),
    ) as readonly DisableCommentRecord[]
    expect(onDisk).toEqual([
      {
        file: "src/example.ts",
        line: 1,
        domain: "eslint",
        rule: ["no-console"],
        content: "eslint-disable-next-line no-console",
        justification: "",
        alternatives: "",
        remediation: "",
        category: "",
        verificationMethod: "",
        reason: "",
      },
    ])
  })

  it("is idempotent: a second run with no source changes produces byte-identical registry contents", async () => {
    await write("src/example.ts", "// eslint-disable-next-line no-console\nconsole.log(1)\n")

    await runSuppressionGovernanceCheck(root)
    const firstContent = await readFile(path.join(root, "disable-comments.json"), "utf8")

    const secondEvidence = await runSuppressionGovernanceCheck(root)
    const secondContent = await readFile(path.join(root, "disable-comments.json"), "utf8")

    expect(secondContent).toBe(firstContent)
    expect(secondEvidence.ok).toBe(true)
    if (secondEvidence.ok) {
      expect(secondEvidence.newCount).toBe(0)
      expect(secondEvidence.movedCount).toBe(0)
      expect(secondEvidence.removedCount).toBe(0)
    }
  })

  it("preserves hand-added justification/category/verificationMethod fields across a run where the suppression is untouched -- proves toPersistedRecord carries every hand-authored field through a real disk round-trip", async () => {
    await write("src/example.ts", "// eslint-disable-next-line no-console\nconsole.log(1)\n")
    await runSuppressionGovernanceCheck(root)

    const registryPath = path.join(root, "disable-comments.json")
    const records = JSON.parse(await readFile(registryPath, "utf8")) as DisableCommentRecord[]
    const [first] = records
    if (!first) throw new Error("expected the registry to contain one record")
    const withJustification = [
      {
        ...first,
        justification: "Debug logging is intentional here.",
        alternatives: "Considered a debug-only logger wrapper.",
        remediation: "Removed the console.log once; still needed for debug builds.",
        category: "rule-not-applicable",
        verificationMethod: "static-reasoning",
      },
    ]
    await writeFile(registryPath, JSON.stringify(withJustification, null, 2), "utf8")

    const evidence = await runSuppressionGovernanceCheck(root)

    expect(evidence.ok).toBe(true)
    if (evidence.ok) {
      expect(evidence.records[0]?.justification).toBe("Debug logging is intentional here.")
      expect(evidence.records[0]?.alternatives).toBe("Considered a debug-only logger wrapper.")
      expect(evidence.records[0]?.remediation).toBe(
        "Removed the console.log once; still needed for debug builds.",
      )
      expect(evidence.records[0]?.category).toBe("rule-not-applicable")
      expect(evidence.records[0]?.verificationMethod).toBe("static-reasoning")
      expect(evidence.records[0]?.status).toBe("existing")
    }

    // Re-read from disk directly (not just the in-memory evidence) -- this is the assertion that
    // actually catches toPersistedRecord dropping a field, since only the write path can lose data
    // silently while the in-memory evidence above still looks correct.
    const onDiskAfter = JSON.parse(
      await readFile(registryPath, "utf8"),
    ) as readonly DisableCommentRecord[]
    expect(onDiskAfter[0]?.category).toBe("rule-not-applicable")
    expect(onDiskAfter[0]?.verificationMethod).toBe("static-reasoning")
  })

  it("a fully-classified record survives two consecutive runs byte-identically -- category/verificationMethod round-trip through discovery/synchronization/persistence without churn", async () => {
    await write("src/example.ts", "// eslint-disable-next-line no-console\nconsole.log(1)\n")
    await runSuppressionGovernanceCheck(root)

    const registryPath = path.join(root, "disable-comments.json")
    const records = JSON.parse(await readFile(registryPath, "utf8")) as DisableCommentRecord[]
    const [first] = records
    if (!first) throw new Error("expected the registry to contain one record")
    await writeFile(
      registryPath,
      JSON.stringify(
        [
          {
            ...first,
            justification: "Because.",
            alternatives: "Considered X.",
            remediation: "Tried Y.",
            category: "equivalent-mutant",
            verificationMethod: "mutation-run",
          },
        ],
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

  it("removes a registry record whose suppression was deleted from source", async () => {
    await write("src/example.ts", "// eslint-disable-next-line no-console\nconsole.log(1)\n")
    await runSuppressionGovernanceCheck(root)

    await write("src/example.ts", "console.log(1)\n")
    const evidence = await runSuppressionGovernanceCheck(root)

    expect(evidence.ok).toBe(true)
    if (evidence.ok) {
      expect(evidence.records).toHaveLength(0)
      expect(evidence.removedCount).toBe(1)
    }
  })

  it("leaves a malformed pre-existing registry untouched and reports ok: false", async () => {
    await write("src/example.ts", "// eslint-disable-next-line no-console\nconsole.log(1)\n")
    const registryPath = path.join(root, "disable-comments.json")
    const corrupted = JSON.stringify([{ file: "", line: -1, domain: "", rule: [], content: "" }])
    await writeFile(registryPath, corrupted, "utf8")

    const evidence = await runSuppressionGovernanceCheck(root)

    expect(evidence.ok).toBe(false)
    if (!evidence.ok) {
      expect(evidence.registryValidationErrors?.length).toBeGreaterThan(0)
    }
    expect(await readFile(registryPath, "utf8")).toBe(corrupted)
  })

  it("reports ok: true (never a tool-infrastructure failure) even when a discovered suppression would later be judged forbidden by policy", async () => {
    // The script's own success/failure is about whether synchronization completed, not whether
    // any suppression is acceptable -- that judgment belongs entirely to the downstream policy
    // (checks/suppression-governance.ts), which reads this same evidence.
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
      expect(evidence.records[0]?.file).toBe("src/nested/deep/example.ts")
    }
  })
})

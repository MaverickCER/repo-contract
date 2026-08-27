import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { applyChangeset } from "../../../scripts/api-contract/changeset-manager.js"
import type { ApiContractChange } from "../../../scripts/api-contract/evidence-types.js"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-changeset-manager-"))
  await mkdir(path.join(root, ".changeset"), { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const change: ApiContractChange = {
  id: "!pkg#getUsers:function",
  path: "getUsers",
  kind: "export-added",
  compatibility: "compatible",
  explanation: "Added getUsers.",
}

const lowerTierChange: ApiContractChange = {
  id: "!pkg#InternalHelper:function",
  path: "InternalHelper",
  kind: "export-added",
  compatibility: "compatible",
  explanation: "Added InternalHelper.",
}

describe("applyChangeset", () => {
  it("touches nothing when the contract is unchanged, whether or not a changeset already exists", async () => {
    await writeFile(
      path.join(root, ".changeset", "human.md"),
      '---\n"pkg": patch\n---\n\nUnrelated fix.\n',
      "utf8",
    )

    const result = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "unchanged",
      requiredLevel: "none",
      diff: [],
      lowerTierDiff: [],
      summary: "No public API changes detected.",
      apiJsonHash: "hash1",
    })

    expect(result).toEqual({ action: "none", generatedSectionUpdated: false })
    const content = await readFile(path.join(root, ".changeset", "human.md"), "utf8")
    expect(content).toBe('---\n"pkg": patch\n---\n\nUnrelated fix.\n')
  })

  it("creates a dedicated changeset when none exists and the contract changed", async () => {
    const result = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "compatible",
      requiredLevel: "minor",
      diff: [change],
      lowerTierDiff: [],
      summary: "1 public contract change(s) detected:\n- Added getUsers.",
      apiJsonHash: "hash1",
    })

    expect(result.action).toBe("created")
    expect(result.path).toBe(path.join(".changeset", "repo-contract.md"))
    const content = await readFile(path.join(root, result.path ?? ""), "utf8")
    expect(content).toContain('"pkg": minor')
    expect(content).toContain("### API Contract Impact")
    expect(content).toContain("<!-- repo-contract:api-contract:start:hash=hash1 level=minor -->")
    expect(content).toContain("<!-- repo-contract:api-contract:end -->")
    expect(content).toContain("Added getUsers.")
  })

  it("preserves human-authored prose and appends the generated section when a human changeset already exists", async () => {
    await writeFile(
      path.join(root, ".changeset", "human-note.md"),
      '---\n"pkg": minor\n---\n\nThis is my own hand-written description.\n',
      "utf8",
    )

    const result = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "compatible",
      requiredLevel: "minor",
      diff: [change],
      lowerTierDiff: [],
      summary: "1 public contract change(s) detected:\n- Added getUsers.",
      apiJsonHash: "hash1",
    })

    expect(result.action).toBe("updated")
    expect(result.path).toBe(path.join(".changeset", "human-note.md"))
    const content = await readFile(path.join(root, result.path ?? ""), "utf8")
    expect(content).toContain("This is my own hand-written description.")
    expect(content).toContain("### API Contract Impact")
    expect(result.humanReleaseLevel).toBe("minor")
    expect(result.effectiveReleaseLevel).toBe("minor")
  })

  it("never downgrades a human-declared release level -- effective level is max(human, required)", async () => {
    await writeFile(
      path.join(root, ".changeset", "human-note.md"),
      '---\n"pkg": major\n---\n\nBig change.\n',
      "utf8",
    )

    const result = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "compatible",
      requiredLevel: "minor",
      diff: [change],
      lowerTierDiff: [],
      summary: "1 public contract change(s) detected:\n- Added getUsers.",
      apiJsonHash: "hash1",
    })

    expect(result.humanReleaseLevel).toBe("major")
    expect(result.effectiveReleaseLevel).toBe("major")
    const content = await readFile(path.join(root, result.path ?? ""), "utf8")
    expect(content).toContain('"pkg": major')
  })

  it("raises a human-declared level when the contract requires more than what was declared", async () => {
    await writeFile(
      path.join(root, ".changeset", "human-note.md"),
      '---\n"pkg": minor\n---\n\nSmall change.\n',
      "utf8",
    )

    const result = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "breaking",
      requiredLevel: "major",
      diff: [{ ...change, kind: "export-removed", compatibility: "breaking" }],
      lowerTierDiff: [],
      summary: "1 public contract change(s) detected:\n- Removed getUsers.",
      apiJsonHash: "hash1",
    })

    expect(result.effectiveReleaseLevel).toBe("major")
    const content = await readFile(path.join(root, result.path ?? ""), "utf8")
    expect(content).toContain('"pkg": major')
  })

  it("is idempotent: an unchanged evidence run produces no write on the second pass", async () => {
    const input = {
      root,
      packageName: "pkg",
      impact: "compatible" as const,
      requiredLevel: "minor" as const,
      diff: [change],
      lowerTierDiff: [],
      summary: "1 public contract change(s) detected:\n- Added getUsers.",
      apiJsonHash: "hash1",
    }

    const first = await applyChangeset(input)
    expect(first.action).toBe("created")

    const second = await applyChangeset(input)
    expect(second.action).toBe("unchanged")
    expect(second.generatedSectionUpdated).toBe(false)
  })

  it("wholesale-replaces a stale generated section rather than appending a second one", async () => {
    const first = {
      root,
      packageName: "pkg",
      impact: "compatible" as const,
      requiredLevel: "minor" as const,
      diff: [change],
      lowerTierDiff: [],
      summary: "1 public contract change(s) detected:\n- Added getUsers.",
      apiJsonHash: "hash1",
    }
    await applyChangeset(first)

    const second = await applyChangeset({
      ...first,
      diff: [{ ...change, id: "!pkg#getUsersV2:function", explanation: "Added getUsersV2." }],
      summary: "1 public contract change(s) detected:\n- Added getUsersV2.",
      apiJsonHash: "hash2",
    })

    expect(second.action).toBe("updated")
    const content = await readFile(path.join(root, second.path ?? ""), "utf8")
    expect(content.match(/### API Contract Impact/g)).toHaveLength(1)
    expect(content.match(/repo-contract:api-contract:start/g)).toHaveLength(1)
    expect(content).toContain("Added getUsersV2.")
    expect(content).not.toContain("Added getUsers.\n")
  })

  it("falls back to a dedicated file when multiple ambiguous un-marked changesets already exist", async () => {
    await writeFile(
      path.join(root, ".changeset", "one.md"),
      '---\n"pkg": patch\n---\n\nFirst.\n',
      "utf8",
    )
    await writeFile(
      path.join(root, ".changeset", "two.md"),
      '---\n"pkg": patch\n---\n\nSecond.\n',
      "utf8",
    )

    const result = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "compatible",
      requiredLevel: "minor",
      diff: [change],
      lowerTierDiff: [],
      summary: "1 public contract change(s) detected:\n- Added getUsers.",
      apiJsonHash: "hash1",
    })

    expect(result.path).toBe(path.join(".changeset", "repo-contract.md"))
    const one = await readFile(path.join(root, ".changeset", "one.md"), "utf8")
    const two = await readFile(path.join(root, ".changeset", "two.md"), "utf8")
    expect(one).toBe('---\n"pkg": patch\n---\n\nFirst.\n')
    expect(two).toBe('---\n"pkg": patch\n---\n\nSecond.\n')
  })

  it("appends a warning section for unknown impact without inventing or altering a release level, and never creates a new file for it", async () => {
    const noneCreated = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "unknown",
      requiredLevel: undefined,
      diff: [{ ...change, compatibility: "unknown", kind: "indeterminate" }],
      lowerTierDiff: [],
      summary:
        "The public contract changed, but one or more changes could not be classified deterministically:\n- ?",
      apiJsonHash: "hash1",
    })
    expect(noneCreated).toEqual({ action: "none", generatedSectionUpdated: false })

    await writeFile(
      path.join(root, ".changeset", "human-note.md"),
      '---\n"pkg": minor\n---\n\nSome change.\n',
      "utf8",
    )
    const result = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "unknown",
      requiredLevel: undefined,
      diff: [{ ...change, compatibility: "unknown", kind: "indeterminate" }],
      lowerTierDiff: [],
      summary:
        "The public contract changed, but one or more changes could not be classified deterministically:\n- ?",
      apiJsonHash: "hash1",
    })

    expect(result.action).toBe("updated")
    const content = await readFile(path.join(root, result.path ?? ""), "utf8")
    expect(content).toContain('"pkg": minor')
    expect(content).toContain("Some change.")
    expect(content).toContain("could not be classified deterministically")
    expect(content).not.toMatch(/minimum required release level/i)
  })

  // -- Part A: human-vs-machine level tracking, revert cleanup, and the ratchet-can-lower fix --

  it("removes the file entirely when a revert leaves nothing of value (no human prose, no recoverable human level)", async () => {
    const created = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "breaking",
      requiredLevel: "major",
      diff: [{ ...change, kind: "export-removed", compatibility: "breaking" }],
      lowerTierDiff: [],
      summary: "1 public contract change(s) detected:\n- Removed getUsers.",
      apiJsonHash: "hash1",
    })
    expect(created.action).toBe("created")

    const reverted = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "unchanged",
      requiredLevel: "none",
      diff: [],
      lowerTierDiff: [],
      summary: "No public API changes detected.",
      apiJsonHash: "hash1",
    })

    expect(reverted).toEqual({
      action: "removed",
      path: created.path,
      generatedSectionUpdated: true,
    })
    await expect(readFile(path.join(root, created.path ?? ""), "utf8")).rejects.toThrow()
  })

  it("cleans up the stale generated section but keeps the file when human prose remains", async () => {
    await writeFile(
      path.join(root, ".changeset", "human-note.md"),
      '---\n"pkg": minor\n---\n\nMy own note.\n',
      "utf8",
    )
    const created = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "compatible",
      requiredLevel: "minor",
      diff: [change],
      lowerTierDiff: [],
      summary: "1 public contract change(s) detected:\n- Added getUsers.",
      apiJsonHash: "hash1",
    })
    expect(created.action).toBe("updated")

    const reverted = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "unchanged",
      requiredLevel: "none",
      diff: [],
      lowerTierDiff: [],
      summary: "No public API changes detected.",
      apiJsonHash: "hash1",
    })

    expect(reverted.action).toBe("updated")
    const content = await readFile(path.join(root, reverted.path ?? ""), "utf8")
    expect(content).toBe('---\n"pkg": patch\n---\n\nMy own note.\n')
    expect(content).not.toContain("API Contract Impact")
  })

  it("lowers the machine's own prior level on a later run when the requirement drops (ratchet is not stuck by the machine's own stale claim)", async () => {
    const first = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "breaking",
      requiredLevel: "major",
      diff: [{ ...change, kind: "export-removed", compatibility: "breaking" }],
      lowerTierDiff: [],
      summary: "1 public contract change(s) detected:\n- Removed getUsers.",
      apiJsonHash: "hash1",
    })
    expect(first.action).toBe("created")
    const afterFirst = await readFile(path.join(root, first.path ?? ""), "utf8")
    expect(afterFirst).toContain('"pkg": major')

    const second = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "compatible",
      requiredLevel: "minor",
      diff: [change],
      lowerTierDiff: [],
      summary: "1 public contract change(s) detected:\n- Added getUsers.",
      apiJsonHash: "hash2",
    })

    expect(second.humanReleaseLevel).toBeUndefined()
    expect(second.effectiveReleaseLevel).toBe("minor")
    const content = await readFile(path.join(root, second.path ?? ""), "utf8")
    expect(content).toContain('"pkg": minor')
    expect(content).not.toContain('"pkg": major')
  })

  it("never lowers a human level that was manually raised strictly above what the machine itself last claimed", async () => {
    const first = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "compatible",
      requiredLevel: "minor",
      diff: [change],
      lowerTierDiff: [],
      summary: "1 public contract change(s) detected:\n- Added getUsers.",
      apiJsonHash: "hash1",
    })
    expect(first.action).toBe("created")

    // A human manually edits the frontmatter to "major" without running the check.
    const machineContent = await readFile(path.join(root, first.path ?? ""), "utf8")
    await writeFile(
      path.join(root, first.path ?? ""),
      machineContent.replace('"pkg": minor', '"pkg": major'),
      "utf8",
    )

    const second = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "compatible",
      requiredLevel: "patch",
      diff: [],
      lowerTierDiff: [],
      summary: "1 public contract change(s) detected:\n- Changed something patch-level.",
      apiJsonHash: "hash2",
    })

    expect(second.humanReleaseLevel).toBe("major")
    expect(second.effectiveReleaseLevel).toBe("major")
    const content = await readFile(path.join(root, second.path ?? ""), "utf8")
    expect(content).toContain('"pkg": major')
  })

  it("carries the machine's own last definitive level forward through an intervening unknown-impact run", async () => {
    const first = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "breaking",
      requiredLevel: "major",
      diff: [{ ...change, kind: "export-removed", compatibility: "breaking" }],
      lowerTierDiff: [],
      summary: "1 public contract change(s) detected:\n- Removed getUsers.",
      apiJsonHash: "hash1",
    })
    expect(first.action).toBe("created")

    const unknownRun = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "unknown",
      requiredLevel: undefined,
      diff: [{ ...change, compatibility: "unknown", kind: "indeterminate" }],
      lowerTierDiff: [],
      summary:
        "The public contract changed, but one or more changes could not be classified deterministically:\n- ?",
      apiJsonHash: "hash1",
    })
    expect(unknownRun.action).toBe("updated")
    const afterUnknown = await readFile(path.join(root, unknownRun.path ?? ""), "utf8")
    expect(afterUnknown).toContain("level=major")

    const later = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "compatible",
      requiredLevel: "minor",
      diff: [change],
      lowerTierDiff: [],
      summary: "1 public contract change(s) detected:\n- Added getUsers.",
      apiJsonHash: "hash2",
    })

    // Proves the memory wasn't lost: if the unknown-impact run had erased machineLevel, this would
    // wrongly stay "major" (misread as a human declaration) instead of correctly lowering to "minor".
    expect(later.effectiveReleaseLevel).toBe("minor")
  })

  // -- Part B: comprehensive lower-tier (@internal/@alpha/@beta) visibility, informational-only --

  it("includes an informational lower-tier block alongside a genuine public change", async () => {
    const result = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "compatible",
      requiredLevel: "minor",
      diff: [change],
      lowerTierDiff: [lowerTierChange],
      summary: "1 public contract change(s) detected:\n- Added getUsers.",
      apiJsonHash: "hash1",
    })

    expect(result.action).toBe("created")
    const content = await readFile(path.join(root, result.path ?? ""), "utf8")
    expect(content).toContain("Added getUsers.")
    expect(content).toContain("non-public contract change(s) also detected")
    expect(content).toContain("Added InternalHelper.")
  })

  it("never creates a new file solely for lower-tier informational content when the public contract is unchanged", async () => {
    const result = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "unchanged",
      requiredLevel: "none",
      diff: [],
      lowerTierDiff: [lowerTierChange],
      summary: "No public API changes detected.",
      apiJsonHash: "hash1",
    })

    expect(result).toEqual({ action: "none", generatedSectionUpdated: false })
  })

  it("adds lower-tier informational content to an already-existing machine-touched file even when the public contract is unchanged", async () => {
    const created = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "compatible",
      requiredLevel: "minor",
      diff: [change],
      lowerTierDiff: [],
      summary: "1 public contract change(s) detected:\n- Added getUsers.",
      apiJsonHash: "hash1",
    })
    expect(created.action).toBe("created")

    const later = await applyChangeset({
      root,
      packageName: "pkg",
      impact: "unchanged",
      requiredLevel: "none",
      diff: [],
      lowerTierDiff: [lowerTierChange],
      summary: "No public API changes detected.",
      apiJsonHash: "hash2",
    })

    expect(later.action).toBe("updated")
    const content = await readFile(path.join(root, later.path ?? ""), "utf8")
    expect(content).toContain("non-public contract change(s) also detected")
    expect(content).toContain("Added InternalHelper.")
    expect(content).not.toContain("Added getUsers.")
    expect(content).not.toMatch(/minimum required release level/i)
  })
})

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { checkAdrStructure } from "../../../scripts/check-adr-structure.mjs"

/**
 * True positive / true negative for scripts/check-adr-structure.mjs, matching
 * rules.test.ts's own precedent for the dependency-cruiser layering rules: real fixture files,
 * both violating and clean cases, so an overly-strict or overly-loose validator would be caught
 * here, not just "the script exists and runs."
 */

let root: string

async function writeAdr(number: string, slug: string, headings: readonly string[]): Promise<void> {
  const body = [`# ${number}: A fixture decision`, "", ...headings.map((h) => `${h}\n\nsome text.`)]
  await writeFile(
    path.join(root, "specs", "decisions", `${number}-${slug}.md`),
    body.join("\n\n"),
    "utf8",
  )
}

const ALL_HEADINGS = [
  "## Status",
  "## Context",
  "## Decision",
  "## Consequences",
  "## Alternatives considered",
]

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-adr-structure-"))
  await mkdir(path.join(root, "specs", "decisions"), { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("checkAdrStructure -- true positive / true negative", () => {
  it("reports zero violations on a correctly-shaped ADR tree", async () => {
    await writeAdr("0001", "first-decision", ALL_HEADINGS)
    await writeAdr("0002", "second-decision", ALL_HEADINGS)

    const result = checkAdrStructure(root)

    expect(result).toEqual({ ok: true, filesScanned: 2, violations: [] })
  })

  it("accepts a numbering gap with no duplicate -- gaps are deliberately allowed, not accidentally allowed", async () => {
    await writeAdr("0001", "first-decision", ALL_HEADINGS)
    await writeAdr("0003", "third-decision", ALL_HEADINGS)

    const result = checkAdrStructure(root)

    expect(result).toEqual({ ok: true, filesScanned: 2, violations: [] })
  })

  it("flags a filename that doesn't match the required NNNN-kebab-title.md shape", async () => {
    await writeFile(
      path.join(root, "specs", "decisions", "not-a-valid-adr-name.md"),
      "# not a valid ADR\n",
      "utf8",
    )

    const result = checkAdrStructure(root)

    expect(result.ok).toBe(true)
    expect(result.ok && result.violations).toContainEqual(
      expect.stringContaining(
        "not-a-valid-adr-name.md does not match the required NNNN-kebab-title.md filename shape",
      ),
    )
  })

  it("flags two files that share the same ADR number", async () => {
    await writeAdr("0003", "first-take", ALL_HEADINGS)
    await writeAdr("0003", "second-take", ALL_HEADINGS)

    const result = checkAdrStructure(root)

    expect(result.ok).toBe(true)
    expect(result.ok && result.violations).toContainEqual(
      expect.stringContaining("ADR number 0003 is used by more than one file"),
    )
  })

  it("flags a file missing a required heading", async () => {
    await writeAdr(
      "0001",
      "incomplete-decision",
      ALL_HEADINGS.filter((h) => h !== "## Alternatives considered"),
    )

    const result = checkAdrStructure(root)

    expect(result.ok).toBe(true)
    expect(result.ok && result.violations).toContainEqual(
      expect.stringContaining(
        "0001-incomplete-decision.md is missing required heading(s): ## Alternatives considered",
      ),
    )
  })

  it("flags a required heading present only at the wrong level or inside prose, not as its own line", async () => {
    await writeFile(
      path.join(root, "specs", "decisions", "0001-shallow-headings.md"),
      [
        "# 0001: x",
        "",
        "### Status", // a level-3 heading, not `## Status`
        "",
        "This section discusses `## Context` and `## Decision` handling.", // mentioned in prose
        "",
        "## Consequences",
        "",
        "## Alternatives considered",
      ].join("\n"),
      "utf8",
    )

    const result = checkAdrStructure(root)

    expect(result.ok).toBe(true)
    expect(result.ok && result.violations).toContainEqual(
      expect.stringContaining(
        "0001-shallow-headings.md is missing required heading(s): ## Status, ## Context, ## Decision",
      ),
    )
  })

  it("does not flag an extra heading beyond the required five", async () => {
    await writeAdr("0001", "with-extra-section", [...ALL_HEADINGS, "## Related"])

    const result = checkAdrStructure(root)

    expect(result).toEqual({ ok: true, filesScanned: 1, violations: [] })
  })

  it("reports a tool-infrastructure failure, not a violation, when specs/decisions/ doesn't exist", async () => {
    await rm(path.join(root, "specs", "decisions"), { recursive: true, force: true })

    const result = checkAdrStructure(root)

    expect(result.ok).toBe(false)
  })
})

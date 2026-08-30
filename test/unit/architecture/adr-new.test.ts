import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createAdr, nextAdrNumber, toKebabSlug } from "../../../scripts/adr-new.mjs"
import { checkAdrStructure } from "../../../scripts/check-adr-structure.mjs"

/**
 * scripts/adr-new.mjs scaffolds the next ADR. The output must satisfy
 * scripts/check-adr-structure.mjs (asserted here by running it), the number
 * must be highest-existing + 1 (gaps left alone), and an existing file must
 * never be clobbered.
 */

let root: string

async function writeAdr(name: string): Promise<void> {
  await writeFile(
    path.join(root, "specs", "decisions", name),
    [
      "# 0000: x",
      "",
      "## Status",
      "",
      "## Context",
      "",
      "## Decision",
      "",
      "## Consequences",
      "",
      "## Alternatives considered",
      "",
    ].join("\n"),
    "utf8",
  )
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-adr-new-"))
  await mkdir(path.join(root, "specs", "decisions"), { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("toKebabSlug", () => {
  it("lowercases, collapses non-alphanumerics, and trims dashes", () => {
    expect(toKebabSlug("  The Decision: use dependsOn, not retries!  ")).toBe(
      "the-decision-use-dependson-not-retries",
    )
  })
})

describe("nextAdrNumber", () => {
  it("is highest existing + 1, zero-padded", () => {
    expect(nextAdrNumber(["0001-a.md", "0008-b.md", "0015-c.md", "README.md"])).toBe("0016")
  })

  it("ignores numbering gaps rather than filling them", () => {
    expect(nextAdrNumber(["0001-a.md", "0003-b.md"])).toBe("0004")
  })

  it("starts at 0001 in an empty directory", () => {
    expect(nextAdrNumber([])).toBe("0001")
  })
})

describe("createAdr", () => {
  it("writes NNNN-slug.md that passes checkAdrStructure", async () => {
    await writeAdr("0001-first.md")
    await writeAdr("0002-second.md")

    const { number, slug, filePath } = await createAdr(root, "Adopt a scaffold for records")

    expect(number).toBe("0003")
    expect(slug).toBe("adopt-a-scaffold-for-records")
    expect(path.basename(filePath)).toBe("0003-adopt-a-scaffold-for-records.md")

    const contents = await readFile(filePath, "utf8")
    expect(contents.startsWith("# 0003: Adopt a scaffold for records\n")).toBe(true)

    expect(checkAdrStructure(root)).toEqual({ ok: true, filesScanned: 3, violations: [] })
  })

  it("advances the number on each call rather than reusing an existing one", async () => {
    const first = await createAdr(root, "same title")
    const second = await createAdr(root, "same title")
    expect(first.number).toBe("0001")
    expect(second.number).toBe("0002")
    expect(checkAdrStructure(root).ok).toBe(true)
  })

  it("rejects a title with no usable characters", async () => {
    await expect(createAdr(root, "   !!!   ")).rejects.toThrow(/no usable letters/)
  })

  it("rejects an empty title", async () => {
    await expect(createAdr(root, "")).rejects.toThrow(/Provide a title/)
  })
})

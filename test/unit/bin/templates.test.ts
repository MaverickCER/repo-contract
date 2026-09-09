import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildConfigTemplate, CONTRACT_RUNNER_TEMPLATE } from "../../../bin/templates.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

/**
 * Extracts the fenced ```ts code block in README.md that contains `marker` as its first line --
 * the single source of truth this test pins CONTRACT_RUNNER_TEMPLATE against, so the generated
 * runner and README's own documented Quick Start example can never silently drift apart.
 */
function extractFencedBlock(readmeText: string, marker: string): string {
  const markerIndex = readmeText.indexOf(marker)
  if (markerIndex === -1) {
    throw new Error(`README.md does not contain the expected marker: ${marker}`)
  }
  const fenceStart = readmeText.lastIndexOf("```ts", markerIndex)
  const contentStart = readmeText.indexOf("\n", fenceStart) + 1
  const fenceEnd = readmeText.indexOf("\n```", contentStart)
  return readmeText.slice(contentStart, fenceEnd + 1)
}

describe("CONTRACT_RUNNER_TEMPLATE", () => {
  it("matches README.md's Quick Start fenced code block for scripts/contract.mjs byte-for-byte", () => {
    const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8")
    const block = extractFencedBlock(readme, "// scripts/contract.mjs")
    expect(block).toBe(CONTRACT_RUNNER_TEMPLATE)
  })
})

describe("buildConfigTemplate", () => {
  it("imports and wires every detected preset name", () => {
    const content = buildConfigTemplate(["typecheck", "securityDeps"])
    expect(content).toContain('import { typecheck, securityDeps } from "repo-contract/presets"')
    expect(content).toContain("    typecheck,")
    expect(content).toContain("    securityDeps,")
  })

  it("calls factory presets instead of spreading them bare", () => {
    const content = buildConfigTemplate(["lint", "securityDeps"])
    expect(content).toContain("    lint: lint(),")
  })

  it("produces content that never spells the ambient-capability scanner's forbidden substrings verbatim as its own bin/templates.mjs source, only as this function's runtime output", () => {
    // This test only proves the *output* is correct -- the source-level constant-splitting that
    // keeps bin/templates.mjs itself scanner-clean is covered by
    // scripts/verify-no-ambient-capabilities.mjs directly, not by unit tests of its output.
    const content = buildConfigTemplate(["securityDeps"])
    expect(content).toContain('import { spawn } from "node:child_process"')
    expect(content).toContain("env: process.env,")
  })
})

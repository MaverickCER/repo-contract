import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  buildConfigTemplate,
  buildTierConfigTemplate,
  CONTRACT_RUNNER_TEMPLATE,
  spreadTierOf,
  tierInitHeadline,
} from "../../../bin/templates.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

/**
 * Extracts the fenced ```ts code block in GUIDE.md that contains `marker` as its first line:
 * the single source of truth this test pins CONTRACT_RUNNER_TEMPLATE against, so the generated
 * runner and GUIDE.md's documented runner example can never silently drift apart.
 */
function extractFencedBlock(documentText: string, marker: string): string {
  const markerIndex = documentText.indexOf(marker)
  if (markerIndex === -1) {
    throw new Error(`GUIDE.md does not contain the expected marker: ${marker}`)
  }
  const fenceStart = documentText.lastIndexOf("```ts", markerIndex)
  const contentStart = documentText.indexOf("\n", fenceStart) + 1
  const fenceEnd = documentText.indexOf("\n```", contentStart)
  return documentText.slice(contentStart, fenceEnd + 1)
}

describe("CONTRACT_RUNNER_TEMPLATE", () => {
  it("matches GUIDE.md's runner fenced code block for scripts/contract.mjs byte-for-byte", () => {
    const guide = readFileSync(path.join(repoRoot, "GUIDE.md"), "utf8")
    const block = extractFencedBlock(guide, "// scripts/contract.mjs")
    expect(block).toBe(CONTRACT_RUNNER_TEMPLATE)
  })
})

describe("buildConfigTemplate", () => {
  it("imports and wires every detected preset name", () => {
    const content = buildConfigTemplate(["typecheck", "securityDeps"])
    expect(content).toContain('import { typecheck, securityDeps } from "repo-contract/presets"')
    expect(content).toContain("    typecheck,")
    expect(content).toContain("    securityDeps: securityDeps(),")
  })

  it("puts each check on its own line", () => {
    const content = buildConfigTemplate(["typecheck", "lint", "securityDeps"])
    expect(content).toContain(
      "  checks: {\n    typecheck,\n    lint: lint(),\n    securityDeps: securityDeps(),\n  },\n",
    )
  })

  it("calls factory presets instead of spreading them bare", () => {
    const content = buildConfigTemplate(["lint", "securityDeps"])
    expect(content).toContain("    lint: lint(),")
  })

  it("calls securityDeps and arethetypeswrong, which became factories in this release", () => {
    const content = buildConfigTemplate(["arethetypeswrong", "securityDeps"])
    expect(content).toContain("    arethetypeswrong: arethetypeswrong(),")
    expect(content).toContain("    securityDeps: securityDeps(),")
    expect(content).not.toMatch(/^ {4}(arethetypeswrong|securityDeps),$/m)
  })

  it("produces content that never spells the ambient-capability scanner's forbidden substrings verbatim as its own bin/templates.mjs source, only as this function's runtime output", () => {
    // This test only proves the *output* is correct: the source-level constant-splitting that
    // keeps bin/templates.mjs itself scanner-clean is covered by
    // the `AmbientCapabilities` check directly, not by unit tests of its output.
    const content = buildConfigTemplate(["securityDeps"])
    expect(content).toContain('import { spawn } from "node:child_process"')
    expect(content).toContain("env: process.env,")
  })
})

describe("buildTierConfigTemplate", () => {
  it.each(["basic", "app", "library", "strict"] as const)(
    "spreads %s() from repo-contract/tiers into defineRepoContract",
    (tier) => {
      const content = buildTierConfigTemplate(tier)
      expect(content).toContain(`import { ${tier} } from "repo-contract/tiers"`)
      expect(content).toContain('import { defineRepoContract } from "repo-contract"')
      expect(content).toMatch(new RegExp(`^ {2}\\.\\.\\.${tier}\\(\\),$`, "m"))
      expect(content).toContain(`repo-contract init --preset ${tier}`)
      expect(content).toContain("repo-contract explain")
      expect(content).not.toContain("repo-contract/presets")
    },
  )

  it("supplies spawn and the environment, as the flat config does", () => {
    const content = buildTierConfigTemplate("app")
    expect(content).toContain('import { spawn } from "node:child_process"')
    expect(content).toContain("env: process.env,")
  })

  it("throws a RangeError for a name that is not a tier", () => {
    expect(() => buildTierConfigTemplate("fleet" as never)).toThrow(RangeError)
    expect(() => buildTierConfigTemplate("fleet" as never)).toThrow("basic, app, library, strict")
  })
})

describe("spreadTierOf", () => {
  it.each(["basic", "app", "library", "strict"] as const)(
    "reads %s from the config init --preset writes",
    (tier) => {
      expect(spreadTierOf(buildTierConfigTemplate(tier))).toBe(tier)
    },
  )

  it("reads a spread with options and spaces", () => {
    expect(spreadTierOf("  ... strict ({ Typecheck: false }),")).toBe("strict")
    expect(spreadTierOf("...app(),\n...strict(),")).toBe("app")
  })

  it("finds no tier in a flat config, a call without a spread or a longer name", () => {
    expect(spreadTierOf(buildConfigTemplate(["securityDeps"]))).toBeUndefined()
    expect(spreadTierOf("// mine\n")).toBeUndefined()
    expect(spreadTierOf("strict({ Typecheck: false })")).toBeUndefined()
    expect(spreadTierOf("...myapp(), ...strictest(), ...app")).toBeUndefined()
  })

  it("skips a commented-out spread of another tier", () => {
    expect(spreadTierOf("  // ...strict(),\n  ...library(),")).toBe("library")
    expect(spreadTierOf("/* was:\n  ...strict()\n */\n...app()")).toBe("app")
    expect(spreadTierOf("// ...strict(")).toBeUndefined()
    expect(spreadTierOf("/* never closed ...strict(")).toBeUndefined()
  })

  it("reads a comment as a gap between tokens, as JavaScript does", () => {
    expect(spreadTierOf("...st/* */rict(), ...app()")).toBe("app")
  })

  it("keeps a // or /* inside a string, such as a URL", () => {
    expect(spreadTierOf('{ docs: "https://example.test/a", ...app() }')).toBe("app")
    expect(spreadTierOf("{ docs: 'https://example.test/a', ...app() }")).toBe("app")
    expect(spreadTierOf("{ docs: `https://example.test/a`, ...app() }")).toBe("app")
    expect(spreadTierOf('{ glob: "src/*", ...app(), end: "*/" }')).toBe("app")
    expect(spreadTierOf('{ note: "say \\"//\\"", ...app() }')).toBe("app")
  })

  it("skips a spread written inside a string", () => {
    expect(spreadTierOf('const note = "...strict()"\nexport default { ...app() }')).toBe("app")
    expect(spreadTierOf("const note = '...strict()', other = `...basic()`")).toBeUndefined()
  })
})

describe("tierInitHeadline", () => {
  const kept = "repo-contract init: kept the existing repo-contract.config.mts"

  it("names the tier it wrote", () => {
    expect(tierInitHeadline("strict", undefined)).toEqual({
      lines: ["repo-contract initialized: tier strict"],
      tier: "strict",
    })
  })

  it("says a kept config already spreads the tier asked for", () => {
    expect(tierInitHeadline("app", buildTierConfigTemplate("app"))).toEqual({
      lines: [`${kept}, which already spreads tier app.`],
      tier: "app",
    })
  })

  it("names the other tier a kept config spreads, and how to move", () => {
    expect(tierInitHeadline("strict", buildTierConfigTemplate("app"))).toEqual({
      lines: [
        `${kept}, which spreads tier app, not strict.`,
        "To move to strict, spread strict() in place of app(), or delete the file and run init again.",
      ],
      tier: "app",
    })
  })

  it("says a kept config spreads no tier, and how to add one", () => {
    expect(tierInitHeadline("library", "// mine\n")).toEqual({
      lines: [
        `${kept}, which spreads no tier.`,
        "To use library, spread library() in it, or delete the file and run init again.",
      ],
      tier: undefined,
    })
  })
})

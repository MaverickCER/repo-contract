import { describe, expect, it } from "vitest"
import { brokenLinks } from "../../../src/presets/broken-links.js"
import { enoentEvidence, fakeContext, fakeCheckEvidence } from "./fixtures.js"

describe("brokenLinks preset", () => {
  it("defaults to start '.'", () => {
    expect(brokenLinks().run).toEqual([
      "linkinator",
      ".",
      "--recurse",
      "--format",
      "json",
      "--skip",
      "node_modules",
    ])
  })

  it("threads a custom start option into the run command", () => {
    expect(brokenLinks({ start: "docs" }).run).toEqual([
      "linkinator",
      "docs",
      "--recurse",
      "--format",
      "json",
      "--skip",
      "node_modules",
    ])
  })

  it("fails with an actionable message when linkinator is not installed", async () => {
    const result = await brokenLinks().policy(fakeContext(enoentEvidence("linkinator")))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("`linkinator`")
  })

  it("fails when output could not be parsed as JSON", async () => {
    const result = await brokenLinks().policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: false, error: "bad" } })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "linkinator output could not be parsed as JSON.",
    })
  })

  it("fails when output is entirely absent (not just success: false)", async () => {
    const result = await brokenLinks().policy(fakeContext(fakeCheckEvidence({ output: undefined })))
    expect(result).toEqual({
      outcome: "fail",
      rationale: "linkinator output could not be parsed as JSON.",
    })
  })

  it("passes when there are 0 broken links", async () => {
    const result = await brokenLinks().policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: { links: [{ url: "https://a.test", status: 200, state: "OK" }] },
          },
        }),
      ),
    )
    expect(result).toEqual({
      outcome: "pass",
      rationale: "linkinator found 0 broken link(s) across 1 checked.",
    })
  })

  it("fails cleanly (does not throw) when the parsed report has no links array", async () => {
    const result = await brokenLinks().policy(
      fakeContext(
        fakeCheckEvidence({ output: { format: "json", success: true, value: { total: 3 } } }),
      ),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "linkinator produced invalid JSON report data.",
    })
  })

  it("fails and lists each broken link, ignoring OK/SKIPPED ones, joined by newline", async () => {
    const result = await brokenLinks().policy(
      fakeContext(
        fakeCheckEvidence({
          output: {
            format: "json",
            success: true,
            value: {
              links: [
                { url: "https://a.test/gone", status: 404, state: "BROKEN", parent: "README.md" },
                { url: "https://a.test/ok", status: 200, state: "OK" },
                { url: "mailto:x", status: 0, state: "SKIPPED" },
                { url: "https://a.test/missing", status: 500, state: "BROKEN" },
              ],
            },
          },
        }),
      ),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toBe(
      [
        "linkinator found 2 broken link(s):",
        "- https://a.test/gone -- HTTP 404 (linked from README.md)",
        "- https://a.test/missing -- HTTP 500",
      ].join("\n"),
    )
  })
})

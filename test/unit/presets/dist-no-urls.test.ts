import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { distNoUrls } from "../../../src/presets/dist-no-urls.js"
import type { CheckEvidence } from "../../../src/types.js"
import { fakeCheckEvidence, fakeContext } from "./fixtures.js"

function reportEvidence(report: unknown): CheckEvidence {
  return fakeCheckEvidence({ output: { format: "json", success: true, value: report } })
}

const finding = (file: string, line: number, url: string) => ({ file, line, url })

describe("distNoUrls preset -- policy", () => {
  it("scans `dist` with node by default and a custom dir when given", () => {
    const [command, flag, source, dir] = distNoUrls().run as readonly string[]
    expect([command, flag, typeof source, dir]).toEqual(["node", "-e", "string", "dist"])
    expect((distNoUrls({ dir: "build" }).run as readonly string[])[3]).toBe("build")
  })

  it("passes when no URL is found", async () => {
    const result = await distNoUrls().policy(
      fakeContext(reportEvidence({ dirExists: true, filesScanned: 4, findings: [] })),
    )
    expect(result).toEqual({
      outcome: "pass",
      rationale: 'No non-allowlisted URLs in 4 file(s) under "dist".',
    })
  })

  it("fails listing file:line and url, and never anything else", async () => {
    const result = await distNoUrls().policy(
      fakeContext(
        reportEvidence({
          dirExists: true,
          filesScanned: 2,
          findings: [
            finding("index.js", 3, "https://a.test/x"),
            finding("a.d.ts", 9, "http://b.test"),
          ],
        }),
      ),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain('2 URL(s) found in the build output "dist"')
    expect(result.rationale).toContain("- index.js:3 https://a.test/x")
    expect(result.rationale).toContain("- a.d.ts:9 http://b.test")
    expect(result.rationale).not.toContain("more")
  })

  it("caps the listing at 20 entries and says how many more", async () => {
    const findings = Array.from({ length: 23 }, (_, i) => finding("f.js", i + 1, "https://x.test"))
    const result = await distNoUrls().policy(
      fakeContext(reportEvidence({ dirExists: true, filesScanned: 1, findings })),
    )
    expect(result.rationale).toContain("23 URL(s)")
    expect(result.rationale).toContain("- f.js:20 https://x.test")
    expect(result.rationale).not.toContain("- f.js:21 ")
    expect(result.rationale).toContain("- ...and 3 more")
  })

  it("does not print a 'more' line at exactly 20 entries", async () => {
    const findings = Array.from({ length: 20 }, (_, i) => finding("f.js", i + 1, "https://x.test"))
    const result = await distNoUrls().policy(
      fakeContext(reportEvidence({ dirExists: true, filesScanned: 1, findings })),
    )
    expect(result.rationale).not.toContain("more")
  })

  it("an allowlisted URL (exact or glob) is permitted; others still fail", async () => {
    const check = distNoUrls({
      allow: [
        { url: "https://json.schemastore.org/*", reason: "schema id required by consumers" },
        { url: "https://exact.test/", reason: "documented spec link" },
      ],
    })
    const evidence = reportEvidence({
      dirExists: true,
      filesScanned: 1,
      findings: [
        finding("a.js", 1, "https://json.schemastore.org/x.json"),
        finding("a.js", 2, "https://exact.test/"),
        finding("a.js", 3, "https://exact.test/other"),
      ],
    })
    const result = await check.policy(fakeContext(evidence))
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("1 URL(s)")
    expect(result.rationale).toContain("a.js:3 https://exact.test/other")
    expect(result.rationale).not.toContain("a.js:1")
  })

  it("passes once every finding is allowlisted", async () => {
    const check = distNoUrls({ allow: [{ url: "https://exact.test/**", reason: "needed" }] })
    const result = await check.policy(
      fakeContext(
        reportEvidence({
          dirExists: true,
          filesScanned: 1,
          findings: [finding("a.js", 1, "https://exact.test/a/b")],
        }),
      ),
    )
    expect(result.outcome).toBe("pass")
  })

  it("fails an allowlist entry with an empty url or a missing/blank reason", async () => {
    const check = distNoUrls({
      allow: [
        { url: "  ", reason: "ok" },
        { url: "https://a.test", reason: "" },
        { url: "https://b.test", reason: "   " },
        { url: "https://c.test", reason: "fine" },
      ],
    })
    const result = await check.policy(
      fakeContext(reportEvidence({ dirExists: true, filesScanned: 1, findings: [] })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: [
        "distNoUrls is misconfigured:",
        "- allow[0].url must be a non-empty string.",
        '- allow[1].reason must explain why "https://a.test" has to ship in the build output.',
        '- allow[2].reason must explain why "https://b.test" has to ship in the build output.',
      ].join("\n"),
    })
  })

  it("fails when the build directory does not exist", async () => {
    const result = await distNoUrls({ dir: "out" }).policy(
      fakeContext(reportEvidence({ dirExists: false, filesScanned: 0, findings: [] })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: 'Build output directory "out" does not exist -- build before running this check.',
    })
  })

  it("fails cleanly on unparseable, absent or wrongly-shaped scan output", async () => {
    const unparsed = await distNoUrls().policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: false, error: "x" } })),
    )
    expect(unparsed.rationale).toBe("The dist URL scan output could not be parsed as JSON.")
    const absent = await distNoUrls().policy(fakeContext(fakeCheckEvidence({ output: undefined })))
    expect(absent.rationale).toBe("The dist URL scan output could not be parsed as JSON.")
    for (const bad of [
      null,
      7,
      "x",
      {},
      { dirExists: true },
      { dirExists: true, filesScanned: 1 },
      { dirExists: "yes", filesScanned: 1, findings: [] },
      { dirExists: true, filesScanned: "1", findings: [] },
      { dirExists: true, filesScanned: 1, findings: {} },
    ]) {
      const result = await distNoUrls().policy(fakeContext(reportEvidence(bad)))
      expect(result).toEqual({
        outcome: "fail",
        rationale: "The dist URL scan produced invalid JSON report data.",
      })
    }
  })

  it("reports an abnormally terminated scan instead of interpreting it", async () => {
    const result = await distNoUrls().policy(
      fakeContext(fakeCheckEvidence({ status: "timed_out", exitCode: null })),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain("The dist URL scan")
  })
})

describe("distNoUrls preset -- the real scanner", () => {
  const root = mkdtempSync(path.join(tmpdir(), "dist-no-urls-"))
  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function scan(dir: string): Record<string, unknown> {
    const [command, flag, source] = distNoUrls().run as readonly string[]
    const run = spawnSync(command!, [flag!, source!, dir], {
      encoding: "utf8",
    })
    expect(run.status).toBe(0)
    return JSON.parse(run.stdout) as Record<string, unknown>
  }

  it("finds URLs in every file type, nested, with 1-based lines and posix paths, sorted", () => {
    const dist = path.join(root, "dist")
    mkdirSync(path.join(dist, "sub", "deep"), { recursive: true })
    writeFileSync(path.join(dist, "b.js"), 'const a = 1\nfetch("https://one.test/p?q=1")\n')
    writeFileSync(path.join(dist, "a.d.ts"), "/** see http://two.test/doc#x */\n")
    writeFileSync(
      path.join(dist, "sub", "deep", "m.js.map"),
      '{"sourcesContent":["ftp://three.test"]}',
    )
    writeFileSync(path.join(dist, "clean.js"), "no links here: a:/b and //c\n")
    writeFileSync(path.join(dist, "bare.js"), 'x.startsWith("https://")\n')
    const report = scan(dist)
    expect(report).toEqual({
      dirExists: true,
      filesScanned: 5,
      findings: [
        { file: "a.d.ts", line: 1, url: "http://two.test/doc#x" },
        { file: "b.js", line: 2, url: "https://one.test/p?q=1" },
        { file: "bare.js", line: 1, url: "https://" },
        { file: "sub/deep/m.js.map", line: 1, url: "ftp://three.test" },
      ],
    })
  })

  it("stops a URL at whitespace, quotes, backticks, angle brackets, parens, brackets, backslash and braces", () => {
    const dist = path.join(root, "terminators")
    mkdirSync(dist)
    writeFileSync(
      path.join(dist, "t.txt"),
      [
        "https://q1.test\" https://q2.test' https://q3.test` https://q4.test< https://q5.test> ",
        "https://q6.test) https://q7.test] https://q8.test\\ https://q9.test} https://q10.test x",
      ].join("\n"),
    )
    const urls = (scan(dist).findings as { url: string }[]).map((f) => f.url)
    expect(urls).toEqual(Array.from({ length: 10 }, (_, i) => `https://q${String(i + 1)}.test`))
  })

  it("reports a missing directory and an empty one", () => {
    expect(scan(path.join(root, "nope"))).toEqual({
      dirExists: false,
      filesScanned: 0,
      findings: [],
    })
    const empty = path.join(root, "empty")
    mkdirSync(empty)
    expect(scan(empty)).toEqual({ dirExists: true, filesScanned: 0, findings: [] })
  })

  it("treats a file (not a directory) as a missing build directory", () => {
    const file = path.join(root, "afile")
    writeFileSync(file, "https://x.test")
    expect(scan(file).dirExists).toBe(false)
  })

  it("finds several URLs on one line, each separately", () => {
    const dist = path.join(root, "multi")
    mkdirSync(dist)
    writeFileSync(path.join(dist, "m.js"), "a('https://1.test','http://2.test')\r\n")
    expect((scan(dist).findings as { url: string }[]).map((f) => f.url)).toEqual([
      "https://1.test",
      "http://2.test",
    ])
  })
})

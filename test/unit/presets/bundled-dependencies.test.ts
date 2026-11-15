import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { bundledDependencies } from "../../../src/presets/bundled-dependencies.js"
import type { CheckEvidence } from "../../../src/types.js"
import { fakeCheckEvidence, fakeContext } from "./fixtures.js"

function reportEvidence(report: unknown): CheckEvidence {
  return fakeCheckEvidence({ output: { format: "json", success: true, value: report } })
}

async function verdictFor(
  fields: Record<string, unknown>,
  dependencies: readonly string[] = [],
): Promise<{ outcome: string; rationale: string }> {
  return bundledDependencies.policy(
    fakeContext(reportEvidence({ readable: true, fields, dependencies })),
  )
}

describe("bundledDependencies preset: policy", () => {
  it("reads package.json with node and no external tool", () => {
    const [command, flag, source, ...rest] = bundledDependencies.run as readonly string[]
    expect([command, flag, typeof source, rest]).toEqual(["node", "-e", "string", []])
    expect(bundledDependencies.output).toEqual({ format: "json" })
  })

  it("passes a package that bundles nothing", async () => {
    expect(await verdictFor({}, ["a"])).toEqual({
      outcome: "pass",
      rationale: "package.json bundles no dependencies.",
    })
    expect(await verdictFor({ bundleDependencies: [] })).toEqual({
      outcome: "pass",
      rationale: "package.json bundles no dependencies.",
    })
    expect(await verdictFor({ bundleDependencies: false })).toEqual({
      outcome: "pass",
      rationale: "package.json bundles no dependencies.",
    })
  })

  it("passes when every bundled name is in dependencies", async () => {
    expect(await verdictFor({ bundleDependencies: ["a", "b"] }, ["a", "b", "c"])).toEqual({
      outcome: "pass",
      rationale: 'All 2 bundled package(s) are declared in "dependencies".',
    })
  })

  it("passes `true`, which bundles exactly the declared dependencies", async () => {
    expect(await verdictFor({ bundleDependencies: true }, ["a"])).toEqual({
      outcome: "pass",
      rationale: 'All 1 bundled package(s) are declared in "dependencies".',
    })
  })

  it("fails on a bundled name missing from dependencies, naming each one and the field", async () => {
    const result = await verdictFor({ bundleDependencies: ["a", "ghost", "phantom"] }, ["a"])
    expect(result).toEqual({
      outcome: "fail",
      rationale: [
        '2 bundled package(s) are missing from "dependencies". npm publishes each one into the registry manifest as "*", which supply-chain scanners such as Socket report as manifest confusion. Add each to "dependencies" at the version you bundle:',
        '- bundleDependencies: "ghost"',
        '- bundleDependencies: "phantom"',
      ].join("\n"),
    })
  })

  it("reads the bundledDependencies spelling too, and both when both are present", async () => {
    const result = await verdictFor(
      { bundledDependencies: ["ghost"], bundleDependencies: ["a", "other"] },
      ["a"],
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toContain('- bundleDependencies: "other"')
    expect(result.rationale).toContain('- bundledDependencies: "ghost"')
    expect(result.rationale.startsWith("2 bundled package(s)")).toBe(true)
  })

  it("fails a field that is neither a list of names nor a boolean", async () => {
    expect(await verdictFor({ bundleDependencies: "a" }, ["a"])).toEqual({
      outcome: "fail",
      rationale:
        'package.json "bundleDependencies" must be a list of package names or a boolean; got "a".',
    })
    const nonString = await verdictFor({ bundledDependencies: ["a", 3] }, ["a"])
    expect(nonString).toEqual({
      outcome: "fail",
      rationale:
        'package.json "bundledDependencies" must be a list of package names or a boolean; got ["a",3].',
    })
  })

  it("fails when package.json cannot be read, with the reader's reason", async () => {
    const result = await bundledDependencies.policy(
      fakeContext(reportEvidence({ readable: false, error: "ENOENT: no such file" })),
    )
    expect(result).toEqual({
      outcome: "fail",
      rationale: "package.json could not be read: ENOENT: no such file",
    })
  })

  it("fails when the output is not JSON or not the reader's report", async () => {
    const unparsed = await bundledDependencies.policy(
      fakeContext(fakeCheckEvidence({ output: { format: "json", success: false, error: "bad" } })),
    )
    expect(unparsed).toEqual({
      outcome: "fail",
      rationale: "The package.json reader's output could not be parsed as JSON.",
    })
    for (const value of [
      null,
      {},
      { readable: "yes" },
      { readable: "yes", fields: {}, dependencies: [] },
      { readable: true, fields: {}, dependencies: "a" },
      { readable: true, fields: null, dependencies: [] },
      { readable: true, fields: [], dependencies: [] },
      { readable: true, dependencies: [] },
      { readable: true, fields: {}, dependencies: [1] },
      { readable: false },
    ]) {
      expect(await bundledDependencies.policy(fakeContext(reportEvidence(value)))).toEqual({
        outcome: "fail",
        rationale: "The package.json reader produced an invalid report.",
      })
    }
  })

  it("names an abnormal termination instead of judging absent output", async () => {
    const result = await bundledDependencies.policy(
      fakeContext(fakeCheckEvidence({ status: "timed_out", exitCode: null })),
    )
    expect(result.outcome).toBe("fail")
    expect(result.rationale).toMatch(/did not finish/)
    expect(result.rationale).toContain("The package.json reader")
  })
})

describe("bundledDependencies preset: the real reader", () => {
  const root = mkdtempSync(path.join(tmpdir(), "bundled-dependencies-"))
  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function project(name: string, packageJson: string | undefined): string {
    const dir = path.join(root, name)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir)
    if (packageJson !== undefined) writeFileSync(path.join(dir, "package.json"), packageJson)
    return dir
  }

  async function check(dir: string): Promise<{ report: unknown; outcome: string }> {
    const [command, flag, source] = bundledDependencies.run as readonly string[]
    const run = spawnSync(command!, [flag!, source!], { cwd: dir, encoding: "utf8" })
    expect(run.status).toBe(0)
    const report: unknown = JSON.parse(run.stdout)
    const verdict = await bundledDependencies.policy(fakeContext(reportEvidence(report)))
    return { report, outcome: verdict.outcome }
  }

  it("fails the env-cap 0.7.6 shape: a bundled name that is only a devDependency", async () => {
    const dir = project(
      "undeclared",
      JSON.stringify({
        name: "x",
        bundleDependencies: ["internal-tool"],
        devDependencies: { "internal-tool": "1.0.0" },
      }),
    )
    expect(await check(dir)).toEqual({
      report: {
        readable: true,
        fields: { bundleDependencies: ["internal-tool"] },
        dependencies: [],
      },
      outcome: "fail",
    })
  })

  it("passes a package without bundling, and one whose bundled names are declared", async () => {
    expect(
      await check(project("plain", JSON.stringify({ name: "x", dependencies: { a: "1" } }))),
    ).toEqual({ report: { readable: true, fields: {}, dependencies: ["a"] }, outcome: "pass" })
    const declared = project(
      "declared",
      JSON.stringify({ name: "x", bundledDependencies: ["a"], dependencies: { a: "1" } }),
    )
    expect(await check(declared)).toEqual({
      report: { readable: true, fields: { bundledDependencies: ["a"] }, dependencies: ["a"] },
      outcome: "pass",
    })
  })

  it("treats a dependencies field that is not an object as declaring nothing", async () => {
    const dir = project(
      "odd",
      JSON.stringify({ name: "x", bundleDependencies: ["a"], dependencies: ["a"] }),
    )
    expect(await check(dir)).toEqual({
      report: { readable: true, fields: { bundleDependencies: ["a"] }, dependencies: [] },
      outcome: "fail",
    })
  })

  it("reports a missing or malformed package.json as unreadable", async () => {
    const missing = await check(project("missing", undefined))
    expect(missing.outcome).toBe("fail")
    expect(missing.report).toMatchObject({ readable: false })
    const malformed = await check(project("malformed", "{ not json"))
    expect(malformed.outcome).toBe("fail")
    expect(malformed.report).toMatchObject({ readable: false })
    const array = await check(project("array", "[]"))
    expect(array).toEqual({
      report: { readable: false, error: "package.json must contain a top-level object." },
      outcome: "fail",
    })
  })
})

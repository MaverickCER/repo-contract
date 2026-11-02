import { describe, expect, it } from "vitest"
import { buildEvidenceManifest, verifyEvidenceManifest } from "../../../src/metrics/manifest.js"
import type { ManifestInput } from "../../../src/metrics/manifest.js"

const input: ManifestInput = {
  package: { name: "demo", version: "1.2.3" },
  createdAt: "2026-11-02T10:00:00.000Z",
  scope: "full",
  cache: "bypassed",
  inputHash: "a".repeat(64),
  tools: { node: "22.1.0", vitest: "5.0.5" },
  checks: [
    { id: "tests", verdict: "pass", evidence: { exitCode: 0, stdout: "ok" } },
    { id: "lint", verdict: "warn", evidence: { exitCode: 0, stdout: "1 warning" } },
  ],
}

describe("buildEvidenceManifest", () => {
  it("lists each check with a hash of its evidence, sorted by id, and a digest of the whole", () => {
    const manifest = buildEvidenceManifest(input)
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.checks.map((c) => c.id)).toEqual(["lint", "tests"])
    expect(manifest.checks[0]?.evidenceSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(manifest.checks[0]).not.toHaveProperty("evidence")
    expect(manifest.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it("is deterministic: key order in the evidence and check order do not matter", () => {
    const a = buildEvidenceManifest(input)
    const b = buildEvidenceManifest({
      ...input,
      checks: [
        { id: "lint", verdict: "warn", evidence: { stdout: "1 warning", exitCode: 0 } },
        { id: "tests", verdict: "pass", evidence: { stdout: "ok", exitCode: 0 } },
      ],
      tools: { vitest: "5.0.5", node: "22.1.0" },
    })
    expect(b).toEqual(a)
  })

  it("changes when any fact changes", () => {
    const base = buildEvidenceManifest(input).sha256
    const variants: ManifestInput[] = [
      { ...input, package: { name: "demo", version: "1.2.4" } },
      { ...input, inputHash: "b".repeat(64) },
      { ...input, tools: { ...input.tools, node: "22.2.0" } },
      { ...input, createdAt: "2026-11-03T10:00:00.000Z" },
      {
        ...input,
        checks: [
          { id: "tests", verdict: "fail", evidence: { exitCode: 0, stdout: "ok" } },
          input.checks[1]!,
        ],
      },
      {
        ...input,
        checks: [
          { id: "tests", verdict: "pass", evidence: { exitCode: 0, stdout: "OK" } },
          input.checks[1]!,
        ],
      },
    ]
    for (const variant of variants) {
      expect(buildEvidenceManifest(variant).sha256).not.toBe(base)
    }
  })

  it("refuses to describe a run that was not a full, cache-bypassing one", () => {
    expect(() => buildEvidenceManifest({ ...input, scope: "affected" as never })).toThrow(
      "A manifest describes a full-scope run.",
    )
    expect(() => buildEvidenceManifest({ ...input, cache: "used" as never })).toThrow(
      "A manifest describes a run that bypassed the cache.",
    )
  })

  it("refuses duplicate check ids", () => {
    expect(() =>
      buildEvidenceManifest({ ...input, checks: [input.checks[0]!, input.checks[0]!] }),
    ).toThrow("Check tests appears more than once.")
  })

  it("hashes evidence that is a string or null as well as an object", () => {
    const manifest = buildEvidenceManifest({
      ...input,
      checks: [
        { id: "a", verdict: "pass", evidence: "text" },
        { id: "b", verdict: "pass", evidence: null },
      ],
    })
    expect(manifest.checks[0]?.evidenceSha256).not.toBe(manifest.checks[1]?.evidenceSha256)
  })
})

describe("verifyEvidenceManifest", () => {
  it("accepts a manifest as built, after a trip through JSON", () => {
    const manifest = JSON.parse(JSON.stringify(buildEvidenceManifest(input))) as unknown
    expect(verifyEvidenceManifest(manifest)).toEqual({ ok: true, problems: [] })
  })

  it("rejects a manifest whose content was edited, even the verdict of one check", () => {
    const manifest = JSON.parse(JSON.stringify(buildEvidenceManifest(input))) as {
      checks: { verdict: string }[]
    }
    manifest.checks[0]!.verdict = "pass"
    const result = verifyEvidenceManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.problems).toContain("The manifest's digest does not match its content.")
  })

  it("rejects a manifest that records a failed check", () => {
    const failing = buildEvidenceManifest({
      ...input,
      checks: [{ id: "tests", verdict: "fail", evidence: {} }],
    })
    const result = verifyEvidenceManifest(failing)
    expect(result.ok).toBe(false)
    expect(result.problems).toEqual(["Check tests failed."])
  })

  it("checks the evidence of a named check against its recorded hash", () => {
    const manifest = buildEvidenceManifest(input)
    expect(verifyEvidenceManifest(manifest, { tests: input.checks[0]!.evidence })).toEqual({
      ok: true,
      problems: [],
    })
    const result = verifyEvidenceManifest(manifest, { tests: { exitCode: 1, stdout: "ok" } })
    expect(result.problems).toEqual(["The evidence for tests does not match the manifest."])
    expect(verifyEvidenceManifest(manifest, { nope: {} }).problems).toEqual([
      "The manifest has no check nope.",
    ])
  })

  it.each([
    [null, "The manifest is not an object."],
    ["x", "The manifest is not an object."],
    [{ schemaVersion: 2 }, "The manifest uses schema version 2, not 1."],
    [{ schemaVersion: 1, checks: "no" }, "The manifest has no check list."],
  ])("rejects %j", (value, problem) => {
    expect(verifyEvidenceManifest(value)).toEqual({ ok: false, problems: [problem] })
  })

  it("rejects a manifest that claims a narrower run or used the cache", () => {
    const edited = (patch: object) => {
      const body = { ...buildEvidenceManifest(input), ...patch }
      return verifyEvidenceManifest(body)
    }
    expect(edited({ scope: "affected" }).problems).toContain(
      "The manifest does not describe a full-scope run.",
    )
    expect(edited({ cache: "used" }).problems).toContain(
      "The manifest does not describe a cache-bypassing run.",
    )
  })
})

describe("manifest ordering and digest comparison", () => {
  it("writes tools and checks in sorted order whatever order they were given in", () => {
    const manifest = buildEvidenceManifest({
      ...input,
      tools: { vitest: "5", node: "22", typescript: "6", "@x/y": "1" },
      checks: ["tests", "lint", "Zed", "lint2"].map((id) => ({
        id,
        verdict: "pass" as const,
        evidence: id,
      })),
    })
    expect(Object.keys(manifest.tools)).toEqual(["@x/y", "node", "typescript", "vitest"])
    expect(manifest.checks.map((c) => c.id)).toEqual(["Zed", "lint", "lint2", "tests"])
    const reversed = buildEvidenceManifest({
      ...input,
      tools: { "@x/y": "1", typescript: "6", node: "22", vitest: "5" },
      checks: ["lint2", "Zed", "lint", "tests"].map((id) => ({
        id,
        verdict: "pass" as const,
        evidence: id,
      })),
    })
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(manifest))
  })

  it("hashes evidence the same whatever order its keys are in, at every depth", () => {
    const of = (evidence: unknown) =>
      buildEvidenceManifest({ ...input, checks: [{ id: "a", verdict: "pass", evidence }] })
        .checks[0]?.evidenceSha256
    expect(of({ b: 1, a: { y: [{ q: 1, p: 2 }], x: 2 } })).toBe(
      of({ a: { x: 2, y: [{ p: 2, q: 1 }] }, b: 1 }),
    )
    expect(of({ a: 1, b: 2 })).not.toBe(of({ a: 2, b: 1 }))
    expect(of([1, 2])).not.toBe(of([2, 1]))
  })

  it("rejects a digest that is not the right text, without throwing", () => {
    const good = JSON.parse(JSON.stringify(buildEvidenceManifest(input))) as { sha256: unknown }
    const digestChars = [...Buffer.from(good.sha256 as string)]
    for (const sha256 of [
      5,
      null,
      "abc",
      "",
      `${good.sha256 as string}0`,
      digestChars,
      undefined,
    ]) {
      const result = verifyEvidenceManifest({ ...good, sha256 })
      expect(result.ok).toBe(false)
      expect(result.problems).toContain("The manifest's digest does not match its content.")
    }
  })

  it("rejects recorded evidence hashes that are not text, without throwing", () => {
    const manifest = JSON.parse(JSON.stringify(buildEvidenceManifest(input))) as {
      checks: { evidenceSha256: unknown }[]
    }
    manifest.checks[0]!.evidenceSha256 = [...Buffer.from("x")]
    const result = verifyEvidenceManifest(manifest, { lint: input.checks[1]!.evidence })
    expect(result.problems).toContain("The evidence for lint does not match the manifest.")
  })
})

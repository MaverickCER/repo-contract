import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type * as SpawnModule from "../../../../scripts/sbom/spawn.js"

const { mkdir, readFile, writeFile } = vi.hoisted(() => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("node:fs/promises", () => ({ mkdir, readFile, writeFile }))

const { runCycloneDxNpm } = vi.hoisted(() => ({
  runCycloneDxNpm: vi.fn<typeof SpawnModule.runCycloneDxNpm>(),
}))
vi.mock("../../../../scripts/sbom/spawn.js", () => ({ runCycloneDxNpm }))

const { generateSbom } = await import("../../../../scripts/sbom/generate.js")

const VALID_DOCUMENT = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  components: [{ type: "library", name: "left-pad" }],
  metadata: {
    tools: {
      components: [
        { type: "application", group: "@cyclonedx", name: "cyclonedx-npm", version: "6.0.1" },
      ],
    },
  },
}

describe("generateSbom", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mkdir.mockResolvedValue(undefined)
    writeFile.mockResolvedValue(undefined)
  })

  describe("the machine's npm", () => {
    const withTools = (components: unknown[]) => ({
      ...VALID_DOCUMENT,
      metadata: { tools: { components } },
    })
    const cyclonedx = {
      type: "application",
      group: "@cyclonedx",
      name: "cyclonedx-npm",
      version: "6.0.1",
    }

    it("is removed from each SBOM, because a runner image's npm version would otherwise rewrite it", async () => {
      runCycloneDxNpm.mockReturnValue({ ok: true })
      readFile.mockImplementation(async (file: string) =>
        file.endsWith("package.json")
          ? "{}"
          : JSON.stringify(
              withTools([{ type: "application", name: "npm", version: "11.19.1" }, cyclonedx]),
              null,
              2,
            ),
      )

      const evidence = await generateSbom("/repo")

      expect(evidence.ok).toBe(true)
      expect(writeFile.mock.calls.map((call) => call[0])).toEqual([
        path.join("/repo", "docs/sbom.cdx.json"),
        path.join("/repo", "docs/sbom.production.cdx.json"),
      ])
      for (const call of writeFile.mock.calls) {
        expect(call[1]).toBe(JSON.stringify(withTools([cyclonedx]), null, 2))
      }
    })

    it("leaves a document without one untouched and unwritten", async () => {
      runCycloneDxNpm.mockReturnValue({ ok: true })
      readFile.mockImplementation(async (file: string) =>
        file.endsWith("package.json") ? "{}" : JSON.stringify(withTools([cyclonedx])),
      )

      await generateSbom("/repo")

      expect(writeFile).not.toHaveBeenCalled()
    })

    it("keeps a tool that is merely named npm inside a group", async () => {
      runCycloneDxNpm.mockReturnValue({ ok: true })
      readFile.mockImplementation(async (file: string) =>
        file.endsWith("package.json")
          ? "{}"
          : JSON.stringify(withTools([{ type: "library", group: "@x", name: "npm" }, cyclonedx])),
      )

      await generateSbom("/repo")

      expect(writeFile).not.toHaveBeenCalled()
    })
  })

  it("ensures docs/ exists before spawning cyclonedx-npm", async () => {
    runCycloneDxNpm.mockReturnValue({ ok: true })
    readFile.mockResolvedValue(JSON.stringify(VALID_DOCUMENT))

    await generateSbom("/repo")

    expect(mkdir).toHaveBeenCalledWith(path.join("/repo", "docs"), { recursive: true })
    const mkdirOrder = mkdir.mock.invocationCallOrder[0]
    const spawnOrder = runCycloneDxNpm.mock.invocationCallOrder[0]
    expect(mkdirOrder).toBeDefined()
    expect(spawnOrder).toBeDefined()
    expect(mkdirOrder).toBeLessThan(spawnOrder!)
  })

  it("returns the spawn failure's own message verbatim when cyclonedx-npm fails, without reading anything back", async () => {
    runCycloneDxNpm.mockReturnValue({
      ok: false,
      reason: "cli-not-installed",
      message: "The `cyclonedx-npm` CLI is not installed.",
    })

    const evidence = await generateSbom("/repo")

    expect(evidence).toEqual({ ok: false, reason: "The `cyclonedx-npm` CLI is not installed." })
    expect(readFile.mock.calls).toEqual([[path.join("/repo", "package.json"), "utf8"]])
  })

  it("fails with a clear reason when the file cyclonedx-npm just wrote cannot be read back", async () => {
    runCycloneDxNpm.mockReturnValue({ ok: true })
    readFile.mockRejectedValue(new Error("ENOENT: no such file"))

    const evidence = await generateSbom("/repo")

    expect(evidence.ok).toBe(false)
    if (!evidence.ok) {
      expect(evidence.reason).toContain("docs/sbom.cdx.json could not be read back")
      expect(evidence.reason).toContain("ENOENT: no such file")
    }
  })

  it("fails when the written file is not valid JSON", async () => {
    runCycloneDxNpm.mockReturnValue({ ok: true })
    readFile.mockResolvedValue("{not json")

    const evidence = await generateSbom("/repo")

    expect(evidence).toEqual({ ok: false, reason: "docs/sbom.cdx.json is not valid JSON." })
  })

  it("fails, surfacing validateSbomDocument's own rejection reason, when the written file is malformed CycloneDX", async () => {
    runCycloneDxNpm.mockReturnValue({ ok: true })
    readFile.mockResolvedValue(JSON.stringify({ bomFormat: "SPDX" }))

    const evidence = await generateSbom("/repo")

    expect(evidence.ok).toBe(false)
    if (!evidence.ok) expect(evidence.reason).toContain('"bomFormat"')
  })

  it("succeeds, reading docs/sbom.cdx.json back from the given root and reporting its validated summary", async () => {
    runCycloneDxNpm.mockReturnValue({ ok: true })
    readFile.mockResolvedValue(JSON.stringify(VALID_DOCUMENT))

    const evidence = await generateSbom("/repo")

    expect(readFile).toHaveBeenCalledWith(path.join("/repo", "docs/sbom.cdx.json"), "utf8")
    expect(evidence).toEqual({
      ok: true,
      outputPath: "docs/sbom.cdx.json",
      productionOutputPath: "docs/sbom.production.cdx.json",
      productionComponentCount: 1,
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      componentCount: 1,
      toolVersion: "6.0.1",
    })
  })

  it("passes the real root through to runCycloneDxNpm unchanged", async () => {
    runCycloneDxNpm.mockReturnValue({ ok: true })
    readFile.mockResolvedValue(JSON.stringify(VALID_DOCUMENT))

    await generateSbom("/some/other/root")

    expect(runCycloneDxNpm).toHaveBeenNthCalledWith(1, "/some/other/root", {
      outputFile: "docs/sbom.cdx.json",
      production: false,
    })
    // ...and a second, production-only pass for the runtime inventory
    expect(runCycloneDxNpm).toHaveBeenNthCalledWith(2, "/some/other/root", {
      outputFile: "docs/sbom.production.cdx.json",
      production: true,
    })
  })
})

describe("generateSbom -- the production inventory", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mkdir.mockResolvedValue(undefined)
  })

  it("reports the runtime component count separately from the build one", async () => {
    runCycloneDxNpm.mockReturnValue({ ok: true })
    readFile.mockImplementation((file: string) =>
      Promise.resolve(
        JSON.stringify(
          file.endsWith("sbom.production.cdx.json")
            ? { ...VALID_DOCUMENT, components: [] }
            : VALID_DOCUMENT,
        ),
      ),
    )
    const evidence = await generateSbom("/repo")
    expect(evidence).toMatchObject({ ok: true, componentCount: 1, productionComponentCount: 0 })
  })

  it("fails, naming the production file, when that pass fails or cannot be read", async () => {
    runCycloneDxNpm
      .mockReturnValueOnce({ ok: true })
      .mockReturnValueOnce({ ok: false, reason: "cli-failed", message: "prod pass failed" })
    readFile.mockResolvedValue(JSON.stringify(VALID_DOCUMENT))
    expect(await generateSbom("/repo")).toEqual({ ok: false, reason: "prod pass failed" })

    runCycloneDxNpm.mockReset().mockReturnValue({ ok: true })
    readFile.mockReset()
    readFile
      .mockResolvedValueOnce("{}")
      .mockResolvedValueOnce(JSON.stringify(VALID_DOCUMENT))
      .mockRejectedValueOnce(new Error("gone"))
    const unreadable = await generateSbom("/repo")
    expect(unreadable.ok).toBe(false)
    if (!unreadable.ok)
      expect(unreadable.reason).toContain("docs/sbom.production.cdx.json could not be read back")

    readFile.mockReset()
    readFile
      .mockResolvedValueOnce("{}")
      .mockResolvedValueOnce(JSON.stringify(VALID_DOCUMENT))
      .mockResolvedValueOnce(JSON.stringify({ bomFormat: "SPDX" }))
    const invalid = await generateSbom("/repo")
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.reason).toContain("docs/sbom.production.cdx.json")
  })
})

describe("generateSbom -- the root component's own package metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mkdir.mockResolvedValue(undefined)
    runCycloneDxNpm.mockReturnValue({ ok: true })
  })

  const withRoot = (references: readonly unknown[]) => ({
    ...VALID_DOCUMENT,
    metadata: { ...VALID_DOCUMENT.metadata, component: { externalReferences: references } },
  })
  const serve = (manifest: string, document: unknown) =>
    readFile.mockImplementation((file: string) =>
      Promise.resolve(file.endsWith("package.json") ? manifest : JSON.stringify(document)),
    )

  it("fails when package.json declares a repository the SBOM's root no longer carries", async () => {
    serve(JSON.stringify({ repository: "github:o/r" }), withRoot([]))
    const evidence = await generateSbom("/repo")
    expect(evidence.ok).toBe(false)
    if (!evidence.ok) {
      expect(evidence.reason).toContain("root component has no repository (vcs) reference")
      expect(evidence.reason).toContain("UUID")
    }
  })

  it("passes when the root carries it, or when package.json declares none or cannot be read", async () => {
    serve(JSON.stringify({ repository: "github:o/r" }), withRoot([{ type: "vcs", url: "x" }]))
    expect((await generateSbom("/repo")).ok).toBe(true)
    for (const manifest of ["{}", "null", "5", "{not json"]) {
      serve(manifest, withRoot([]))
      expect((await generateSbom("/repo")).ok).toBe(true)
    }
    readFile.mockImplementation((file: string) =>
      file.endsWith("package.json")
        ? Promise.reject(new Error("gone"))
        : Promise.resolve(JSON.stringify(withRoot([]))),
    )
    expect((await generateSbom("/repo")).ok).toBe(true)
  })
})

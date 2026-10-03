import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type * as SpawnModule from "../../../../scripts/sbom/spawn.js"

const { mkdir, readFile } = vi.hoisted(() => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
}))
vi.mock("node:fs/promises", () => ({ mkdir, readFile }))

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
    expect(readFile).not.toHaveBeenCalled()
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
      .mockResolvedValueOnce(JSON.stringify(VALID_DOCUMENT))
      .mockRejectedValueOnce(new Error("gone"))
    const unreadable = await generateSbom("/repo")
    expect(unreadable.ok).toBe(false)
    if (!unreadable.ok)
      expect(unreadable.reason).toContain("docs/sbom.production.cdx.json could not be read back")

    readFile.mockReset()
    readFile
      .mockResolvedValueOnce(JSON.stringify(VALID_DOCUMENT))
      .mockResolvedValueOnce(JSON.stringify({ bomFormat: "SPDX" }))
    const invalid = await generateSbom("/repo")
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.reason).toContain("docs/sbom.production.cdx.json")
  })
})

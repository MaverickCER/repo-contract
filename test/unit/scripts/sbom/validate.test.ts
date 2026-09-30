import { describe, expect, it } from "vitest"
import { validateSbomDocument } from "../../../../scripts/sbom/validate.js"

function validDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    components: [
      { type: "library", name: "left-pad" },
      { type: "library", name: "minimatch" },
    ],
    metadata: {
      tools: {
        components: [
          { type: "application", name: "npm", version: "11.19.0" },
          {
            type: "application",
            group: "@cyclonedx",
            name: "cyclonedx-npm",
            version: "6.0.1",
          },
        ],
      },
    },
    ...overrides,
  }
}

describe("validateSbomDocument", () => {
  it("accepts a real, well-formed CycloneDX document and extracts its summary", () => {
    const result = validateSbomDocument(validDocument())
    expect(result).toEqual({
      ok: true,
      value: {
        bomFormat: "CycloneDX",
        specVersion: "1.6",
        componentCount: 2,
        toolVersion: "6.0.1",
      },
    })
  })

  it("accepts a document with zero components", () => {
    const result = validateSbomDocument(validDocument({ components: [] }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.componentCount).toBe(0)
  })

  it("rejects a top-level array", () => {
    const result = validateSbomDocument([])
    expect(result).toEqual({
      ok: false,
      reason: "docs/sbom.cdx.json does not contain a JSON object.",
    })
  })

  it("rejects a top-level null", () => {
    const result = validateSbomDocument(null)
    expect(result.ok).toBe(false)
  })

  it("rejects a top-level primitive", () => {
    const result = validateSbomDocument("not an object")
    expect(result.ok).toBe(false)
  })

  it('rejects a document whose "bomFormat" is not "CycloneDX"', () => {
    const result = validateSbomDocument(validDocument({ bomFormat: "SPDX" }))
    expect(result).toEqual({
      ok: false,
      reason: 'docs/sbom.cdx.json\'s "bomFormat" is "SPDX", expected "CycloneDX".',
    })
  })

  it('rejects a document missing "bomFormat" entirely', () => {
    const doc = validDocument()
    delete doc.bomFormat
    const result = validateSbomDocument(doc)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain("bomFormat")
  })

  it('rejects a document whose "specVersion" is missing', () => {
    const doc = validDocument()
    delete doc.specVersion
    const result = validateSbomDocument(doc)
    expect(result).toEqual({
      ok: false,
      reason: 'docs/sbom.cdx.json has no valid "specVersion" string.',
    })
  })

  it('rejects a document whose "specVersion" is an empty string', () => {
    const result = validateSbomDocument(validDocument({ specVersion: "" }))
    expect(result.ok).toBe(false)
  })

  it('rejects a document whose "specVersion" is a non-string', () => {
    const result = validateSbomDocument(validDocument({ specVersion: 1.6 }))
    expect(result.ok).toBe(false)
  })

  it('rejects a document whose "components" is missing', () => {
    const doc = validDocument()
    delete doc.components
    const result = validateSbomDocument(doc)
    expect(result).toEqual({
      ok: false,
      reason: 'docs/sbom.cdx.json has no "components" array.',
    })
  })

  it('rejects a document whose "components" is not an array', () => {
    const result = validateSbomDocument(validDocument({ components: {} }))
    expect(result.ok).toBe(false)
  })

  it('falls back to toolVersion "unknown" when "metadata" is missing', () => {
    const doc = validDocument()
    delete doc.metadata
    const result = validateSbomDocument(doc)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.toolVersion).toBe("unknown")
  })

  it('falls back to toolVersion "unknown" when "metadata" is not an object', () => {
    const result = validateSbomDocument(validDocument({ metadata: "nope" }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.toolVersion).toBe("unknown")
  })

  it('falls back to toolVersion "unknown" when "metadata.tools" is missing', () => {
    const result = validateSbomDocument(validDocument({ metadata: {} }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.toolVersion).toBe("unknown")
  })

  it('falls back to toolVersion "unknown" when "metadata.tools.components" is not an array', () => {
    const result = validateSbomDocument(validDocument({ metadata: { tools: { components: {} } } }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.toolVersion).toBe("unknown")
  })

  it('falls back to toolVersion "unknown" when no tools entry matches @cyclonedx/cyclonedx-npm', () => {
    const result = validateSbomDocument(
      validDocument({
        metadata: {
          tools: { components: [{ type: "application", name: "npm", version: "11.19.0" }] },
        },
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.toolVersion).toBe("unknown")
  })

  it('ignores a same-name tool entry from a different group (not the real "@cyclonedx" group)', () => {
    const result = validateSbomDocument(
      validDocument({
        metadata: {
          tools: {
            components: [
              {
                type: "application",
                group: "@someone-else",
                name: "cyclonedx-npm",
                version: "9.9.9",
              },
            ],
          },
        },
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.toolVersion).toBe("unknown")
  })

  it('ignores a tools entry whose "version" is not a non-empty string', () => {
    const result = validateSbomDocument(
      validDocument({
        metadata: {
          tools: {
            components: [
              { type: "application", group: "@cyclonedx", name: "cyclonedx-npm", version: "" },
            ],
          },
        },
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.toolVersion).toBe("unknown")
  })

  it("finds the matching tool entry even when it is not the first components entry", () => {
    const result = validateSbomDocument(
      validDocument({
        metadata: {
          tools: {
            components: [
              { type: "application", name: "npm", version: "11.19.0" },
              {
                type: "library",
                group: "@cyclonedx",
                name: "cyclonedx-library",
                version: "10.3.0",
              },
              { type: "application", group: "@cyclonedx", name: "cyclonedx-npm", version: "6.0.1" },
            ],
          },
        },
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.toolVersion).toBe("6.0.1")
  })

  it("ignores a non-object entry inside metadata.tools.components", () => {
    const result = validateSbomDocument(
      validDocument({ metadata: { tools: { components: ["not an object"] } } }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.toolVersion).toBe("unknown")
  })
})

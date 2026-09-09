import { describe, expect, it } from "vitest"
import { patchContractScript } from "../../../bin/package-json-patch.mjs"

const SCRIPT_VALUE = "tsx scripts/contract.mjs"

describe("patchContractScript", () => {
  it("creates scripts.contract when package.json has no scripts object at all", () => {
    const input = `{
  "name": "x",
  "version": "1.0.0"
}`
    const { text, status } = patchContractScript(input, SCRIPT_VALUE)
    expect(status).toBe("created")
    expect(JSON.parse(text)).toEqual({
      name: "x",
      version: "1.0.0",
      scripts: { contract: SCRIPT_VALUE },
    })
    // Every byte outside the newly-added scripts block is untouched.
    expect(text.startsWith('{\n  "name": "x",\n  "version": "1.0.0",\n')).toBe(true)
  })

  it("creates scripts.contract as the new last property when scripts already has entries", () => {
    const input = `{
  "name": "x",
  "scripts": {
    "build": "tsc"
  }
}`
    const { text, status } = patchContractScript(input, SCRIPT_VALUE)
    expect(status).toBe("created")
    expect(JSON.parse(text)).toEqual({
      name: "x",
      scripts: { build: "tsc", contract: SCRIPT_VALUE },
    })
    expect(text).toContain('"build": "tsc",\n    "contract"')
  })

  it("creates scripts.contract inside an empty scripts object", () => {
    const input = `{
  "name": "x",
  "scripts": {}
}`
    const { text, status } = patchContractScript(input, SCRIPT_VALUE)
    expect(status).toBe("created")
    expect(JSON.parse(text)).toEqual({ name: "x", scripts: { contract: SCRIPT_VALUE } })
  })

  it("reports unchanged, and returns the exact same text, when contract already equals the generated value", () => {
    const input = `{
  "name": "x",
  "scripts": {
    "contract": "${SCRIPT_VALUE}"
  }
}`
    const { text, status } = patchContractScript(input, SCRIPT_VALUE)
    expect(status).toBe("unchanged")
    expect(text).toBe(input)
  })

  it("never overwrites an existing contract script with a different value -- reports conflict and returns the input byte-for-byte", () => {
    const input = `{
  "name": "x",
  "scripts": {
    "contract": "node other.js"
  }
}`
    const { text, status } = patchContractScript(input, SCRIPT_VALUE)
    expect(status).toBe("conflict")
    expect(text).toBe(input)
  })

  it("is not confused by a string value elsewhere that looks like a scripts/contract key", () => {
    const input = `{
  "name": "x",
  "description": "mentions \\"scripts\\": {\\"contract\\": \\"decoy\\"} inside a string",
  "scripts": {
    "a": "one",
    "contract": "old",
    "b": "two"
  }
}`
    const { text, status } = patchContractScript(input, SCRIPT_VALUE)
    expect(status).toBe("conflict")
    expect(text).toBe(input)
  })

  it("detects and preserves 4-space indentation", () => {
    const input = `{
    "name": "x",
    "scripts": {
        "build": "tsc"
    }
}`
    const { text } = patchContractScript(input, SCRIPT_VALUE)
    expect(text).toContain('        "contract"')
  })

  it("preserves CRLF newlines", () => {
    const input = '{\r\n  "name": "x"\r\n}'
    const { text } = patchContractScript(input, SCRIPT_VALUE)
    expect(text.includes("\r\n")).toBe(true)
    expect(text.includes("\n") && !text.replace(/\r\n/g, "").includes("\n")).toBe(true)
  })

  it("handles a completely empty root object", () => {
    const { text, status } = patchContractScript("{}", SCRIPT_VALUE)
    expect(status).toBe("created")
    expect(JSON.parse(text)).toEqual({ scripts: { contract: SCRIPT_VALUE } })
  })

  it("touches only scripts.contract -- every other property is byte-identical outside that one insertion", () => {
    const input = `{
  "name": "x",
  "version": "2.0.0",
  "keywords": ["a", "b"],
  "scripts": {
    "build": "tsc",
    "test": "vitest"
  },
  "author": "someone"
}`
    const { text } = patchContractScript(input, SCRIPT_VALUE)
    // Everything before and after the scripts object's insertion point is untouched.
    expect(text).toContain('"name": "x",\n  "version": "2.0.0",\n  "keywords": ["a", "b"],')
    expect(text).toContain('"author": "someone"')
    expect(text).toContain('"test": "vitest",\n    "contract"')
  })
})

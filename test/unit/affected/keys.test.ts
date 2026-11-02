import { describe, expect, it } from "vitest"
import {
  allKey,
  anyKey,
  changedKey,
  describeKey,
  exportKey,
  localKey,
  opaqueKey,
  sourceKey,
  testKey,
} from "../../../src/affected/keys.js"

describe("keys", () => {
  it("builds each kind of key", () => {
    expect(changedKey("a.ts")).toBe("changed:a.ts")
    expect(localKey("a.ts", "x")).toBe("local:a.ts#x")
    expect(exportKey("a.ts", "x")).toBe("export:a.ts#x")
    expect(allKey("a.ts")).toBe("all:a.ts")
    expect(anyKey("a.ts")).toBe("any:a.ts")
    expect(testKey("a.ts")).toBe("test:a.ts")
    expect(opaqueKey("a.ts")).toBe("opaque:a.ts")
    expect(sourceKey("a.ts")).toBe("source:a.ts")
  })

  it("describes each kind of key", () => {
    expect(describeKey(changedKey("a.ts"))).toBe("a.ts changed")
    expect(describeKey(localKey("a.ts", "x"))).toBe("`x` in a.ts changed")
    expect(describeKey(exportKey("a.ts", "x"))).toBe("a.ts exports a changed `x`")
    expect(describeKey(allKey("a.ts"))).toBe("a.ts changed in a way that may affect every export")
    expect(describeKey(anyKey("a.ts"))).toBe("a.ts has a changed export")
    expect(describeKey(testKey("a.ts"))).toBe("a.ts must run")
    expect(describeKey(opaqueKey("a.ts"))).toBe(
      "a.ts loads modules dynamically, so it is treated as affected by any change",
    )
    expect(describeKey(sourceKey("a.ts"))).toBe("a.ts depends on a changed symbol")
  })

  it("splits a symbol at its last #", () => {
    expect(describeKey(exportKey("dir/a#b.ts", "x"))).toBe("dir/a#b.ts exports a changed `x`")
  })

  it("returns an unknown key unchanged", () => {
    expect(describeKey("mystery:thing")).toBe("mystery:thing")
  })
})

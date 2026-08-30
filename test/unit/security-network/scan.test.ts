import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { scanForNetworkCapability, scanSourceFile } from "../../../scripts/security-network/scan.js"

const FIXTURES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures")

describe("scanSourceFile -- representative capability categories", () => {
  it("flags a bare node: core module import", () => {
    const findings = scanSourceFile("f.ts", 'import http from "node:http"')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-module-import")
  })

  it("flags the same core module without the node: prefix", () => {
    const findings = scanSourceFile("f.ts", 'import net from "net"')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-module-import")
  })

  it("flags an aliased/namespace import -- the binding name does not matter", () => {
    const findings = scanSourceFile("f.ts", 'import * as totallyInnocuous from "node:https"')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-module-import")
  })

  it("flags a known third-party network package", () => {
    const findings = scanSourceFile("f.ts", 'import { WebSocket as WS } from "ws"')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-module-import")
  })

  it("flags importing createRequire, which can synthesize a dynamic require() bypass", () => {
    const findings = scanSourceFile("f.ts", 'import { createRequire } from "node:module"')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-named-import")
  })

  it("flags createRequire imported from the bare 'module' specifier too", () => {
    const findings = scanSourceFile("f.ts", 'import { createRequire } from "module"')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-named-import")
  })

  it("flags a namespace import of node:module -- the whole module object still exposes createRequire", () => {
    const findings = scanSourceFile("f.ts", 'import * as m from "node:module"')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-named-import")
  })

  it("flags a default import of node:module", () => {
    const findings = scanSourceFile("f.ts", 'import mod from "module"')
    expect(findings[0]?.capability).toBe("restricted-named-import")
  })

  it("flags createRequire pulled in via a dynamic import of node:module", () => {
    const findings = scanSourceFile(
      "f.ts",
      'async function f() { const { createRequire } = await import("node:module"); return createRequire }',
    )
    expect(findings.some((x) => x.capability === "restricted-named-import")).toBe(true)
  })

  it('flags an `import x = require("module")` (TypeScript import-equals form)', () => {
    const findings = scanSourceFile("f.ts", 'import mod = require("node:module")')
    expect(findings[0]?.capability).toBe("restricted-named-import")
  })

  it("flags `global.fetch` (not only `globalThis.fetch`)", () => {
    const findings = scanSourceFile("f.ts", 'function f() { global.fetch("https://x") }')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-global-usage")
  })

  it("does not flag an unrelated named import from node:module", () => {
    const findings = scanSourceFile("f.ts", 'import { builtinModules } from "node:module"')
    expect(findings).toHaveLength(0)
  })

  it("flags a direct require() call with a restricted specifier", () => {
    const findings = scanSourceFile("f.ts", 'const h = require("node:http")')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-module-import")
  })

  it("flags a dynamic import() of a restricted specifier", () => {
    const findings = scanSourceFile("f.ts", 'async function f() { return import("undici") }')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-module-import")
  })

  it("flags a wildcard re-export of a restricted specifier", () => {
    const findings = scanSourceFile("f.ts", 'export * from "node:http"')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-module-import")
  })

  it("flags a namespaced re-export of a restricted specifier", () => {
    const findings = scanSourceFile("f.ts", 'export * as http from "node:http"')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-module-import")
  })

  it("flags a named re-export of a restricted specifier", () => {
    const findings = scanSourceFile("f.ts", 'export { request } from "node:https"')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-module-import")
  })

  it("flags createRequire re-exported by name, the same bypass named-import restriction covers for imports", () => {
    const findings = scanSourceFile("f.ts", 'export { createRequire } from "node:module"')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-named-import")
  })

  it("does not flag re-exporting a local binding with no module specifier", () => {
    const findings = scanSourceFile("f.ts", "const x = 1\nexport { x }")
    expect(findings).toHaveLength(0)
  })

  it("flags a dynamic import() whose specifier is computed, not a string literal -- the trivial bypass this check exists to close", () => {
    const findings = scanSourceFile("f.ts", "async function f(x: string) { return import(x) }")
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("dynamic-import-non-literal-specifier")
  })

  it("does not flag a dynamic import() of a legitimate, non-network optional dependency", () => {
    const findings = scanSourceFile("f.ts", 'async function f() { return import("yaml") }')
    expect(findings).toHaveLength(0)
  })

  it("flags a bare call to the global fetch", () => {
    const findings = scanSourceFile("f.ts", 'function f() { fetch("https://x") }')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-global-usage")
  })

  it("flags constructing a global WebSocket", () => {
    const findings = scanSourceFile("f.ts", 'function f() { new WebSocket("wss://x") }')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-global-usage")
  })

  it("flags constructing a global EventSource", () => {
    const findings = scanSourceFile("f.ts", 'function f() { new EventSource("https://x/stream") }')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-global-usage")
  })

  it("does not flag a member-access method merely named fetch on an unrelated object", () => {
    const findings = scanSourceFile(
      "f.ts",
      'function f(cache: { fetch(k: string): string }) { return cache.fetch("k") }',
    )
    expect(findings).toHaveLength(0)
  })

  it("flags globalThis.fetch, which no-restricted-globals cannot see because it's a property access, not an identifier reference", () => {
    const findings = scanSourceFile("f.ts", 'function f() { globalThis.fetch("https://x") }')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-global-usage")
  })

  it("flags constructing globalThis.WebSocket the same way", () => {
    const findings = scanSourceFile("f.ts", 'function f() { new globalThis.WebSocket("wss://x") }')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("restricted-global-usage")
  })

  it("flags a preset run command not in the reviewed allowlist", () => {
    const findings = scanSourceFile(
      "f.ts",
      'const c = { run: ["curl", "https://evil.example.com"] }',
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("unreviewed-preset-command")
  })

  it("flags a preset run command that isn't a string literal at all", () => {
    const findings = scanSourceFile(
      "f.ts",
      'function build(cmd: string) { return { run: [cmd, "x"] } }',
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("non-literal-preset-command")
  })

  it("does not flag a preset run command already in the reviewed allowlist", () => {
    const findings = scanSourceFile("f.ts", 'const c = { run: ["eslint", "."] }')
    expect(findings).toHaveLength(0)
  })

  it("sees through an 'as const' assertion on the run array -- it doesn't change the runtime value", () => {
    const findings = scanSourceFile(
      "f.ts",
      'const c = { run: ["curl", "https://evil.example.com"] as const }',
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("unreviewed-preset-command")
  })

  it("does not flag an 'as const' run array whose command is allowlisted", () => {
    const findings = scanSourceFile("f.ts", 'const c = { run: ["eslint", "."] as const }')
    expect(findings).toHaveLength(0)
  })

  it("sees through a 'satisfies' assertion on the run array the same way", () => {
    const findings = scanSourceFile(
      "f.ts",
      'const c = { run: ["curl", "https://evil.example.com"] satisfies readonly string[] }',
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("unreviewed-preset-command")
  })

  it("resolves a no-substitution template literal run command the same as a plain string", () => {
    const findings = scanSourceFile("f.ts", "const c = { run: `curl https://evil.example.com` }")
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("unreviewed-preset-command")
  })

  it("fails closed on a template literal with interpolation -- its value cannot be statically known", () => {
    const findings = scanSourceFile(
      "f.ts",
      "function build(cmd: string) { return { run: `${cmd} x` } }",
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("non-literal-preset-command")
  })

  it("fails closed on a run property that is a bare identifier reference", () => {
    const findings = scanSourceFile(
      "f.ts",
      "declare const CMD: readonly string[]\nconst c = { run: CMD }",
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("non-literal-preset-command")
  })

  it('flags a quoted "run" key carrying a disallowed command, same as an unquoted key', () => {
    const findings = scanSourceFile(
      "f.ts",
      'const c = { "run": ["curl", "https://evil.example.com"] }',
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("unreviewed-preset-command")
  })

  it("fails closed on shorthand run property syntax", () => {
    const findings = scanSourceFile(
      "f.ts",
      "declare const run: readonly string[]\nconst c = { run }",
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.capability).toBe("non-literal-preset-command")
  })

  it("does not flag ordinary, network-free source", () => {
    const findings = scanSourceFile(
      "f.ts",
      'import { readFile } from "node:fs/promises"\nexport async function f(p: string) { return readFile(p, "utf8") }',
    )
    expect(findings).toHaveLength(0)
  })
})

describe("scanForNetworkCapability -- real filesystem fixtures", () => {
  it("finds zero violations in the clean fixture tree, and confirms it actually scanned it", async () => {
    const evidence = await scanForNetworkCapability(path.join(FIXTURES_ROOT, "clean"))
    expect(evidence.filesScanned).toBeGreaterThan(0)
    expect(evidence.findings).toEqual([])
  })

  it("finds every distinct violation across the violating fixture tree, including the malicious preset", async () => {
    const evidence = await scanForNetworkCapability(path.join(FIXTURES_ROOT, "violating"))

    const capabilities = evidence.findings.map((f) => f.capability).sort()
    expect(capabilities).toEqual(
      [
        "dynamic-import-non-literal-specifier",
        "restricted-module-import",
        "unreviewed-preset-command",
      ].sort(),
    )

    const maliciousPresetFinding = evidence.findings.find(
      (f) => f.file === "src/malicious-preset.ts",
    )
    expect(maliciousPresetFinding?.capability).toBe("unreviewed-preset-command")
    expect(maliciousPresetFinding?.detail).toContain("curl")
  })
})

import { describe, expect, it } from "vitest"
import { buildDeadCodeFindings } from "../../../scripts/dead-code/check.js"

describe("buildDeadCodeFindings", () => {
  it("maps a flat category entry to one finding with a location", () => {
    const findings = buildDeadCodeFindings({
      issues: [{ file: "package.json", devDependencies: [{ name: "oxlint", line: 180, col: 6 }] }],
    })
    expect(findings).toEqual([
      {
        id: "dead-code:unused-dev-dependency:oxlint",
        kind: "unused-dev-dependency",
        name: "oxlint",
        file: "package.json",
        location: ":180:6",
      },
    ])
  })

  it("defaults the column to 1 when knip omits it", () => {
    const findings = buildDeadCodeFindings({
      issues: [{ file: "src/a.ts", exports: [{ name: "foo", line: 3 }] }],
    })
    expect(findings[0]?.location).toBe(":3:1")
  })

  it("has no location for an entry with no reported line (e.g. a dependency issue)", () => {
    const findings = buildDeadCodeFindings({
      issues: [{ file: "package.json", dependencies: [{ name: "left-pad" }] }],
    })
    expect(findings[0]?.location).toBe("")
  })

  it("joins a duplicates/cycles group's member names, with no location", () => {
    const findings = buildDeadCodeFindings({
      issues: [
        {
          file: "src/a.ts",
          duplicates: [[{ name: "Foo" }, { name: "Bar" }]],
        },
      ],
    })
    expect(findings).toEqual([
      {
        id: "dead-code:duplicate-export:Foo, Bar",
        kind: "duplicate-export",
        name: "Foo, Bar",
        file: "src/a.ts",
        location: "",
      },
    ])
  })

  it("covers every recognized knip category with a distinct kind", () => {
    const findings = buildDeadCodeFindings({
      issues: [
        {
          file: "f.ts",
          dependencies: [{ name: "a" }],
          devDependencies: [{ name: "b" }],
          optionalPeerDependencies: [{ name: "c" }],
          unlisted: [{ name: "d" }],
          unresolved: [{ name: "e" }],
          exports: [{ name: "f" }],
          nsExports: [{ name: "g" }],
          types: [{ name: "h" }],
          nsTypes: [{ name: "i" }],
          namespaceMembers: [{ name: "j" }],
          enumMembers: [{ name: "k" }],
          binaries: [{ name: "l" }],
          duplicates: [[{ name: "m" }]],
          cycles: [[{ name: "n" }]],
          files: [{ name: "o" }],
        },
      ],
    })
    expect(new Set(findings.map((f) => f.kind)).size).toBe(15)
  })

  it("collapses byte-identical entries (same kind/name/file/location)", () => {
    const issue = { file: "package.json", devDependencies: [{ name: "oxlint", line: 1, col: 1 }] }
    const findings = buildDeadCodeFindings({ issues: [issue, issue] })
    expect(findings).toHaveLength(1)
  })

  it("returns nothing for a report with no issues", () => {
    expect(buildDeadCodeFindings({ issues: [] })).toEqual([])
  })
})

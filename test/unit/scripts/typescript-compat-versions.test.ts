import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  nodeTypesFor,
  rangeFloor,
  TYPESCRIPT_COMPAT_VERSIONS,
  TYPESCRIPT_FLOOR,
} from "../../../scripts/typescript-compat-versions.mjs"

interface Manifest {
  readonly engines: { readonly node: string }
  readonly peerDependencies: { readonly typescript: string }
}

const here = path.resolve(__dirname, "../../..")
// Under Stryker this file runs from a sandbox copy in `.stryker-tmp/`, which git ignores, so
// `git ls-files` there lists nothing. The documents are read from the original checkout instead.
const sandboxAt = here.split(path.sep).indexOf(".stryker-tmp")
const root = sandboxAt === -1 ? here : here.split(path.sep).slice(0, sandboxAt).join(path.sep)
const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as Manifest

/** Every `typescript` range a tracked Markdown document states, as `file:line: range`. */
function documentedTypescriptRanges(): string[] {
  const documents = execFileSync("git", ["ls-files", "*.md"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((file) => file !== "" && !/^(CHANGELOG\.md|\.changeset\/|docs\/api)/.test(file))
  return documents.flatMap((file) =>
    readFileSync(path.join(root, file), "utf8")
      .split("\n")
      .flatMap((line, index) =>
        /typescript/i.test(line)
          ? [...line.matchAll(/>=\d+\.\d+\.\d+/g)].map(
              ([range]) => `${file}:${String(index + 1)}: ${range}`,
            )
          : [],
      ),
  )
}

describe("the TypeScript compat matrix", () => {
  it("starts at the floor of the typescript peer range, so CI proves the oldest release it admits", () => {
    expect(rangeFloor(manifest.peerDependencies.typescript)).toBe(TYPESCRIPT_FLOOR)
    expect(TYPESCRIPT_COMPAT_VERSIONS[0]).toBe(TYPESCRIPT_FLOOR)
  })

  it("matches every typescript range the documentation states", () => {
    const ranges = documentedTypescriptRanges()
    expect(ranges.length).toBeGreaterThan(0)
    expect(
      ranges.filter((entry) => !entry.endsWith(`: ${manifest.peerDependencies.typescript}`)),
    ).toEqual([])
  })

  it("keeps the newest release of every major a consumer may have installed", () => {
    expect(TYPESCRIPT_COMPAT_VERSIONS.slice(1)).toEqual(["5", "6", "7"])
  })
})

describe("rangeFloor()", () => {
  it("reads the major and minor of a >= range", () => {
    expect(rangeFloor(">=5.8.0")).toBe("5.8")
    expect(rangeFloor(">=22.10.3")).toBe("22.10")
  })

  it.each(["^5.8.0", ">=5.8", "5.8.0", ">=5.8.0 <7", " >=5.8.0", ">=5.8.0 "])(
    "rejects %j, which has no single floor to test",
    (range) => {
      expect(() => rangeFloor(range)).toThrow(
        `Expected a ">=<major>.<minor>.<patch>" range; got ${JSON.stringify(range)}.`,
      )
    },
  )
})

describe("nodeTypesFor()", () => {
  it("pairs a pinned minor with the Node.js floor's types", () => {
    expect(nodeTypesFor("5.8", manifest.engines.node)).toBe("22")
    expect(nodeTypesFor("5.8", ">=24.1.0")).toBe("24")
  })

  it("gives a bare major the newest types", () => {
    expect(nodeTypesFor("5", ">=22.0.0")).toBe("latest")
    expect(nodeTypesFor("7", ">=22.0.0")).toBe("latest")
  })
})

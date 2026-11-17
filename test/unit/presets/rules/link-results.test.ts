import { describe, expect, it, vi } from "vitest"
import { brokenLinks } from "../../../../src/presets/broken-links.js"
import {
  type CheckedLink,
  judgeLinks,
  linksToProbe,
} from "../../../../src/presets/rules/link-results.js"
import { fakeCheckEvidence, fakeContext } from "../fixtures.js"

const nothingOnDisk = (): boolean => false

describe("R2 link judgement", () => {
  it("passes when no link is broken", () => {
    const links: CheckedLink[] = [
      { url: "https://a.test", status: 200, state: "OK" },
      { url: "mailto:x", state: "SKIPPED" },
    ]
    const existsLocally = vi.fn(nothingOnDisk)
    expect(judgeLinks({ links, existsLocally })).toEqual({
      outcome: "pass",
      rationale: "linkinator found 0 broken link(s) across 2 checked.",
    })
    expect(existsLocally).not.toHaveBeenCalled()
  })

  it("passes a link that answered HTTP 429 and lists it", () => {
    const links: CheckedLink[] = [
      { url: "https://github.com/x", status: 429, state: "BROKEN", parent: "README.md" },
      { url: "https://a.test/y", status: 429, state: "BROKEN" },
      { url: "https://a.test/ok", status: 200, state: "OK" },
    ]
    expect(judgeLinks({ links, existsLocally: nothingOnDisk })).toEqual({
      outcome: "pass",
      rationale: [
        "linkinator found 0 broken link(s) across 3 checked.",
        "2 link(s) answered HTTP 429, a rate limit that says nothing about whether the page exists:",
        "- https://github.com/x (linked from README.md)",
        "- https://a.test/y",
      ].join("\n"),
    })
  })

  it("passes a broken local link that exists on disk as a file or directory", () => {
    const links: CheckedLink[] = [
      { url: "specs/decisions/", status: 404, state: "BROKEN", parent: "README.md" },
      { url: "docs/guide.md", status: 404, state: "BROKEN" },
    ]
    const existsLocally = vi.fn(() => true)
    expect(judgeLinks({ links, existsLocally })).toEqual({
      outcome: "pass",
      rationale: [
        "linkinator found 0 broken link(s) across 2 checked.",
        "2 local link(s) linkinator could not serve exist on disk:",
        "- specs/decisions/ (linked from README.md)",
        "- docs/guide.md",
      ].join("\n"),
    })
    expect(existsLocally).toHaveBeenCalledWith("specs/decisions/", "README.md")
    expect(existsLocally).toHaveBeenCalledWith("docs/guide.md", undefined)
  })

  it("strips a #fragment and ?query before probing the disk", () => {
    const existsLocally = vi.fn(nothingOnDisk)
    const links: CheckedLink[] = [
      { url: "docs/a.md#install", status: 404, state: "BROKEN" },
      { url: "./docs/b.md?plain=1#x", status: 404, state: "BROKEN" },
      { url: "/docs/my%20file.md", status: 404, state: "BROKEN" },
      { url: "docs/bad%E0%A4%A.md", status: 404, state: "BROKEN" },
    ]
    judgeLinks({ links, existsLocally })
    expect(existsLocally.mock.calls).toEqual([
      ["docs/a.md", undefined],
      ["docs/b.md", undefined],
      ["docs/my file.md", undefined],
      ["docs/bad%E0%A4%A.md", undefined],
    ])
  })

  it("strips only a leading ./ or /", () => {
    const existsLocally = vi.fn(nothingOnDisk)
    judgeLinks({
      links: [{ url: "docs/./x/a.md", status: 404, state: "BROKEN" }],
      existsLocally,
    })
    expect(existsLocally).toHaveBeenCalledWith("docs/./x/a.md", undefined)
  })

  it("fails a link that is only a fragment without probing the disk", () => {
    const existsLocally = vi.fn(() => true)
    const result = judgeLinks({
      links: [{ url: "#missing", status: 404, state: "BROKEN" }],
      existsLocally,
    })
    expect(result.outcome).toBe("fail")
    expect(existsLocally).not.toHaveBeenCalled()
  })

  it.each([
    ["a parent segment", "docs/../../etc/passwd"],
    ["a leading parent segment", "../outside.md"],
    ["a backslash parent segment", "docs\\..\\..\\x"],
    ["an absolute path after the leading slash", "//etc/passwd"],
    ["a backslash root", "\\etc\\passwd"],
    ["a drive letter", "C:/Windows/win.ini"],
    ["an encoded parent segment", "%2E%2E/outside.md"],
  ])("fails a link with %s without probing the disk", (_label, url) => {
    const existsLocally = vi.fn(() => true)
    const result = judgeLinks({ links: [{ url, status: 404, state: "BROKEN" }], existsLocally })
    expect(result.outcome).toBe("fail")
    expect(existsLocally).not.toHaveBeenCalled()
  })

  it("probes a name that only contains two dots", () => {
    const existsLocally = vi.fn(() => true)
    const result = judgeLinks({
      links: [{ url: "docs/a..b.md", status: 404, state: "BROKEN" }],
      existsLocally,
    })
    expect(result.outcome).toBe("pass")
    expect(existsLocally).toHaveBeenCalledWith("docs/a..b.md", undefined)
  })

  it("strips a fragment that runs across a line break", () => {
    expect(linksToProbe([{ url: "docs/a.md#one\ntwo", status: 404, state: "BROKEN" }])).toEqual([
      "docs/a.md",
    ])
  })

  it("probes a path with a drive-letter-like colon after its first segment", () => {
    expect(linksToProbe([{ url: "docs/c:notes.md", status: 404, state: "BROKEN" }])).toEqual([
      "docs/c:notes.md",
    ])
  })

  it("linksToProbe lists each distinct path a broken, non-429 local link names", () => {
    expect(
      linksToProbe([
        { url: "docs/a.md#x", status: 404, state: "BROKEN", parent: "README.md" },
        { url: "./docs/a.md", status: 404, state: "BROKEN", parent: "guide.md" },
        { url: "specs/", status: 404, state: "BROKEN" },
        { url: "ok.md", status: 200, state: "OK" },
        { url: "skipped.md", state: "SKIPPED" },
        { url: "slow.md", status: 429, state: "BROKEN" },
        { url: "https://a.test/gone", status: 404, state: "BROKEN" },
        { url: "#anchor", status: 404, state: "BROKEN" },
        { url: "../up.md", status: 404, state: "BROKEN" },
      ]),
    ).toEqual(["docs/a.md", "specs/"])
  })

  it("fails a broken local link that does not exist on disk", () => {
    const links: CheckedLink[] = [
      { url: "missing.md", status: 404, state: "BROKEN", parent: "README.md" },
      { url: "docs/there.md", status: 404, state: "BROKEN" },
      { url: "https://a.test/slow", status: 429, state: "BROKEN" },
    ]
    expect(judgeLinks({ links, existsLocally: (url) => url === "docs/there.md" })).toEqual({
      outcome: "fail",
      rationale: [
        "linkinator found 1 broken link(s):",
        "- missing.md returned HTTP 404 (linked from README.md)",
      ].join("\n"),
    })
  })

  it("fails a broken external link that did not answer 429, without probing the disk", () => {
    const existsLocally = vi.fn(() => true)
    const links: CheckedLink[] = [
      { url: "https://a.test/gone", status: 404, state: "BROKEN", parent: "README.md" },
      { url: "HTTP://a.test/down", state: "BROKEN" },
    ]
    expect(judgeLinks({ links, existsLocally })).toEqual({
      outcome: "fail",
      rationale: [
        "linkinator found 2 broken link(s):",
        "- https://a.test/gone returned HTTP 404 (linked from README.md)",
        "- HTTP://a.test/down returned no HTTP status",
      ].join("\n"),
    })
    expect(existsLocally).not.toHaveBeenCalled()
  })
})

describe("R2 brokenLinks start points", () => {
  it("brokenLinks runs one crawl over every start point, with --markdown when any start is markdown", () => {
    expect(
      brokenLinks({ start: [{ path: "README.md", mode: "markdown" }, { path: "docs" }] }).run,
    ).toEqual([
      "linkinator",
      "README.md",
      "docs",
      "--recurse",
      "--markdown",
      "--format",
      "json",
      "--skip",
      "node_modules",
    ])
  })

  it("brokenLinks leaves out --markdown when every start is html", () => {
    expect(brokenLinks({ start: [{ path: "docs", mode: "html" }, { path: "site" }] }).run).toEqual([
      "linkinator",
      "docs",
      "site",
      "--recurse",
      "--format",
      "json",
      "--skip",
      "node_modules",
    ])
  })

  it("brokenLinks keeps today's run for a single string start", () => {
    expect(brokenLinks({ start: "docs" }).run).toEqual([
      "linkinator",
      "docs",
      "--recurse",
      "--format",
      "json",
      "--skip",
      "node_modules",
    ])
  })

  it("brokenLinks rejects an empty start list when the preset is built", () => {
    expect(() => brokenLinks({ start: [] })).toThrow(
      new RangeError("brokenLinks: start must name at least one start point."),
    )
  })

  it("brokenLinks passes a broken local link that exists on disk and fails one that does not", async () => {
    const check = brokenLinks({ start: [{ path: "README.md", mode: "markdown" }] })
    const judge = (links: readonly CheckedLink[]) =>
      check.policy(
        fakeContext(
          fakeCheckEvidence({ output: { format: "json", success: true, value: { links } } }),
        ),
      )

    // The test runs from the package root, where package.json and src/ exist.
    const onDisk = await judge([
      { url: "package.json#name", status: 404, state: "BROKEN", parent: "README.md" },
      { url: "src/", status: 404, state: "BROKEN", parent: "README.md" },
    ])
    expect(onDisk.outcome).toBe("pass")

    const missing = await judge([
      { url: "no-such-file-r2-links.md", status: 404, state: "BROKEN", parent: "README.md" },
    ])
    expect(missing.outcome).toBe("fail")
  })
})

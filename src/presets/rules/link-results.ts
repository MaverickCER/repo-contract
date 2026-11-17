import type { PolicyResult } from "../../types.js"

/** One link linkinator checked. */
export interface CheckedLink {
  readonly url: string
  readonly status?: number
  readonly state: "OK" | "BROKEN" | "SKIPPED"
  readonly parent?: string
}

/** One place a crawl starts, and how its files are read. */
export interface BrokenLinksStart {
  /** A file or directory, relative to the working directory. */
  readonly path: string
  /** `"markdown"` follows links in Markdown files; `"html"` (the default) reads HTML only. */
  readonly mode?: "html" | "markdown"
}

/** What the link judgement may ask of the file system. */
export interface LinkJudgementInput {
  readonly links: readonly CheckedLink[]
  /**
   * Whether a local link points at a file or directory that exists. linkinator reports a bare
   * directory link as broken, though every git host renders it.
   */
  readonly existsLocally: (url: string, parent: string | undefined) => boolean
}

const EXTERNAL = /^https?:\/\//i
const RATE_LIMITED = 429

/**
 * The path on disk a broken local link names, or nothing to probe. An external link, a bare
 * `#fragment`, and a path that could leave the working directory are never probed, so each stays
 * broken.
 * @param url - a link as linkinator reports it.
 * @returns the relative path with no `#fragment` or `?query`, percent-decoded and without a
 * leading `./` or `/`; `undefined` when there is nothing safe to probe.
 */
function localLinkPath(url: string): string | undefined {
  if (EXTERNAL.test(url)) return undefined
  // With the `s` flag `.*` runs to the end of the text, so the pattern needs no `$`.
  const bare = url.replace(/[#?].*/s, "")
  let decoded = bare
  try {
    decoded = decodeURIComponent(bare)
  } catch {
    // A malformed escape cannot name a decoded file, so the raw text is probed instead.
  }
  const relative = decoded.replace(/^\.?\//, "")
  // linkinator clamps `..` to its server root, so these only arrive from a hand-built report.
  if (relative.length === 0 || /^[/\\]|^[A-Za-z]:/.test(relative)) return undefined
  if (relative.split(/[/\\]/).includes("..")) return undefined
  return relative
}

/**
 * The paths `judgeLinks` will ask about, so a caller can probe the disk before judging.
 * @param links - the crawl's links.
 * @returns each distinct path a broken, non-429 local link names.
 */
export function linksToProbe(links: readonly CheckedLink[]): readonly string[] {
  const paths = new Set<string>()
  for (const link of links) {
    if (link.state !== "BROKEN" || link.status === RATE_LIMITED) continue
    const local = localLinkPath(link.url)
    if (local !== undefined) paths.add(local)
  }
  return [...paths]
}

/**
 * @param link - one link result.
 * @returns ` (linked from parent)`, or `""` for a start point.
 */
function from(link: CheckedLink): string {
  return link.parent ? ` (linked from ${link.parent})` : ""
}

/**
 * @param heading - the section's first line.
 * @param links - the links it lists.
 * @returns the heading and one line per link, or nothing when there are no links.
 */
function section(heading: string, links: readonly CheckedLink[]): string[] {
  return links.length > 0 ? [heading, ...links.map((link) => `- ${link.url}${from(link)}`)] : []
}

/**
 * Judges a crawl. A link that answered HTTP 429 passes and is listed: a rate limit says nothing
 * about whether the page exists. A local link that exists on disk passes. Any other broken link
 * fails.
 * @param input - the links and the file-system probe.
 * @returns the verdict.
 */
export function judgeLinks(input: LinkJudgementInput): PolicyResult {
  const { links, existsLocally } = input
  const rateLimited: CheckedLink[] = []
  const onDisk: CheckedLink[] = []
  const broken: CheckedLink[] = []

  for (const link of links) {
    if (link.state !== "BROKEN") continue
    if (link.status === RATE_LIMITED) {
      rateLimited.push(link)
      continue
    }
    const local = localLinkPath(link.url)
    if (local !== undefined && existsLocally(local, link.parent)) onDisk.push(link)
    else broken.push(link)
  }

  if (broken.length > 0) {
    return {
      outcome: "fail",
      rationale: [
        `linkinator found ${String(broken.length)} broken link(s):`,
        ...broken.map((link) => {
          const status =
            link.status === undefined ? "no HTTP status" : `HTTP ${String(link.status)}`
          return `- ${link.url} returned ${status}${from(link)}`
        }),
      ].join("\n"),
    }
  }

  return {
    outcome: "pass",
    rationale: [
      `linkinator found 0 broken link(s) across ${String(links.length)} checked.`,
      ...section(
        `${String(rateLimited.length)} link(s) answered HTTP 429, a rate limit that says nothing about whether the page exists:`,
        rateLimited,
      ),
      ...section(
        `${String(onDisk.length)} local link(s) linkinator could not serve exist on disk:`,
        onDisk,
      ),
    ].join("\n"),
  }
}

/**
 * Builds linkinator's start of argv: every start path in one crawl. linkinator 8 serves several
 * paths from the working directory in one run. Its Markdown mode is one flag for the whole
 * crawl, so a single `"markdown"` start turns it on.
 * @param start - the `brokenLinks` `start` option.
 * @returns the start paths, `--recurse`, and `--markdown` when any start asks for it.
 * @throws {RangeError} when `start` is an empty list.
 */
export function crawlArguments(start: string | readonly BrokenLinksStart[]): readonly string[] {
  if (typeof start === "string") return [start, "--recurse"]
  if (start.length === 0) {
    throw new RangeError("brokenLinks: start must name at least one start point.")
  }
  return [
    ...start.map((point) => point.path),
    "--recurse",
    ...(start.some((point) => point.mode === "markdown") ? ["--markdown"] : []),
  ]
}

import { notImplemented } from "../../not-implemented.js"
import type { PolicyResult } from "../../types.js"

/** One link linkinator checked. */
export interface CheckedLink {
  readonly url: string
  readonly status?: number
  readonly state: "OK" | "BROKEN" | "SKIPPED"
  readonly parent?: string
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

/**
 * Judges a crawl. A link that answered HTTP 429 passes and is listed: a rate limit says nothing
 * about whether the page exists. A local link that exists on disk passes. Any other broken link
 * fails.
 * @param input - the links and the file-system probe.
 * @returns the verdict.
 */
export function judgeLinks(input: LinkJudgementInput): PolicyResult {
  return notImplemented("R2", input)
}

import type { AffectedOptions, LinkRule } from "./types.js"

const LIST_KEYS = ["ignore", "triggers", "tests", "notMutated"] as const
const KEYS = [...LIST_KEYS, "links"]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

/**
 * Validates the `affected` block of a repository's configuration (`package.json`'s
 * `"repo-contract"."affected"`). Strict on purpose: a misspelt key would otherwise silently
 * leave a coupling undeclared, which is the one thing this block exists to prevent.
 * @param value - The parsed block, or `undefined` if the repository has none.
 * @returns The options, or a one-line description of what is wrong.
 */
export function parseAffectedConfig(
  value: unknown,
): { readonly options: AffectedOptions } | { readonly error: string } {
  if (value === undefined) {
    return { options: {} }
  }
  if (!isRecord(value)) {
    return { error: "must be an object" }
  }
  const unknown = Object.keys(value).find((key) => !KEYS.includes(key))
  if (unknown !== undefined) {
    return { error: `unknown key '${unknown}' (expected one of: ${KEYS.join(", ")})` }
  }
  const options: { -readonly [Key in keyof AffectedOptions]: AffectedOptions[Key] } = {}
  for (const key of LIST_KEYS) {
    const list = value[key]
    if (list === undefined) {
      continue
    }
    if (!isStringList(list)) {
      return { error: `'${key}' must be a list of glob strings` }
    }
    if (list.some((glob) => glob.trim() === "")) {
      return { error: `'${key}' must not contain an empty glob` }
    }
    options[key] = [...list]
  }
  if (value.links !== undefined) {
    const links = parseLinks(value.links)
    if ("error" in links) {
      return links
    }
    options.links = links.links
  }
  return { options }
}

/**
 *
 * @param value
 */
/**
 * Validates the `links` list.
 * @param value - The parsed `links` value.
 * @returns The links, or what is wrong with them.
 */
function parseLinks(value: unknown): { readonly links: LinkRule[] } | { readonly error: string } {
  if (!Array.isArray(value)) {
    return { error: "'links' must be a list" }
  }
  const links: LinkRule[] = []
  for (const [index, link] of value.entries()) {
    if (!isRecord(link)) {
      return { error: `link ${String(index)} must be an object` }
    }
    const extra = Object.keys(link).find((key) => key !== "when" && key !== "run")
    if (extra !== undefined) {
      return { error: `link ${String(index)} has unknown key '${extra}'` }
    }
    const { when, run } = link
    if (typeof when !== "string" || when.trim() === "") {
      return { error: `link ${String(index)} needs a 'when' glob` }
    }
    if (!isStringList(run) || run.length === 0 || run.some((glob) => glob.trim() === "")) {
      return { error: `link ${String(index)} needs a 'run' list of globs` }
    }
    links.push({ when, run: [...run] })
  }
  return { links }
}

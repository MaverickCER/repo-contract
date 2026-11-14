/**
 * The extensible discovery abstraction: one recognizer per suppression domain, each trying to
 * interpret a comment's already-canonicalized content (see canonicalize-comment.ts) as a
 * suppression directive belonging to its own domain. Adding a new domain means adding one more
 * recognizer to RECOGNIZERS below: nothing about discover-suppressions.ts or the registry
 * reconciliation in check.ts needs to change.
 */
interface RecognizedSuppression {
  readonly domain: string
  readonly rule: readonly string[]
  /**
   * The directive's own comment content, minus its disable-domain keywords and its rule list:
   * i.e. whatever free text remains, trimmed, or `""` if none. Unlike
   * `justification`/`category`/`verificationMethod` (see policy-config.ts), this is never
   * hand-authored. Every recognizer derives it mechanically from the same comment `rule` was
   * parsed out of. A domain's policy can therefore require it (`SuppressionRequirement`'s
   * `"reason"`) without depending on a human filling in disable-comments.json after the fact.
   */
  readonly reason: string
}

type SuppressionRecognizer = (canonicalContent: string) => RecognizedSuppression | undefined

const ESLINT_DIRECTIVE = /^eslint-disable(?:-next-line|-line)?(?:\s+|$)/
const RULE_SEPARATOR = /[\s,]+/
// ESLint's own directive grammar separates the rule list from a free-text justification with
// "--". This repository enforces it with eslint-comments/require-description, e.g.
// "eslint-disable-next-line no-console -- reason". Everything from the first "--" onward is
// prose, never a rule name. It must never be split into fake per-word "rules"; it becomes
// `reason` instead.
const DESCRIPTION_SEPARATOR = /--/

/**
 * ESLint's own `eslint-disable`/`eslint-disable-next-line`/`eslint-disable-line` directives,
 * including the multiline block form. A directive with no rules named disables every rule for its
 * scope (ESLint's own convention). It is represented here as `rule: ["*"]` rather than an empty
 * array, for two reasons. First, it keeps `rule` non-empty, since disable-comments.json rejects an
 * empty rule list as malformed. Second, `src/helpers/exception-policy.ts`'s
 * `resolveExceptionPolicy` special-cases exactly this literal value. There it means "every rule in
 * this domain, resolved to the strictest policy among them". It is deliberately not treated as an
 * ordinary glob pattern. `globMatch("*", pattern)` tests `"*"` as a literal target, which does not
 * match a pattern like `"security/*"`.
 * @param canonicalContent - The comment's decoration-stripped content.
 * @returns The recognized `eslint` suppression, or `undefined` if `canonicalContent` isn't an eslint-disable directive.
 */
export const eslintRecognizer: SuppressionRecognizer = (canonicalContent) => {
  const match = ESLINT_DIRECTIVE.exec(canonicalContent)
  if (!match) return undefined

  const remainder = canonicalContent.slice(match[0].length)
  const [ruleListText = "", ...reasonParts] = remainder.split(DESCRIPTION_SEPARATOR)
  const trimmedRuleList = ruleListText.trim()
  const rule =
    trimmedRuleList.length === 0 ? ["*"] : trimmedRuleList.split(RULE_SEPARATOR).filter(Boolean)
  // A rule-list text that's non-empty but consists only of separator characters (e.g. a stray ",")
  // trims to a non-empty string but splits+filters down to an empty array. That is distinct from
  // "no rule list at all" (the ["*"] branch above), so it isn't caught there. An empty `rule`
  // violates the non-empty-rule invariant enforced everywhere else. Examples are
  // evidence-types.ts's `SUPPRESSION_EXCEPTION_SCHEMA.validateRecord` and strykerRecognizer's own
  // empty-list guard below. resolve-policy.ts's `evaluateFinding` would also report it as an
  // unmatched finding, because `evaluateExceptionRecord` cannot reduce an empty classification list.
  if (rule.length === 0) return undefined

  return { domain: "eslint", rule, reason: reasonParts.join("--").trim() }
}

// Not `\b` at the end: "-" is a non-word character, so a trailing `\b` alone would also match
// an unrelated identifier like "@ts-ignore-something". The directive must be the whole content,
// or be immediately followed by whitespace or a colon. Whitespace introduces a trailing
// human-readable reason. A colon covers the error-code-attaching convention
// `@ts-expect-error:TS2345`, which tsc itself honors by prefix match alone. This recognizer must
// accept everything tsc does, or a real suppression goes ungoverned. `@ts-nocheck` disables
// type-checking for a whole file, the broadest TS suppression there is. It is therefore governed
// here alongside the line-scoped `@ts-ignore`/`@ts-expect-error`.
const TYPESCRIPT_DIRECTIVE = /^@ts-(ignore|expect-error|nocheck)(?:[\s:]|$)/

/**
 * TypeScript's own `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck` suppression comments. These are
 * directives, not parameterized rules: there is nothing analogous to an ESLint rule id to extract.
 * The directive itself therefore becomes the sole `rule` entry, which keeps `rule` non-empty as the
 * registry requires.
 * @param canonicalContent - The comment's decoration-stripped content.
 * @returns The recognized `typescript` suppression, or `undefined` if `canonicalContent` isn't a `@ts-ignore`/`@ts-expect-error` directive.
 */
export const typescriptRecognizer: SuppressionRecognizer = (canonicalContent) => {
  const match = TYPESCRIPT_DIRECTIVE.exec(canonicalContent)
  if (!match) return undefined

  const reason = canonicalContent.slice(match[0].length).trim()

  return { domain: "typescript", rule: [`@ts-${match[1]}`], reason }
}

// Not `\bprettier-ignore\b`: "-" is a non-word character, so a trailing `\b` alone would also
// match an unrelated directive like "prettier-ignore-start". Real Prettier has no such directive,
// and this recognizer must not invent one. The directive must be the whole content, or be
// immediately followed by whitespace (e.g. a trailing human comment).
const PRETTIER_DIRECTIVE = /^prettier-ignore(?:\s|$)/

/**
 * Prettier's `prettier-ignore` directive. Like the TypeScript directives, it is not parameterized.
 * @param canonicalContent - The comment's decoration-stripped content.
 * @returns The recognized `prettier` suppression, or `undefined` if `canonicalContent` isn't a `prettier-ignore` directive.
 */
export const prettierRecognizer: SuppressionRecognizer = (canonicalContent) => {
  const match = PRETTIER_DIRECTIVE.exec(canonicalContent)
  if (!match) return undefined

  const reason = canonicalContent.slice(match[0].length).trim()

  return { domain: "prettier", rule: ["prettier-ignore"], reason }
}

// Coverage tools' ignore directives: "v8 ignore start|stop|next|file", "c8 ignore ...", "istanbul ignore
// next|if|else|file". A `stop` closes a range opened by `start` and names no new exemption, so it is
// not a suppression of its own. Every other form hides code from the coverage threshold. Each is
// governed like a disable comment. The reason, when the author wrote one after a `--`, is kept.
// The optional ` -- ` separator is stripped in code, not in the pattern: an optional group around
// `\s*` is what eslint-plugin-security's detect-unsafe-regex flags as unsafe.
const COVERAGE_DIRECTIVE = /^(v8|c8|istanbul) ignore (start|stop|next|file|if|else)\b/

/**
 * `v8 ignore`, `c8 ignore` and `istanbul ignore` directives, which exclude code from the coverage
 * report and therefore from the thresholds the `coverage` check enforces.
 * @param canonicalContent - The comment's decoration-stripped content.
 * @returns The recognized `coverage` suppression, or `undefined` for a `stop` marker or a non-directive.
 */
export const coverageRecognizer: SuppressionRecognizer = (canonicalContent) => {
  const match = COVERAGE_DIRECTIVE.exec(canonicalContent)
  if (!match || match[2] === "stop") return undefined
  // `ignore next 3` counts lines; the count is part of the directive, not the reason.
  const rest = canonicalContent
    .slice(match[0].length)
    .trim()
    .replace(/^\d+\s*/, "")
  const reason = rest.startsWith("--") ? rest.slice(2).trim() : rest
  return { domain: "coverage", rule: [`${match[1]}-ignore-${match[2]}`], reason }
}

// Stryker's own directive grammar: "Stryker disable [next-line] <all | mutator[,mutator...]>".
// Unlike ESLint's bare-disable case, "all" is Stryker's own literal token for "every mutator".
// There's no "rule list omitted" case to placeholder with a synthetic "*" for, so a bare-all
// directive's `rule` is `["all"]` verbatim. This matters beyond naming. `all` doubles as the exact
// string a domain policy uses to forbid it (see policy-config.ts's `stryker.rules.all`).
// `src/helpers/exception-policy.ts`'s `resolveExceptionPolicy` falls back to
// `globMatch(rule, pattern)` for any rule that isn't an exact match. A policy key of `"*"` would
// glob-match every mutator name (`globMatch("ConditionalExpression", "*")` is `true`). That would
// silently forbid every stryker suppression instead of only the "all" ones. The literal string
// "all" has no such glob meaning.
// Single literal spaces, not `\s+`, between each fixed word. Three independent `\s+` groups in
// one pattern are enough for eslint-plugin-security's detect-unsafe-regex to flag as unsafe. Its
// backtracking-complexity estimate grows with quantifier count, even without true catastrophic
// backtracking here. Every real directive in this codebase is single-space-separated, matching
// canonicalizeComment's own line-trimming, so literal spaces lose no real matches.
const STRYKER_DIRECTIVE = /^Stryker disable(?: next-line)?(?: |$)/i

/**
 * Stryker's own `// Stryker disable [next-line] <all|mutator[,mutator...]>` directives.
 * `Stryker restore` is intentionally not matched: it re-enables mutation testing rather than
 * suppressing it. For the same reason, `eslintRecognizer` never matches `eslint-enable`.
 * @param canonicalContent - The comment's decoration-stripped content.
 * @returns The recognized `stryker` suppression, or `undefined` if `canonicalContent` isn't a `Stryker disable` directive.
 */
export const strykerRecognizer: SuppressionRecognizer = (canonicalContent) => {
  const match = STRYKER_DIRECTIVE.exec(canonicalContent)
  if (!match) return undefined

  const remainder = canonicalContent.slice(match[0].length)
  // Stryker's own grammar ends the mutator list at a colon (`Mutator1,Mutator2: reason`); the
  // `--` separator is the eslint-style convention. Whichever comes first ends the list.
  const colon = remainder.indexOf(":")
  const dashes = remainder.search(DESCRIPTION_SEPARATOR)
  const listEnd = colon !== -1 && (dashes === -1 || colon < dashes) ? colon : dashes
  const ruleListText = listEnd === -1 ? remainder : remainder.slice(0, listEnd)
  const reasonText =
    listEnd === -1 ? "" : remainder.slice(listEnd + (listEnd === colon ? 1 : 2)).trim()
  const parsedRules = ruleListText.trim().split(RULE_SEPARATOR).filter(Boolean)
  // A Stryker directive with no mutator list is governed as if it named
  // "all" (Stryker's own every-mutator token). That covers a bare
  // "Stryker disable" / "Stryker disable next-line", or a stray separator.
  // It never slips past governance entirely. The eslint recognizer above
  // maps a directive with no rule list onto the every-rule wildcard the same way.
  const rule = parsedRules.length === 0 ? ["all"] : parsedRules

  return { domain: "stryker", rule, reason: reasonText }
}

/** Tried in order; the first recognizer to match a comment's canonical content wins. */
const RECOGNIZERS: readonly SuppressionRecognizer[] = [
  eslintRecognizer,
  typescriptRecognizer,
  prettierRecognizer,
  coverageRecognizer,
  strykerRecognizer,
]

/**
 * Runs every recognizer, in order, against one comment's canonical content.
 * @param canonicalContent - The comment's canonicalized text (see canonicalizeComment).
 * @returns The first matching recognizer's result, or `undefined` if the comment is not a recognized suppression directive.
 */
export function recognizeSuppression(canonicalContent: string): RecognizedSuppression | undefined {
  for (const recognize of RECOGNIZERS) {
    const result = recognize(canonicalContent)
    if (result) return result
  }
  return undefined
}

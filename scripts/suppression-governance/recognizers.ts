/**
 * The extensible discovery abstraction: one recognizer per suppression domain, each trying to
 * interpret a comment's already-canonicalized content (see canonicalize-comment.ts) as a
 * suppression directive belonging to its own domain. Adding a new domain means adding one more
 * recognizer to RECOGNIZERS below -- nothing about discover-suppressions.ts, registry.ts, or
 * synchronize.ts needs to change.
 */
interface RecognizedSuppression {
  readonly domain: string
  readonly rule: readonly string[]
  /**
   * The directive's own comment content, minus its disable-domain keywords and its rule list --
   * i.e. whatever free text remains, trimmed, or `""` if none. Unlike `justification`/
   * `alternatives`/`remediation` (see policy-config.ts), this is never hand-authored: every
   * recognizer derives it mechanically from the same comment `rule` was parsed out of, so a
   * domain's policy can require it (`SuppressionRequirement`'s `"reason"`) without depending on a
   * human filling in disable-comments.json after the fact.
   */
  readonly reason: string
}

type SuppressionRecognizer = (canonicalContent: string) => RecognizedSuppression | undefined

const ESLINT_DIRECTIVE = /^eslint-disable(?:-next-line|-line)?(?:\s+|$)/
const RULE_SEPARATOR = /[\s,]+/
// ESLint's own directive grammar separates the rule list from a free-text justification with
// "--" (enforced in this repository by eslint-comments/require-description, e.g.
// "eslint-disable-next-line no-console -- reason"); everything from the first "--" onward is
// prose, never a rule name, and must never be split into fake per-word "rules" -- it becomes
// `reason` instead.
const DESCRIPTION_SEPARATOR = /--/

/**
 * ESLint's own `eslint-disable`/`eslint-disable-next-line`/`eslint-disable-line` directives,
 * including the multiline block form. A directive with no rules named disables every rule for its
 * scope -- ESLint's own convention -- represented here as `rule: ["*"]` rather than an empty
 * array, both to keep `rule` non-empty (disable-comments.json rejects an empty rule list as
 * malformed) and because `resolve-policy.ts`'s `resolveRequirement` special-cases exactly this
 * literal value to mean "every rule in this domain, resolved to the strictest policy among them" --
 * deliberately not treated as an ordinary glob pattern (`minimatch("*", pattern)` tests `"*"` as a
 * literal target, which does not match a pattern like `"security/*"`).
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
  // trims to a non-empty string but splits+filters down to an empty array -- distinct from "no rule
  // list at all" (the ["*"] branch above), so it isn't caught there. An empty `rule` violates the
  // non-empty-rule invariant enforced everywhere else (registry.ts's validateRecord,
  // strykerRecognizer's own identical guard below) and crashes resolve-policy.ts's
  // `rule.map(...).reduce(stricterOf)` on an empty array.
  if (rule.length === 0) return undefined

  return { domain: "eslint", rule, reason: reasonParts.join("--").trim() }
}

// Not `\b` at the end -- "-" is a non-word character, so a trailing `\b` alone would also match
// an unrelated identifier like "@ts-ignore-something". The directive must be the whole content, or
// be immediately followed by whitespace or a colon (a trailing human-readable reason, or the
// error-code-attaching convention `@ts-expect-error:TS2345` that tsc itself honors by prefix match
// alone -- this recognizer must accept everything tsc does, or a real suppression goes ungoverned).
const TYPESCRIPT_DIRECTIVE = /^@ts-(ignore|expect-error)(?:[\s:]|$)/

/**
 * TypeScript's own `@ts-ignore`/`@ts-expect-error` suppression comments. These are directives, not
 * parameterized rules -- there is nothing analogous to an ESLint rule id to extract -- so the
 * directive itself becomes the sole `rule` entry (see DisableCommentRecord's doc comment on
 * `rule`).
 * @param canonicalContent - The comment's decoration-stripped content.
 * @returns The recognized `typescript` suppression, or `undefined` if `canonicalContent` isn't a `@ts-ignore`/`@ts-expect-error` directive.
 */
export const typescriptRecognizer: SuppressionRecognizer = (canonicalContent) => {
  const match = TYPESCRIPT_DIRECTIVE.exec(canonicalContent)
  if (!match) return undefined

  const reason = canonicalContent.slice(match[0].length).trim()

  return { domain: "typescript", rule: [`@ts-${match[1]}`], reason }
}

// Not `\bprettier-ignore\b` -- "-" is a non-word character, so a trailing `\b` alone would also
// match an unrelated directive like "prettier-ignore-start" (real Prettier has no such directive,
// but this recognizer must not invent one). The directive must be the whole content, or be
// immediately followed by whitespace (e.g. a trailing human comment).
const PRETTIER_DIRECTIVE = /^prettier-ignore(?:\s|$)/

/**
 * Prettier's `prettier-ignore` directive -- like the TypeScript directives, not parameterized.
 * @param canonicalContent - The comment's decoration-stripped content.
 * @returns The recognized `prettier` suppression, or `undefined` if `canonicalContent` isn't a `prettier-ignore` directive.
 */
export const prettierRecognizer: SuppressionRecognizer = (canonicalContent) => {
  const match = PRETTIER_DIRECTIVE.exec(canonicalContent)
  if (!match) return undefined

  const reason = canonicalContent.slice(match[0].length).trim()

  return { domain: "prettier", rule: ["prettier-ignore"], reason }
}

// Stryker's own directive grammar: "Stryker disable [next-line] <all | mutator[,mutator...]>".
// Unlike ESLint's bare-disable case, "all" is Stryker's own literal token for "every mutator" --
// there's no "rule list omitted" case to placeholder with a synthetic "*" for, so a bare-all
// directive's `rule` is `["all"]` verbatim. This matters beyond naming: `all` doubles as the exact
// string a domain policy uses to forbid it (see policy-config.ts's `stryker.rules.all`), and
// scripts/suppression-governance/resolve-policy.ts's `resolveRequirement` falls back to `minimatch(rule, pattern)`
// for any rule that isn't an exact match -- a policy key of `"*"` would glob-match every mutator
// name (`minimatch("ConditionalExpression", "*")` is `true`), silently forbidding every stryker
// suppression instead of just the "all" ones. The literal string "all" has no such glob meaning.
// Single literal spaces, not `\s+`, between each fixed word -- three independent `\s+` groups in
// one pattern is enough for eslint-plugin-security's detect-unsafe-regex to flag as unsafe (its
// backtracking-complexity estimate grows with quantifier count, even without true catastrophic
// backtracking here). Every real directive in this codebase is single-space-separated, matching
// canonicalizeComment's own line-trimming, so literal spaces lose no real matches.
const STRYKER_DIRECTIVE = /^Stryker disable(?: next-line)?(?: |$)/i

/**
 * Stryker's own `// Stryker disable [next-line] <all|mutator[,mutator...]>` directives.
 * `Stryker restore` is intentionally not matched -- it re-enables mutation testing rather than
 * suppressing it, the same reason `eslintRecognizer` never matches `eslint-enable`.
 * @param canonicalContent - The comment's decoration-stripped content.
 * @returns The recognized `stryker` suppression, or `undefined` if `canonicalContent` isn't a `Stryker disable` directive.
 */
export const strykerRecognizer: SuppressionRecognizer = (canonicalContent) => {
  const match = STRYKER_DIRECTIVE.exec(canonicalContent)
  if (!match) return undefined

  const remainder = canonicalContent.slice(match[0].length)
  const [ruleListText = "", ...reasonParts] = remainder.split(DESCRIPTION_SEPARATOR)
  const parsedRules = ruleListText.trim().split(RULE_SEPARATOR).filter(Boolean)
  // A Stryker directive with no mutator list -- a bare "Stryker disable" /
  // "Stryker disable next-line", or a stray separator -- is governed as if
  // it named "all" (Stryker's own every-mutator token) rather than slipping
  // past governance entirely, the same way the eslint recognizer above maps
  // a directive with no rule list onto the every-rule wildcard.
  const rule = parsedRules.length === 0 ? ["all"] : parsedRules

  return { domain: "stryker", rule, reason: reasonParts.join("--").trim() }
}

/** Tried in order; the first recognizer to match a comment's canonical content wins. */
const RECOGNIZERS: readonly SuppressionRecognizer[] = [
  eslintRecognizer,
  typescriptRecognizer,
  prettierRecognizer,
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

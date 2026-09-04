import type { StandardSchemaV1 } from "../standard-schema/types.js"

/**
 * Renders a failed `output.schema` validation's issues as a single, human-readable string for
 * `ParsedOutputFailure.error` -- e.g. `Schema validation failed: foo.bar: Expected string;
 * items[2].name: Required`. Kept as its own small module, independent of `parseOutput`, so its
 * path-rendering logic (the only non-trivial part) can be unit-tested directly.
 * @param issues - the failed `StandardSchemaV1.Result`'s `issues`.
 * @returns the formatted error string.
 */
export function formatSchemaIssues(issues: readonly StandardSchemaV1.Issue[]): string {
  return `Schema validation failed: ${issues.map(formatIssue).join("; ")}`
}

/**
 * Renders one issue as `path: message`, or just `message` when it has no path.
 * @param issue - the issue to render.
 * @returns the rendered issue.
 */
function formatIssue(issue: StandardSchemaV1.Issue): string {
  const path = formatPath(issue.path)
  return path === "" ? issue.message : `${path}: ${issue.message}`
}

/**
 * Renders an issue's `path` as a dotted/bracketed accessor string, e.g. `foo.bar` or
 * `items[2].name`. Each segment is either a bare `PropertyKey` (`string | number | symbol` -- a
 * `symbol` must never be interpolated directly into a template literal, which throws `TypeError:
 * Cannot convert a Symbol value to a string`; always going through `String(key)` avoids that for
 * every segment type uniformly) or a `{ key: PropertyKey }` object per the spec.
 * @param path - the issue's raw `path`, if any.
 * @returns the rendered path, or `""` for a pathless issue.
 */
function formatPath(
  path: readonly (PropertyKey | StandardSchemaV1.PathSegment)[] | undefined,
): string {
  // Equivalent mutant: mutating `path.length === 0` to `false` makes an empty (but defined) `path`
  // fall through to `path.map(...).join("")` below instead of returning `""` here directly -- but
  // mapping and joining an empty array always produces `""` regardless of the mapping function, so
  // both branches are observably identical for every possible input; no test could ever distinguish
  // them by `formatPath`'s return value.
  // Stryker disable next-line ConditionalExpression -- equivalent mutant: `path.length === 0` falling through to `path.map(...).join("")` on an empty array also produces `""`, identical to this early return, for every possible input -- no test could ever distinguish them.
  if (path === undefined || path.length === 0) return ""

  return path
    .map((segment) =>
      // eslint-disable-next-line secure-coding/no-improper-type-validation -- `segment` is declared `PropertyKey | StandardSchemaV1.PathSegment` (never `null` or an array), so `typeof segment === "object"` can only match the `PathSegment` object form here; the null/array-safe rewrite this rule suggests is flagged as an unreachable condition by @typescript-eslint/no-unnecessary-condition given that exact type, so satisfying both rules at once is impossible -- the type itself is the guarantee this check would otherwise add at runtime.
      typeof segment === "object" ? segment.key : segment,
    )
    .map((key, index) => {
      if (typeof key === "number") return `[${String(key)}]`
      const rendered = String(key)
      return index === 0 ? rendered : `.${rendered}`
    })
    .join("")
}

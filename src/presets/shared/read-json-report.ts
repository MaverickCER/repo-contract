import type { PolicyResult } from "../../types.js"

/** The report, already JSON-parsed and narrowed to `T`, or the fail `PolicyResult` to return verbatim when reading or parsing it failed. See `readJsonReport`. */
type ReadJsonReportResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly result: PolicyResult }

/**
 * Reads and JSON-parses a report a tool wrote to disk rather than printing to stdout. Every preset
 * whose tool has no stdout JSON mode (jscpd, markdownlint-cli2, secretlint) shares this shape. A
 * failed read fails with one rationale, and invalid JSON fails with another. Each failure takes its
 * caller-supplied rationale, not a generic shared message. A missing report and invalid JSON
 * usually need different fixes: a misconfigured reporter or output flag, or a broken tool run.
 * Each tool's advice also differs. markdownlint's read-failure rationale, for instance, names the
 * config field to check.
 *
 * Takes the read itself as a thunk (`readRaw`), not a `path` this function reads from.
 * So every call site's `readFile(LITERAL_PATH, "utf8")` stays written as a literal
 * argument in the caller's file. This repo's `security/detect-non-literal-fs-filename` policy
 * requires that: it forbids suppressing that rule outright (see policy-config.ts's
 * `eslint.rules["security/*"]`). The rule would otherwise flag a `path: string` function parameter
 * threaded into `readFile` here as non-literal.
 * @param readRaw - reads the report's raw text (typically `() => readFile(REPORT_PATH, "utf8")`).
 * @param onReadFailed - the rationale to fail with if `readRaw` rejects.
 * @param onParseFailed - the rationale to fail with if the read text isn't valid JSON.
 * @returns `{ ok: true, value }` with the parsed JSON narrowed to `T`, or `{ ok: false, result }` with the fail `PolicyResult` to return verbatim.
 */
export async function readJsonReport<T>(
  readRaw: () => Promise<string>,
  onReadFailed: string,
  onParseFailed: string,
): Promise<ReadJsonReportResult<T>> {
  let raw: string

  try {
    raw = await readRaw()
  } catch {
    return { ok: false, result: { outcome: "fail", rationale: onReadFailed } }
  }

  try {
    return { ok: true, value: JSON.parse(raw) as T }
  } catch {
    return { ok: false, result: { outcome: "fail", rationale: onParseFailed } }
  }
}

import type { PolicyResult } from "../../types.js"

/** The report, already JSON-parsed and narrowed to `T`, or the fail `PolicyResult` to return verbatim when reading or parsing it failed. See `readJsonReport`. */
type ReadJsonReportResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly result: PolicyResult }

/**
 * Reads and JSON-parses a report a tool wrote to disk rather than printing to stdout -- the "read,
 * fail with one rationale if the read itself fails, fail with a different rationale if the JSON is
 * invalid" shape shared by every preset whose tool has no stdout JSON mode (jscpd,
 * markdownlint-cli2, secretlint). Each failure takes its own caller-supplied rationale rather than a
 * generic shared message, since a missing report and invalid JSON usually point a consumer at a
 * different fix (a misconfigured reporter/output flag vs. a genuinely broken tool run), and each
 * tool's own advice differs (markdownlint's own read-failure rationale, for instance, names the
 * specific config field to check).
 *
 * Takes the read itself as a thunk (`readRaw`), rather than a `path` this function reads from
 * directly, so every call site's own `readFile(LITERAL_PATH, "utf8")` stays written as a literal
 * argument in the caller's own file -- required by this repo's `security/detect-non-literal-fs-filename`
 * policy, which forbids suppressing that rule outright (see policy-config.ts's `eslint.rules["security/*"]`)
 * and would otherwise flag a `path: string` function parameter threaded into `readFile` here as
 * non-literal.
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

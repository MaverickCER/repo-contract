import type { ParsedOutput, PolicyResult } from "../../src/types.js"

/** The check's output, already narrowed to `T`, or the fail `PolicyResult` to return verbatim when it wasn't available. See `requireParsedOutput`. */
type RequiredParsedOutput<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly result: PolicyResult }

/**
 * The one guard nearly every self-hosting check policy in this repository needs before trusting
 * its own parsed JSON output: fail early with a fixed rationale when the output never parsed (see
 * `ParsedOutput.success`), otherwise hand back `value` narrowed to `T`. Lives under `checks/`, not
 * `src/presets/shared/` (where it originally lived): every one of its real consumers is a
 * `checks/*.ts` file (`accessibility`, `adr-governance`, `api-contract`, `api-docs`,
 * `architecture`, `coverage`, `crap`, `docs`, `lint`, `security-network`,
 * `suppression-governance`), and none is a published preset -- unlike its former siblings
 * (`exit-code-fail-rationale.ts`, `missing-dependency.ts`, `read-json-report.ts`,
 * `error-warning-pass-policy.ts`, `vitest-json-policy.ts`), which all have real preset consumers
 * and correctly stay in `src/presets/shared/`. Deliberately generic over the value's own shape and
 * rationale text -- each check's own interpretation of its tool's JSON, and its own rationale
 * wording, stays in that check's own file.
 * @param output - the check's own parsed output to guard.
 * @param rationale - the exact rationale to fail with when `output` is missing or failed to parse.
 * @returns `{ ok: true, value }` if parsing succeeded, or `{ ok: false, result }` with the fail `PolicyResult` to return verbatim otherwise.
 */
export function requireParsedOutput<T>(
  output: ParsedOutput<unknown> | undefined,
  rationale: string,
): RequiredParsedOutput<T> {
  if (!output?.success) {
    // Surface the underlying parse error (when there is one) to every consumer:
    // the caller's rationale says which check failed, `output.error` says why.
    const detailed = output?.error ? `${rationale} ${output.error}` : rationale
    return { ok: false, result: { outcome: "fail", rationale: detailed } }
  }
  return { ok: true, value: output.value as T }
}

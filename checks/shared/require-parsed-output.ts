import type { ParsedOutput, PolicyResult } from "../../src/types.js"

/** The check's output, already narrowed to `T`, or the fail `PolicyResult` to return verbatim when it wasn't available. See `requireParsedOutput`. */
type RequiredParsedOutput<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly result: PolicyResult }

/**
 * The one guard nearly every self-hosting check policy in this repository needs before trusting
 * its own parsed JSON output. It fails early with a fixed rationale when the output never parsed
 * (see `ParsedOutput.success`), and otherwise hands back `value` narrowed to `T`.
 *
 * Lives under `checks/`, not `src/presets/shared/` where it originally lived. Every one of its
 * real consumers is a `checks/*.ts` file, and none is a published preset. The consumers include
 * `accessibility`, `adr-governance`, `architecture`, `coverage`, `crap`, `docs`, `lint`,
 * `security-network` and `suppression-governance`. (`api-contract`/`api-docs-report` moved out to
 * internal-package-contract and use that package's own equivalent helpers instead.) Its former
 * siblings all have real preset consumers and correctly stay in `src/presets/shared/`:
 * `exit-code-fail-rationale.ts`, `missing-dependency.ts`, `read-json-report.ts`,
 * `error-warning-pass-policy.ts` and `vitest-json-policy.ts`. Deliberately generic over the value's
 * own shape and rationale text. Each check's own interpretation of its tool's JSON, and its own
 * rationale wording, stays in that check's own file.
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

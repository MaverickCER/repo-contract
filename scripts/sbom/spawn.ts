import { sync as spawnSync } from "cross-spawn"
import path from "node:path"

/**
 * The CycloneDX spec version this repository deliberately targets -- confirmed, not assumed, by
 * reading the installed `@cyclonedx/cyclonedx-npm@6.0.1`'s own `--help` output directly (2026-09-30):
 * `--sv, --spec-version <version>` lists `"1.2", "1.3", "1.4", "1.5", "1.6"` as its only valid
 * choices, defaulting to `"1.6"` -- this tool has no 1.7 support at all (an earlier plan for this
 * work assumed 1.6 or 1.7 as "current stable"; only 1.6 is real for this exact tool version). Passed
 * explicitly below, rather than relying on the tool's own default, so a future `cyclonedx-npm`
 * upgrade that changes its default can never silently re-target this repository's own committed
 * docs/sbom.cdx.json to a different spec version without a visible diff to this constant. See
 * README.md's own SBOM section for the same confirmation, stated for a reader who won't open this
 * file. Not exported -- its one real consumer is `runCycloneDxNpm` below, in this same file; a
 * test asserting the targeted spec version does so against the real generated document instead
 * (see `test/integration/sbom/generate.integration.test.ts`), which is what actually proves this
 * constant took effect, rather than re-importing and echoing it back.
 */
const CYCLONEDX_SPEC_VERSION = "1.6"

/** The outcome of one `cyclonedx-npm` invocation -- see `runCycloneDxNpm`'s own doc comment. */
export type CycloneDxNpmResult =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly reason: "cli-not-installed" | "cli-failed"
      readonly message: string
    }

/**
 * Runs `cyclonedx-npm` against `<root>/package-lock.json`, writing its own real, already-spec-
 * compliant CycloneDX JSON document directly to `<root>/docs/sbom.cdx.json` via the tool's own
 * `--output-file` -- this repository never re-serializes that document itself (no
 * `JSON.parse`/`JSON.stringify` round-trip here at all): the file on disk afterward is byte-for-byte
 * the real generator's own output, which is exactly what keeps it schema-valid and reproducible
 * across runs (`--output-reproducible` below; confirmed directly, twice in a row, sha1-identical
 * against this repository's own real package-lock.json).
 *
 * Flag-by-flag:
 * - `--package-lock-only`: sources the dependency graph from package-lock.json alone (per this
 *   check's own task -- see README.md's SBOM section), not whatever happens to be physically present
 *   under node_modules/ on this particular machine.
 * - `--ignore-npm-errors`: this repository's own package-lock.json currently resolves a real,
 *   pre-existing peer-dependency mismatch (`eslint-plugin-react-hooks`, nested under
 *   `@rnx-kit/eslint-plugin`, wants `eslint <=9`; this repository runs `eslint@10`) that makes
 *   cyclonedx-npm's own internal `npm ls --json --long --all --package-lock-only` step exit non-zero
 *   (`ELSPROBLEMS`) before producing any BOM at all -- confirmed by direct invocation against this
 *   repository's real lockfile (2026-09-30). This flag is cyclonedx-npm's own documented escape
 *   hatch for exactly this class of resolvable-but-technically-invalid tree ("might be used ... if
 *   `npm install` was run with `--force` or `--legacy-peer-deps`"); the resulting BOM was confirmed
 *   complete (1203 components against this repository's own real tree) and schema-valid regardless.
 *   Fixing that underlying peer conflict is out of scope for this check.
 * - `--output-reproducible`: strips time-/random-based values (the document's own top-level
 *   `metadata.timestamp` and `serialNumber`) -- see this function's own doc comment above for why
 *   that determinism matters here.
 * - `--spec-version CYCLONEDX_SPEC_VERSION`: see that constant's own doc comment.
 * - `--output-format JSON`: this check never generates the XML alternative.
 * - `--validate`: cyclonedx-npm's own ajv-backed validation of the resulting document before it's
 *   even written -- a cheap first line of defense. README.md's own SBOM section documents the
 *   further, independent, out-of-band validation this repository performed against the real
 *   published CycloneDX JSON schema.
 *
 * Not directly unit-tested -- mirrors `scripts/openssf-scorecard/gh-api.ts`'s own `spawnGhApi`
 * (also untested at the unit tier): a thin, essentially return-what-the-OS-gave-us wrapper around a
 * real subprocess. Exercised for real by `test/integration/sbom/generate.integration.test.ts`
 * instead. `generateSbom` (generate.ts), this function's one real caller, is unit-tested with this
 * function mocked -- see that file's own tests, mirroring how
 * `test/unit/scripts/openssf-scorecard/weights.test.ts` mocks `gh-api.ts`'s `ghApiRaw` rather than
 * `cross-spawn` itself.
 * @param root - Repository root `cyclonedx-npm` should scan and write its output relative to.
 * @returns Whether the write succeeded, or a classified failure.
 */
export function runCycloneDxNpm(root: string): CycloneDxNpmResult {
  const outputPath = path.join(root, "docs/sbom.cdx.json")

  const result = spawnSync(
    "cyclonedx-npm",
    [
      "--package-lock-only",
      "--ignore-npm-errors",
      "--output-reproducible",
      "--spec-version",
      CYCLONEDX_SPEC_VERSION,
      "--output-format",
      "JSON",
      "--validate",
      "--output-file",
      outputPath,
    ],
    {
      cwd: root,
      encoding: "utf8",
      // Confirmed directly against this repository's own ~1200-component tree: well under 2
      // seconds. 5 minutes is a generous ceiling that still bounds a stalled invocation, matching
      // scripts/security-socket/scan.ts's own reasoning for its identical deadline.
      timeout: 5 * 60 * 1000,
      // A wedged cyclonedx-npm process that ignores or slowly handles the default SIGTERM would
      // otherwise keep spawnSync blocked past the deadline anyway -- same reasoning as
      // scripts/security-socket/scan.ts's identical choice.
      killSignal: "SIGKILL",
      // stdout/stderr here are only ever cyclonedx-npm's own diagnostic/error text -- the real BOM
      // goes straight to `--output-file`, never through this process's own stdout/stderr. 4 MiB is
      // generous headroom above anything that text could realistically reach.
      maxBuffer: 4 * 1024 * 1024,
    },
  )

  if (result.error) {
    const nodeError = result.error as NodeJS.ErrnoException
    if (nodeError.code === "ENOENT") {
      return {
        ok: false,
        reason: "cli-not-installed",
        message:
          "The `cyclonedx-npm` CLI is not installed (expected as a devDependency of this repository -- run `npm ci`).",
      }
    }
    return {
      ok: false,
      reason: "cli-failed",
      message: `Failed to spawn cyclonedx-npm: ${nodeError.message}`,
    }
  }

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim()
    return {
      ok: false,
      reason: "cli-failed",
      message: `cyclonedx-npm exited with code ${String(result.status)}${detail.length > 0 ? `:\n${detail}` : "."}`,
    }
  }

  return { ok: true }
}

import { sync as spawnSync } from "cross-spawn"
import path from "node:path"

/**
 * The CycloneDX spec version this repository targets. The installed
 * `@cyclonedx/cyclonedx-npm@6.0.1`'s `--help` lists `"1.2", "1.3", "1.4", "1.5", "1.6"` as the
 * only valid `--sv, --spec-version <version>` choices, defaulting to `"1.6"`.
 * This tool version has no 1.7 support.
 *
 * Passed explicitly below rather than relying on the tool's default. A future `cyclonedx-npm`
 * upgrade that changes its default then cannot re-target the committed docs/sbom.cdx.json
 * without a visible diff to this constant.
 * README.md's SBOM section states the same version for a reader who won't open this file.
 * Not exported: its one consumer is `runCycloneDxNpm` below, in this same file. A
 * test asserting the targeted spec version checks the generated document instead (see
 * `test/integration/sbom/generate.integration.test.ts`). That proves this constant took
 * effect, rather than re-importing and echoing it back.
 */
const CYCLONEDX_SPEC_VERSION = "1.6"

/** The outcome of one `cyclonedx-npm` invocation: see `runCycloneDxNpm`'s doc comment. */
export type CycloneDxNpmResult =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly reason: "cli-not-installed" | "cli-failed"
      readonly message: string
    }

/**
 * A copy of an environment without `NODE_ENV`, so the tool falls back to its default.
 * @param environment - The environment to copy.
 * @returns The copy, never the original.
 */
function withoutNodeEnv(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const copy = { ...environment }
  delete copy.NODE_ENV
  return copy
}

/**
 * Runs `cyclonedx-npm` against `<root>/package-lock.json`. The tool writes its
 * spec-compliant CycloneDX JSON document via `--output-file`, to
 * `options.outputFile` under `root` (default `docs/sbom.cdx.json`). This function never
 * re-serializes that document; there is no `JSON.parse`/`JSON.stringify` round-trip here. The
 * file on disk afterward is byte-for-byte the generator's output. That keeps it
 * schema-valid and reproducible across runs (`--output-reproducible` below).
 * Two consecutive runs against this repository's package-lock.json produce sha1-identical files.
 * The one later rewrite is generate.ts's `withoutNpmTool`. It drops only the runner's `npm`
 * tool entry, in the generator's formatting.
 *
 * Flag-by-flag:
 * - `--package-lock-only`: sources the dependency graph from package-lock.json alone, per this
 *   check's task (see README.md's SBOM section). It ignores whatever happens to be physically
 *   present under node_modules/ on this particular machine.
 * - `--ignore-npm-errors`: this repository's package-lock.json resolves a
 *   peer-dependency mismatch. `eslint-plugin-react-hooks`, nested under
 *   `@rnx-kit/eslint-plugin`, wants `eslint <=9`; this repository runs `eslint@10`.
 *   cyclonedx-npm's internal `npm ls --json --long --all --package-lock-only` step then exits
 *   non-zero (`ELSPROBLEMS`) before producing any BOM at all.
 *   This flag is cyclonedx-npm's documented escape hatch for a resolvable but technically
 *   invalid tree ("might be used ... if `npm install` was run with `--force` or
 *   `--legacy-peer-deps`"). The resulting BOM is complete and schema-valid.
 *   Fixing that underlying peer conflict is out of scope for this check.
 * - `--output-reproducible`: strips time-/random-based values (the document's top-level
 *   `metadata.timestamp` and `serialNumber`); see this function's doc comment above for why
 *   that determinism matters here.
 * - `--spec-version CYCLONEDX_SPEC_VERSION`: see that constant's doc comment.
 * - `--output-format JSON`: this check never generates the XML alternative.
 * - `--validate`: cyclonedx-npm's ajv-backed validation of the resulting document before it's
 *   even written; a cheap first line of defense. README.md's SBOM section documents the
 *   separate validation against the published CycloneDX JSON schema.
 *
 * Not unit-tested. It mirrors `scripts/openssf-scorecard/gh-api.ts`'s `spawnGhApi`
 * (also untested at the unit tier): a thin, return-what-the-OS-gave-us wrapper around a
 * subprocess. `test/integration/sbom/generate.integration.test.ts` runs the real tool instead.
 * `generateSbom` (generate.ts), this function's one caller, is unit-tested with this function
 * mocked (see that file's tests). That mirrors how
 * `test/unit/scripts/openssf-scorecard/weights.test.ts` mocks `gh-api.ts`'s `ghApiRaw` rather than
 * `cross-spawn` itself.
 * @param root - Repository root `cyclonedx-npm` should scan and write its output relative to.
 * @param options - Which document to write and whether to include development dependencies.
 * @param options.outputFile - Repo-relative path to write; defaults to `docs/sbom.cdx.json`.
 * @param options.production - When true, development dependencies are left out (`--omit dev`).
 * @returns Whether the write succeeded, or a classified failure.
 */
export function runCycloneDxNpm(
  root: string,
  options: { readonly outputFile?: string; readonly production?: boolean } = {},
): CycloneDxNpmResult {
  const outputPath = path.join(root, options.outputFile ?? "docs/sbom.cdx.json")

  const result = spawnSync(
    "cyclonedx-npm",
    [
      "--package-lock-only",
      // `production` inventories only what a user installs (`--omit dev`). For a package with no
      // runtime dependencies that is the package itself and nothing else. That is the true answer
      // to "what does installing this bring in".
      ...(options.production === true ? ["--omit", "dev"] : []),
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
      // The build inventory must include development dependencies whatever the caller's
      // environment says. With `NODE_ENV=production`, cyclonedx-npm omits them by default. That
      // would silently turn the build document into a production one.
      env: options.production === true ? process.env : withoutNodeEnv(process.env),
      // This repository's ~1200-component tree takes well under 2 seconds.
      // A 5-minute ceiling is generous and still bounds a stalled invocation.
      // The same deadline in scripts/security-socket/scan.ts has the same reason.
      timeout: 5 * 60 * 1000,
      // A wedged cyclonedx-npm process that ignores or slowly handles the default SIGTERM would
      // otherwise keep spawnSync blocked past the deadline anyway. This is the same reasoning as
      // scripts/security-socket/scan.ts's identical choice.
      killSignal: "SIGKILL",
      // The stdout/stderr here only ever carry cyclonedx-npm's diagnostic/error text. The
      // BOM goes straight to `--output-file`, never through this process's stdout/stderr.
      // 4 MiB is generous headroom above anything that text could realistically reach.
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
          "The `cyclonedx-npm` CLI is not installed (expected as a devDependency of this repository; run `npm ci`).",
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

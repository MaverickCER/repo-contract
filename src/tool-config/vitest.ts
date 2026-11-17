/**
 * A Vitest config whose coverage writes what the `coverage` and `crap` presets read, over the
 * source directory minus the exclude list.
 * @packageDocumentation
 */
import { excludeGlobs, sourceGlob } from "./exclude.js"
import type { ToolConfigOptions } from "./types.js"

/** Options for {@link vitestConfig}. */
export interface VitestConfigOptions extends Pick<ToolConfigOptions, "srcDir" | "exclude"> {
  /** Test file globs. Defaults to `["test/**\/*.test.ts"]`. */
  readonly include?: readonly string[]
}

/** A coverage report format the fragment names. */
export type CoverageReporterName = "text" | "html" | "lcov" | "json" | "json-summary"

/**
 * The Vitest settings the helper sets. Pass it to `defineConfig` or `mergeConfig`. Arrays are
 * mutable copies, as Vitest's config type takes.
 */
export interface VitestConfigFragment {
  readonly test: {
    readonly include: string[]
    readonly coverage: {
      readonly provider: "v8"
      /** Includes `json-summary` and `json`, which the presets read. */
      readonly reporter: CoverageReporterName[]
      /** `coverage`: the presets read `coverage/coverage-summary.json` and `coverage/coverage-final.json`. */
      readonly reportsDirectory: string
      readonly reportOnFailure: boolean
      readonly include: string[]
      readonly exclude: string[]
    }
  }
}

/**
 * `reportOnFailure` is on so a failing run still leaves a summary for the `coverage` preset to
 * judge, rather than a stale one from an earlier run.
 * @param options - the source directory, test globs and exclude list.
 * @returns the Vitest settings.
 * @beta
 */
export function vitestConfig(options: VitestConfigOptions = {}): VitestConfigFragment {
  return {
    test: {
      include: [...(options.include ?? ["test/**/*.test.ts"])],
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "lcov", "json", "json-summary"],
        reportsDirectory: "coverage",
        reportOnFailure: true,
        include: [sourceGlob(options.srcDir)],
        exclude: [...excludeGlobs(options.exclude)],
      },
    },
  }
}

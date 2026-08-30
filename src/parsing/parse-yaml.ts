import type * as Yaml from "yaml"
import { ParserDependencyMissingError } from "../errors.js"
import type { ParsedOutput } from "../types.js"

/**
 * Parses `stdout` as YAML using the optional `yaml` peer dependency, loaded
 * via a dynamic `import()` only when a check actually requests
 * `output.format: "yaml"` -- consumers who never use YAML never pay for it.
 * If `yaml` cannot be loaded at all (not installed, or any other import-time
 * failure), throws `ParserDependencyMissingError` with the original failure
 * preserved as `cause`, rather than guessing at a specific module-resolution
 * error code that could vary across Node versions and module systems (ESM
 * vs. the package's own CJS build output).
 *
 * A malformed-YAML failure (the dependency loaded fine, but `stdout` isn't
 * valid YAML) is a normal parse failure, not a missing-dependency error --
 * it's returned as `{ success: false }`, following the same "preserve raw
 * output, report failure as data" contract as `parseJson`.
 * @param stdout - the check's raw stdout to parse as YAML.
 * @param checkId - identifies which check's output is being parsed, used in the thrown `ParserDependencyMissingError`.
 * @returns the parsed value on success, or the unparsed failure with `stdout` preserved.
 */
export async function parseYaml(stdout: string, checkId: string): Promise<ParsedOutput<unknown>> {
  let yamlModule: typeof Yaml
  try {
    yamlModule = await import("yaml")
  } catch (error) {
    throw new ParserDependencyMissingError(checkId, "yaml", error)
  }

  try {
    return { format: "yaml", success: true, value: yamlModule.parse(stdout) }
  } catch (error) {
    return {
      format: "yaml",
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

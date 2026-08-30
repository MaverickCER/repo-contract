import type { OutputFormat, ParsedOutput } from "../types.js"
import { parseJson } from "./parse-json.js"
import { parseText } from "./parse-text.js"
import { parseYaml } from "./parse-yaml.js"

/**
 * Dispatches to the parser for `format`. Never throws for a malformed-output parse failure -- see each parser's own documentation. May throw `ParserDependencyMissingError` for `format: "yaml"` if the optional `yaml` peer dependency is unavailable.
 * @param format - which parser to dispatch to.
 * @param stdout - the check's raw stdout to parse.
 * @param checkId - identifies which check's output is being parsed, used in the `ParserDependencyMissingError` thrown for a missing `yaml` dependency.
 * @returns the parsed output produced by the selected parser.
 */
export async function parseOutput(
  format: OutputFormat,
  stdout: string,
  checkId: string,
): Promise<ParsedOutput<unknown>> {
  switch (format) {
    case "json":
      return parseJson(stdout)
    case "yaml":
      return parseYaml(stdout, checkId)
    case "text":
      return parseText(stdout)
  }
}

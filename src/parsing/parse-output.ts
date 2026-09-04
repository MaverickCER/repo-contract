import { StandardSchemaValidateThrewError } from "../errors.js"
import type { StandardSchemaV1 } from "../standard-schema/types.js"
import type { OutputFormat, ParsedOutput } from "../types.js"
import { formatSchemaIssues } from "./format-schema-issues.js"
import { parseJson } from "./parse-json.js"
import { parseText } from "./parse-text.js"
import { parseYaml } from "./parse-yaml.js"

/**
 * Dispatches to the parser for `format`, then -- only on a successful parse, and only if `schema`
 * is supplied -- runs `schema["~standard"].validate()` against the parsed value
 * (https://standardschema.dev). `parse-json.ts`/`parse-yaml.ts`/`parse-text.ts` stay entirely
 * unaware of `schema`; this is the sole orchestration point. `validate()` may return its `Result`
 * synchronously or as a `Promise` -- `await`ing either uniformly is a no-op for the synchronous
 * case, so this doesn't need its own reason to be async on top of the one this function already
 * has (the dynamic `import("yaml")` for `format: "yaml"`). A successful `Result` (`issues ===
 * undefined`) *replaces* `value` with the schema's own (possibly transformed) output; a failing
 * `Result` becomes a `ParsedOutputFailure` whose `error` is built by `formatSchemaIssues`.
 * `schema.validate()` itself throwing or rejecting is a bug in the consumer-supplied schema, not
 * malformed output -- it throws `StandardSchemaValidateThrewError` rather than becoming a
 * `ParsedOutputFailure`. Never throws for a malformed-output parse failure -- see each parser's
 * own documentation. May throw `ParserDependencyMissingError` for `format: "yaml"` if the
 * optional `yaml` peer dependency is unavailable.
 * @param format - which parser to dispatch to.
 * @param stdout - the check's raw stdout to parse.
 * @param checkId - identifies which check's output is being parsed, used in a thrown `ParserDependencyMissingError`/`StandardSchemaValidateThrewError`.
 * @param schema - an optional Standard Schema-compliant validator to run against a successful parse's value.
 * @returns the parsed (and, if `schema` was supplied and validation succeeded, schema-transformed) output.
 */
export async function parseOutput(
  format: OutputFormat,
  stdout: string,
  checkId: string,
  schema?: StandardSchemaV1,
): Promise<ParsedOutput<unknown>> {
  const parsed = await dispatch(format, stdout, checkId)
  if (!parsed.success || schema === undefined) return parsed

  let result: StandardSchemaV1.Result<unknown>
  try {
    result = await schema["~standard"].validate(parsed.value)
  } catch (error) {
    throw new StandardSchemaValidateThrewError(checkId, error)
  }

  if (result.issues === undefined) {
    return { format, success: true, value: result.value }
  }
  return { format, success: false, error: formatSchemaIssues(result.issues) }
}

/**
 * Dispatches to the parser for `format` -- the pre-existing behavior of `parseOutput`, extracted
 * so `parseOutput` itself reads as: parse, then optionally validate.
 * @param format - which parser to dispatch to.
 * @param stdout - the check's raw stdout to parse.
 * @param checkId - identifies which check's output is being parsed, used in a thrown `ParserDependencyMissingError`.
 * @returns the parsed output produced by the selected parser.
 */
async function dispatch(
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

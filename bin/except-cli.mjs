// `repo-contract except <id>`: fill in one exception record and say what it still lacks. It finds
// the record by id across the registry directory. For a `mutation:` id with no record yet, it
// builds one from the mutation report, since the Mutation check writes no stubs. It validates the
// edited record with the v2 rules and writes only the registry it changed. It never writes a
// registry it could not read, since that would drop the records in it. Exit 0 when the record is
// complete, 1 when it is still incomplete or cannot be found or written, 2 for a usage error.

import path from "node:path"
import { commandDirectory, messageOf, parseCommandOptions } from "./cli-options.mjs"

export const EXCEPT_USAGE = `Usage: repo-contract except <id> [options]

Fill in one exception record and list the fields still blank. A check writes a blank record (a
stub) when it finds something a record can excuse; this command fills it. A mutation id needs no
stub: the record is built from the mutation report.

  repo-contract except dead-code:unused-file:src/a.ts --set justification="Loaded by name."

A record is complete when justification and the six version 2 fields (ruleBroken, attempted,
constraint, whyPreferable, residualRisk, revisitWhen) have text, plus alternatives, remediation,
method and exceptionType when the record carries them. expires is "" or a YYYY-MM-DD date. The
check that owns the registry still judges the record on its next run.

Options:
  --set <field>=<text>  Set one field; repeat for more. Setting a version 2 field on a
                        version 1 record upgrades it to version 2
  --dir <dir>           Registry directory (default .repo-contract/exceptions)
  --report <file>       Mutation report for a new mutation record
                        (default reports/mutation/mutation.json)
  --json                Print the result as JSON
  -C <dir>              Run as if started in <dir>
  -h, --help            Show this help
  -V, --version         Print the version

Exit status: 0 when the record is complete, 1 when it is incomplete or cannot be written, 2 for a
usage error.`

const DEFAULT_DIRECTORY = ".repo-contract/exceptions"
const DEFAULT_REPORT = "reports/mutation/mutation.json"
const MUTATION_PREFIX = "mutation:"
const MUTATION_REGISTRY = "mutation"
const MUTATION_IDENTITY = ["file", "mutator", "original", "replacement"]

/**
 * Parses the arguments after `except`.
 * @param {readonly string[]} argv - The arguments.
 * @returns {object} `help`, `version`, a usage `error`, or the options to run with.
 */
export function parseExceptArgs(argv) {
  const parsed = parseCommandOptions(argv, {
    values: { "--dir": "dir", "--report": "report", "-C": "cwd" },
    repeated: { "--set": "set" },
    flags: { "--json": "json" },
    positionals: 1,
  })
  if (parsed.kind !== "run") return parsed
  const [id] = parsed.positionals
  if (id === undefined) return { kind: "error", message: "give the id of one exception record" }
  const set = []
  for (const pair of parsed.options.set) {
    const equals = pair.indexOf("=")
    if (equals < 1) return { kind: "error", message: `--set needs <field>=<text>, not '${pair}'` }
    set.push({ field: pair.slice(0, equals), value: pair.slice(equals + 1) })
  }
  const { dir = DEFAULT_DIRECTORY, report = DEFAULT_REPORT, json = false, cwd } = parsed.options
  return {
    kind: "run",
    options: { id, set, dir, report, json, ...(cwd === undefined ? {} : { cwd }) },
  }
}

/** A failure that ends the command with exit 1 and one message. */
class ExceptError extends Error {}

/**
 * @param {string} root - The working directory.
 * @param {string} file - An absolute path.
 * @returns {string} `file` relative to `root`, with `/` separators.
 */
function display(root, file) {
  return path.relative(root, file).split(path.sep).join("/")
}

/**
 * Finds the one registry that holds `id`.
 * @param {object} context - The run's inputs and paths.
 * @returns {Promise<{ name: string, records: object[], index: number, unreadable: string[] }>}
 *   The registry and the record's index (`-1` when none holds it). `unreadable` names every
 *   registry, or the directory, that could not be read.
 */
async function findRecord({ input, root, directory, id }) {
  const { registries, errors } = await input.helpers.readExceptionRegistries(directory)
  const unreadable = errors.map(({ name }) => name)
  const holders = registries.filter(({ records }) => records.some((record) => record?.id === id))
  if (holders.length > 1) {
    const names = holders.map(({ name }) => display(root, path.join(directory, `${name}.json`)))
    throw new ExceptError(
      `${id} is in ${names.slice(0, -1).join(", ")} and ${names.at(-1)}. Keep it in one registry.`,
    )
  }
  if (holders.length === 1) {
    const [{ name, records }] = holders
    return {
      name,
      records: [...records],
      index: records.findIndex((record) => record?.id === id),
      unreadable,
    }
  }
  const mutationRegistry = registries.find(({ name }) => name === MUTATION_REGISTRY)
  return {
    name: MUTATION_REGISTRY,
    records: [...(mutationRegistry?.records ?? [])],
    index: -1,
    unreadable,
  }
}

/**
 * Builds a blank mutation record from the mutant the id names.
 * @param {object} context - The run's inputs and paths.
 * @returns {Promise<object>} The new record.
 */
async function mutationStub({ input, root, id, options }) {
  const reportPath = path.resolve(root, options.report)
  const text = await input.readFile(reportPath)
  if (text === undefined) {
    throw new ExceptError(
      `no record holds ${id}, and the mutation report ${options.report} could not be read. Run the Mutation check first, or name the report with --report.`,
    )
  }
  let report
  try {
    report = JSON.parse(text)
  } catch {
    throw new ExceptError(`${options.report} is not valid JSON.`)
  }
  const resolved = input.affected.resolveMutants(report)
  if (!resolved.ok) throw new ExceptError(`${options.report}: ${resolved.error}`)
  const mutant = input.affected.findMutantById(resolved.mutants, id)
  if (mutant === undefined) {
    throw new ExceptError(
      `no mutant in ${options.report} has the id ${id}. Copy the id from the Mutation check's output for this report.`,
    )
  }
  const { file, mutator, original, replacement } = mutant
  return {
    id,
    version: 2,
    justification: "",
    ...input.helpers.emptyV2Fields(),
    file,
    mutator,
    original,
    replacement,
  }
}

/**
 * Why `--set` may not write a field.
 * @param {Record<string, unknown>} record - The record as found.
 * @param {string} field - A field outside the settable ones.
 * @returns {string} The reason, as a sentence.
 */
function refusalOf(record, field) {
  if (field === "id") return "'id' identifies the record, so it cannot be set."
  if (field === "version") {
    return "'version' follows the fields the record holds, so it cannot be set."
  }
  if (Object.hasOwn(record, field)) {
    return `'${field}' identifies the finding, and the check writes it.`
  }
  return `'${field}' is not a field this record can carry.`
}

/**
 * Applies each `--set` to a copy of the record.
 * @param {object} helpers - The helpers engine.
 * @param {Record<string, unknown>} record - The record as found.
 * @param {readonly { field: string, value: string }[]} set - The fields to set.
 * @returns {Record<string, unknown>} The edited record.
 */
function applySets(helpers, record, set) {
  const v2Keys = [...helpers.EXCEPTION_V2_FIELD_KEYS, "expires"]
  const security = helpers.SECURITY_EXCEPTION_FIELD_KEYS.filter((key) => Object.hasOwn(record, key))
  const writable = ["justification", ...v2Keys, ...security]
  let edited = { ...record }
  for (const { field, value } of set) {
    if (!writable.includes(field)) {
      throw new ExceptError(
        `${refusalOf(record, field)} Fields you can set: ${writable.join(", ")}.`,
      )
    }
    // A version 1 record has no v2 fields; giving it one moves it to version 2, blanks included.
    if (v2Keys.includes(field) && edited.version === 1) {
      edited = { ...helpers.emptyV2Fields(), ...edited, version: 2 }
    }
    edited[field] = value
  }
  return edited
}

/**
 * Validates one record with the v2 rules. They cover the core fields, the id's namespace, unknown
 * keys, a version 2 record's v2 fields and the four security fields when present. A mutation
 * record's id must also still match its own fields. Per-check rules apply when that check next
 * runs, such as which exception types a registry accepts.
 * @param {object} input - The run's inputs.
 * @param {Record<string, unknown>} record - The edited record.
 * @returns {readonly string[]} Every problem found.
 */
function validate(input, record) {
  const { helpers, affected } = input
  const id = String(record.id)
  const namespace = id.slice(0, id.indexOf(":") + 1)
  // The registry rules allow every key the schema names. Naming every key but the v2 ones lets a
  // version 2 record carry its check's fields, and still flags a v2 field on a version 1 record.
  const v2Keys = new Set([...helpers.EXCEPTION_V2_FIELD_KEYS, "expires"])
  const schema = {
    namespace,
    metadataKeys: Object.keys(record).filter((key) => !v2Keys.has(key)),
    // Only the problems are read: the record is already built, and nothing uses the rebuilt one.
    validateRecord: (validated, raw, index, errors) => {
      if (helpers.SECURITY_EXCEPTION_FIELD_KEYS.some((key) => Object.hasOwn(raw, key))) {
        helpers.validateSecurityExceptionFields(raw, index, helpers.EXCEPTION_TYPES, errors)
      }
      if (namespace === MUTATION_PREFIX) {
        const identity = Object.fromEntries(MUTATION_IDENTITY.map((key) => [key, raw[key]]))
        const derived = MUTATION_IDENTITY.every((key) => typeof identity[key] === "string")
          ? affected.mutationExceptionId(identity)
          : undefined
        if (derived !== validated.id) {
          errors.push(
            `${validated.id} does not match the id derived from its own file, mutator, original and replacement (${String(derived)}).`,
          )
        }
      }
      return validated
    },
  }
  const result = helpers.validateExceptionRegistry([record], schema)
  // Every message starts with the record's place in the array, which means nothing here.
  return result.ok
    ? []
    : result.errors.map((error) => error.replace(/exceptions\[0\]\.?/, "").trimStart())
}

/**
 * @param {object} helpers - The helpers engine.
 * @param {Record<string, unknown>} record - The record, which `validate` has passed.
 * @returns {string[]} The required fields still blank, in a fixed order.
 */
function missingFields(helpers, record) {
  // A passed record holds each of these as a string or not at all. A version 1 record carries no
  // v2 field, and its checks read those as answered. Security fields apply only where present.
  const required = [
    "justification",
    ...helpers.EXCEPTION_V2_FIELD_KEYS,
    ...helpers.SECURITY_EXCEPTION_FIELD_KEYS,
  ]
  return required.filter((key) => Object.hasOwn(record, key) && record[key].trim() === "")
}

/**
 * @param {Record<string, unknown>} a - A record.
 * @param {Record<string, unknown>} b - Another.
 * @returns {boolean} Whether both hold the same keys and values.
 */
function sameRecord(a, b) {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]))
}

/**
 * Runs `repo-contract except`.
 * @param {object} input - Everything the command touches, injected.
 * @param {readonly string[]} input.argv - The arguments after `except`.
 * @param {string} input.cwd - The working directory.
 * @param {string} input.version - This package's version.
 * @param {(text: string) => void} input.stdout - Writes to standard output.
 * @param {(text: string) => void} input.stderr - Writes to standard error.
 * @param {object} input.helpers - The `repo-contract/helpers` engine.
 * @param {object} input.affected - `resolveMutants`, `findMutantById`, `mutationExceptionId`.
 * @param {(file: string) => Promise<string | undefined>} input.readFile - Reads the mutation report.
 * @param {(dir: string) => Promise<unknown>} input.mkdir - Creates the registry directory.
 * @returns {Promise<number>} The exit status.
 */
export async function runExcept(input) {
  const parsed = parseExceptArgs(input.argv)
  if (parsed.kind === "help") {
    input.stdout(`${EXCEPT_USAGE}\n`)
    return 0
  }
  if (parsed.kind === "version") {
    input.stdout(`${input.version}\n`)
    return 0
  }
  if (parsed.kind === "error") {
    input.stderr(
      `repo-contract except: ${parsed.message}\nTry 'repo-contract except --help' for more information.\n`,
    )
    return 2
  }

  const { options } = parsed
  const { id } = options
  const root = commandDirectory(input.cwd, options.cwd)
  const directory = path.resolve(root, options.dir)
  try {
    const found = await findRecord({ input, root, directory, id })
    let original
    if (found.index === -1) {
      if (!id.startsWith(MUTATION_PREFIX)) {
        const unreadable =
          found.unreadable.length === 0
            ? ""
            : ` These registries could not be read: ${found.unreadable.join(", ")}.`
        throw new ExceptError(
          `no registry in ${options.dir} holds ${id}. A check writes the blank record when it finds the problem, so run the contract first.${unreadable}`,
        )
      }
      original = await mutationStub({ input, root, id, options })
    } else {
      original = found.records[found.index]
    }

    const record = applySets(input.helpers, original, options.set)
    const problems = validate(input, record)
    if (problems.length > 0) {
      throw new ExceptError(
        `the record would not be valid, so nothing was written:\n  ${problems.join("\n  ")}`,
      )
    }

    const registryPath = path.join(directory, `${found.name}.json`)
    // A registry that failed to parse would read as empty and be rewritten without its records.
    if (found.unreadable.includes(found.name) || found.unreadable.includes(directory)) {
      throw new ExceptError(
        `${display(root, registryPath)} cannot be read, so nothing was written to it. Run 'repo-contract exceptions' to see why, then fix it and run this command again.`,
      )
    }
    const state =
      found.index === -1 ? "created" : sameRecord(original, record) ? "unchanged" : "updated"
    if (state !== "unchanged") {
      // The registry is read raw. Writing back an entry that is not a record would fail midway.
      const malformed = found.records.findIndex((entry) => typeof entry?.id !== "string")
      if (malformed !== -1) {
        throw new ExceptError(
          `${display(root, registryPath)} has an entry at exceptions[${String(malformed)}] that is not a record with a string id, so nothing was written to it. Fix or remove that entry, then run this command again.`,
        )
      }
      const records =
        found.index === -1
          ? [...found.records, record]
          : found.records.map((entry, index) => (index === found.index ? record : entry))
      await input.mkdir(directory)
      const written = await input.helpers.writeExceptionRegistry({ path: registryPath, records })
      if (!written.ok)
        throw new ExceptError(`could not write ${display(root, registryPath)}: ${written.error}`)
    }

    const missing = missingFields(input.helpers, record)
    const registry = display(root, registryPath)
    if (options.json) {
      const result = {
        schemaVersion: 1,
        id,
        registry,
        state,
        complete: missing.length === 0,
        missing,
        record,
      }
      input.stdout(`${JSON.stringify(result, null, 2)}\n`)
    } else {
      const lines = [`${id}: ${state} in ${registry}.`]
      if (missing.length === 0) {
        lines.push(
          `Complete. The check that owns ${registry} still judges the record on its next run.`,
        )
      } else {
        lines.push(
          `Still blank: ${missing.join(", ")}.`,
          "Fill each one in with --set, for example:",
          `  repo-contract except '${id}' --set ${missing[0]}='<text>'`,
        )
      }
      input.stdout(`${lines.join("\n")}\n`)
    }
    return missing.length === 0 ? 0 : 1
  } catch (error) {
    const message = error instanceof ExceptError ? error.message : `failed: ${messageOf(error)}`
    if (options.json) {
      input.stdout(
        `${JSON.stringify({ schemaVersion: 1, id, state: "error", message }, null, 2)}\n`,
      )
    } else {
      input.stderr(`repo-contract except: ${message}\n`)
    }
    return 1
  }
}

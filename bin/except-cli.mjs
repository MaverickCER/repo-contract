// `repo-contract except <id>`: fill in one exception record and say what it still lacks. It finds
// the record by id across the registry directory. For a `mutation:` id with no record yet, it
// builds one from the mutation report. It writes only the registry it changed. Exit 0 when the
// record is complete, 1 when it is still incomplete or cannot be found, 2 for a usage error.

export const EXCEPT_USAGE = `Usage: repo-contract except <id> [options]`

/**
 * Parses the arguments after `except`.
 * @param {readonly string[]} argv - The arguments.
 * @returns {object} `help`, `version`, a usage `error`, or the options to run with.
 */
export function parseExceptArgs(argv) {
  void argv
  throw new Error("not implemented: R4")
}

/**
 * Runs `repo-contract except`.
 * @param {Record<string, unknown>} input - argv, cwd, version, stdout, stderr, the helpers and affected engines, readFile and writeFile.
 * @returns {Promise<number>} The exit status.
 */
export async function runExcept(input) {
  void input
  throw new Error("not implemented: R4")
}

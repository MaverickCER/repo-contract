// `repo-contract exceptions`: count every exception record, by registry and type, with the legacy,
// expired and incomplete ones. It decides nothing: the check that owns a registry fails on it.
// Exit 0 after printing, 2 for a usage error.

export const EXCEPTIONS_USAGE = `Usage: repo-contract exceptions [options]`

/**
 * Parses the arguments after `exceptions`.
 * @param {readonly string[]} argv - The arguments.
 * @returns {object} `help`, `version`, a usage `error`, or the options to run with.
 */
export function parseExceptionsArgs(argv) {
  void argv
  throw new Error("not implemented: R4")
}

/**
 * Runs `repo-contract exceptions`.
 * @param {Record<string, unknown>} input - argv, cwd, version, stdout, stderr, the helpers engine and the clock.
 * @returns {Promise<number>} The exit status.
 */
export async function runExceptions(input) {
  void input
  throw new Error("not implemented: R4")
}

// `repo-contract explain`: print what the project's config runs, and every setting looser than its
// tier. It loads the config through tsx, which the generated runner already needs. Data goes to
// stdout and diagnostics to stderr. Exit 0 when the config loaded, 1 when it could not, 2 for a
// usage error.

export const EXPLAIN_USAGE = `Usage: repo-contract explain [options]`

/**
 * Parses the arguments after `explain`.
 * @param {readonly string[]} argv - The arguments.
 * @returns {object} `help`, `version`, a usage `error`, or the options to run with.
 */
export function parseExplainArgs(argv) {
  void argv
  throw new Error("not implemented: R4")
}

/**
 * Runs `repo-contract explain`.
 * @param {Record<string, unknown>} input - argv, cwd, version, stdout, stderr, the tiers engine and the config loader.
 * @returns {Promise<number>} The exit status.
 */
export async function runExplain(input) {
  void input
  throw new Error("not implemented: R4")
}

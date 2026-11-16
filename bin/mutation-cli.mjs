// `repo-contract mutation plan|run`: plan a sharded mutation run, or run Stryker and print the
// report the `mutation` preset judges. Starting processes is injected, because only
// bin/repo-contract.mjs may reach a process spawner. Exit status: `plan` 0 or 1; `run` is
// Stryker's exit code, 1 when the run could not start, 2 for a usage error.

export const MUTATION_USAGE = `Usage: repo-contract mutation <plan|run> [options]`

/**
 * Parses the arguments after `mutation`.
 * @param {readonly string[]} argv - The arguments.
 * @returns {object} `help`, `version`, a usage `error`, or the subcommand and its options.
 */
export function parseMutationArgs(argv) {
  void argv
  throw new Error("not implemented: R7a")
}

/**
 * Runs `repo-contract mutation`.
 * @param {Record<string, unknown>} input - argv, cwd, version, stdout, stderr, the engines, and the process and file capabilities.
 * @returns {Promise<number>} The exit status.
 */
export async function runMutation(input) {
  void input
  throw new Error("not implemented: R7a")
}

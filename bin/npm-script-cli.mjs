// `repo-contract npm-script <script>`: run one of the package's npm scripts and print what the
// `npmScript` preset judges. With `--must-not-change`, it hashes those paths before and after.
// Starting npm is injected, because only bin/repo-contract.mjs may reach a process spawner.
// Exit 0 after printing a report, 1 when the run could not start, 2 for a usage error.

export const NPM_SCRIPT_USAGE = `Usage: repo-contract npm-script <script> [options]`

/**
 * Parses the arguments after `npm-script`.
 * @param {readonly string[]} argv - The arguments.
 * @returns {object} `help`, `version`, a usage `error`, or the options to run with.
 */
export function parseNpmScriptArgs(argv) {
  void argv
  throw new Error("not implemented: R7b")
}

/**
 * Runs `repo-contract npm-script`.
 * @param {Record<string, unknown>} input - argv, cwd, version, stdout, stderr, exec and readFile.
 * @returns {Promise<number>} The exit status.
 */
export async function runNpmScript(input) {
  void input
  throw new Error("not implemented: R7b")
}

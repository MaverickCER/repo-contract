const TRUTHY = new Set(["1", "true", "yes", "on"])

const isTruthy = (value: string | undefined): boolean =>
  value !== undefined && TRUTHY.has(value.toLowerCase())

/**
 * Pulls `--fail-fast` / `--no-fail-fast` out of a runner's arguments. The last one wins; anything
 * after a `--` terminator is left untouched.
 * @param argv - The runner's arguments.
 * @returns The flag if one was given, and the arguments without it.
 */
export function parseFailFastArgs(argv: readonly string[]): {
  readonly failFast?: boolean
  readonly rest: readonly string[]
} {
  const terminator = argv.indexOf("--")
  const head = terminator === -1 ? argv : argv.slice(0, terminator)
  const tail = terminator === -1 ? [] : argv.slice(terminator)
  const flags = head.filter((arg) => arg === "--fail-fast" || arg === "--no-fail-fast")
  const last = flags.at(-1)
  const rest = [...head.filter((arg) => arg !== "--fail-fast" && arg !== "--no-fail-fast"), ...tail]
  return last === undefined ? { rest } : { failFast: last === "--fail-fast", rest }
}

/**
 * Decides whether a run stops spending time on expensive checks once a cheap one has failed. Off
 * unless asked for, in CI as much as locally, so a run reports every problem by default; and never
 * on for a release, which always runs everything.
 * @param input - The explicit flag and the environment.
 * @param input.flag - `--fail-fast` (true) or `--no-fail-fast` (false), if given.
 * @param input.env - The environment variables to read; this function reads no ambient state.
 * @returns Whether to pass `failFast: true` to the run.
 */
export function resolveFailFast(input: {
  readonly flag?: boolean
  readonly env: Readonly<Record<string, string | undefined>>
}): boolean {
  const { env } = input
  const release =
    isTruthy(env.CI_FULL) ||
    env.GITHUB_EVENT_NAME === "release" ||
    env.GITHUB_REF?.startsWith("refs/tags/") === true
  if (release) return false
  return input.flag ?? isTruthy(env.REPO_CONTRACT_FAIL_FAST)
}

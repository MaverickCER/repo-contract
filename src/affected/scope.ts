/** How much of the repository a run validates. */
export type RunScope = "affected" | "full"

/** What a caller may ask for; `"auto"` leaves the choice to the environment. */
export type RequestedScope = RunScope | "auto"

/** Where a scope decision came from. */
export type ScopeSource = "flag" | "env" | "ci-full" | "release" | "ci-event" | "default"

/** The scope a run uses and the reason, for the run's own output. */
export interface ScopeDecision {
  readonly scope: RunScope
  readonly source: ScopeSource
  readonly reason: string
}

/** The scope-related arguments of a command line, and whatever else was given. */
export type ParsedScopeArgs =
  | {
      readonly ok: true
      readonly scope?: RequestedScope
      readonly base?: string
      readonly rest: readonly string[]
    }
  | { readonly ok: false; readonly error: string }

const SCOPES: readonly string[] = ["auto", "affected", "full"]
const CHOICES = "auto, affected, full"
const PULL_REQUEST_EVENTS = ["pull_request", "pull_request_target", "merge_group"]
const TRUTHY = ["1", "true", "yes"]

const isScope = (value: string): value is RequestedScope => SCOPES.includes(value)

/**
 * Reads `--scope` and `--base` out of a command line, in both `--flag value` and `--flag=value` forms.
 * @param argv - The arguments, without the executable and script.
 * @returns The requested scope and base, and every other argument in order; or the reason they are unusable.
 */
export function parseScopeArgs(argv: readonly string[]): ParsedScopeArgs {
  const rest: string[] = []
  let scope: RequestedScope | undefined
  let base: string | undefined
  const queue = [...argv]
  for (let arg = queue.shift(); arg !== undefined; arg = queue.shift()) {
    if (arg === "--") {
      rest.push(arg, ...queue)
      break
    }
    const name = arg === "--scope" || arg.startsWith("--scope=") ? "scope" : flagName(arg, "base")
    if (name === undefined) {
      rest.push(arg)
      continue
    }
    const inline = arg.includes("=")
    const value = inline ? arg.slice(arg.indexOf("=") + 1) : queue.shift()
    if (value === undefined || value === "" || (!inline && value.startsWith("--"))) {
      return {
        ok: false,
        error:
          name === "scope"
            ? "--scope needs a value: auto, affected or full."
            : "--base needs a git ref.",
      }
    }
    if ((name === "scope" && scope !== undefined) || (name === "base" && base !== undefined)) {
      return { ok: false, error: `--${name} was given more than once.` }
    }
    if (name === "base") {
      base = value
    } else if (isScope(value)) {
      scope = value
    } else {
      return { ok: false, error: `The scope must be one of ${CHOICES}, not "${value}".` }
    }
  }
  return {
    ok: true,
    ...(scope === undefined ? {} : { scope }),
    ...(base === undefined ? {} : { base }),
    rest,
  }
}

/**
 * @param arg - One command-line argument.
 * @param name - A flag name without its dashes.
 * @returns The name if the argument is that flag in either form, else `undefined`.
 */
function flagName(arg: string, name: string): string | undefined {
  return arg === `--${name}` || arg.startsWith(`--${name}=`) ? name : undefined
}

/** What `resolveScope` decides from. */
export interface ResolveScopeInput {
  /** What the caller asked for; `"auto"` or absent leaves it to the environment. */
  readonly requested?: RequestedScope
  /** The environment, passed in rather than read (`process.env` works as is). */
  readonly env: Readonly<Record<string, string | undefined>>
}

/**
 * Decides whether a run validates the affected part of the tree or all of it. A release is always
 * full, and `CI_FULL` forces full over anything else; otherwise an explicit request wins, then
 * `REPO_CONTRACT_SCOPE`, then the CI event (a pull request compares with its base, every other
 * event, and a CI system with no pull request, validates everything), and a local run compares
 * with its base branch.
 * @param input - The request and the environment, as data.
 * @returns The scope and why.
 * @throws {Error} If `REPO_CONTRACT_SCOPE` is not one of the three choices.
 */
export function resolveScope(input: ResolveScopeInput): ScopeDecision {
  const { env } = input
  const forced = env.CI_FULL
  if (forced !== undefined && TRUTHY.includes(forced.toLowerCase())) {
    return { scope: "full", source: "ci-full", reason: `CI_FULL=${forced}` }
  }
  if (env.GITHUB_EVENT_NAME === "release" || env.GITHUB_REF?.startsWith("refs/tags/")) {
    return { scope: "full", source: "release", reason: "a release always validates the whole tree" }
  }
  if (input.requested !== undefined && input.requested !== "auto") {
    return { scope: input.requested, source: "flag", reason: `--scope ${input.requested}` }
  }
  const fromEnv = env.REPO_CONTRACT_SCOPE
  if (fromEnv !== undefined && fromEnv !== "" && fromEnv !== "auto") {
    if (!isScope(fromEnv)) {
      throw new Error(`REPO_CONTRACT_SCOPE must be one of ${CHOICES}, not "${fromEnv}".`)
    }
    return { scope: fromEnv as RunScope, source: "env", reason: `REPO_CONTRACT_SCOPE=${fromEnv}` }
  }
  return fromEnvironment(env)
}

/**
 * @param env - The environment, as data.
 * @returns The scope the CI context implies.
 */
function fromEnvironment(env: Readonly<Record<string, string | undefined>>): ScopeDecision {
  const event = env.GITHUB_EVENT_NAME
  if (event !== undefined && event !== "") {
    return PULL_REQUEST_EVENTS.includes(event)
      ? {
          scope: "affected",
          source: "ci-event",
          reason: `the ${event} event compares with its base`,
        }
      : {
          scope: "full",
          source: "ci-event",
          reason: `the ${event} event validates the whole tree`,
        }
  }
  const ci = env.CI
  if (ci !== undefined && TRUTHY.includes(ci.toLowerCase())) {
    return {
      scope: "full",
      source: "ci-event",
      reason: "CI is set but no pull request is known, so the whole tree is validated",
    }
  }
  return {
    scope: "affected",
    source: "default",
    reason: "a local run compares with the base branch",
  }
}

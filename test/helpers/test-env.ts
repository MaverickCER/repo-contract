/**
 * The default `env` for tests that don't exercise `env`/`inheritEnv` behavior: `process.env`
 * itself, by reference (never copied), as a consumer would pass it.
 * See specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md.
 */
export const testEnv: NodeJS.ProcessEnv = process.env

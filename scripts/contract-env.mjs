// The environment every check of this repository's own contract runs with. Checks spawn real
// tools (npm scripts, tsc, eslint, git, gh, stryker). Those need PATH, HOME and the rest of the
// shell's furniture. Nothing they run needs the secrets or the clutter of the process that
// started them. Every check therefore gets `inheritEnv: false` and this allowlist, picked from
// `process.env`. A variable not named here, and not under a prefix named here, is not visible to
// a check. SECURITY.md's "environment scoping" section is the promise; this file is the mechanism.

/** Exact names a check may see. */
const NAMES = new Set([
  // The shell
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TERM",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "TMPDIR",
  "TEMP",
  "TMP",
  // Windows runners and developers
  "SystemRoot",
  "SYSTEMROOT",
  "windir",
  "APPDATA",
  "LOCALAPPDATA",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "ProgramFiles",
  "ProgramData",
  "PATHEXT",
  "COMSPEC",
  "ComSpec",
  // Node and its tooling
  "NODE_OPTIONS",
  "NODE_ENV",
  "NODE_EXTRA_CA_CERTS",
  "FORCE_COLOR",
  "NO_COLOR",
  // CI, and the two tokens checks are written to use
  "CI",
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "SOCKET_SECURITY_API_KEY",
])

/** Prefixes a check may see (CI metadata, npm's own settings, test-runner knobs). */
const PREFIXES = ["GITHUB_", "RUNNER_", "npm_", "NVM_", "VITEST_", "STRYKER_"]

/**
 * @param {NodeJS.ProcessEnv} env - normally `process.env`.
 * @returns {Record<string, string>} the subset a check receives.
 */
export function scopedEnv(env) {
  const out = {}
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue
    if (NAMES.has(name) || PREFIXES.some((prefix) => name.startsWith(prefix))) out[name] = value
  }
  return out
}

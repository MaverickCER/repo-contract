/**
 * Per-command review guidance for the `preset-commands` check -- migrated from
 * `scripts/security-network/network-surface.mjs`'s former `PRESET_COMMAND_REVIEW`. This is **not**
 * an allowlist and nothing is gated on membership: every `run:` command a published preset
 * (`src/presets/*.ts`) spawns needs its own record in
 * `.repo-contract/exceptions/preset-commands.json` regardless of whether it appears here. This
 * table only supplies, when the check scaffolds a fresh stub, a concrete question the reviewer
 * writing that record's `justification` should answer, plus a link to where the answer lives.
 *
 * The question is never "is this tool safe" in the abstract (unanswerable -- repo-contract never
 * bundles these tools, a consumer installs and trusts each one separately, and nothing here can
 * see what is actually on PATH when a preset runs), but a specific thing that command's own
 * documentation answers. See specs/decisions/0007-no-network-surface.md's Decision section.
 */
interface PresetCommandGuidance {
  readonly command: string
  readonly docs: string
  readonly reviewFor: string
}

const PRESET_COMMAND_GUIDANCE: readonly PresetCommandGuidance[] = [
  {
    command: "attw",
    docs: "https://arethetypeswrong.github.io/",
    reviewFor:
      "What network requests this command makes and under what conditions, and whether `--pack` (or any other flag) executes a script from the package under analysis rather than only inspecting it.",
  },
  {
    command: "commitlint",
    docs: "https://commitlint.js.org/",
    reviewFor:
      "Whether commitlint's config resolution (`extends`, shareable configs) can load a config from a remote source, and what a loaded parser/plugin is able to execute.",
  },
  {
    command: "linkinator",
    docs: "https://github.com/JustinBeckwith/linkinator#readme",
    reviewFor:
      "Exactly what `--recurse` causes this command to request, and whether any flag causes it to send data anywhere rather than only request URLs.",
  },
  {
    command: "knip",
    docs: "https://knip.dev/",
    reviewFor:
      "Whether a knip plugin or reporter can load and execute code from outside this repository, and what `--reporter-options` can route a reporter to do with its data.",
  },
  {
    command: "jscpd",
    docs: "https://jscpd.dev/",
    reviewFor:
      "What each available reporter does with its output, and whether any reporter sends data anywhere other than the local `--output` path.",
  },
  {
    command: "prettier",
    docs: "https://prettier.io/docs/",
    reviewFor:
      "Whether prettier's plugin resolution can load a plugin from a network source, and what a loaded plugin is able to execute.",
  },
  {
    command: "playwright",
    docs: "https://playwright.dev/docs/test-cli",
    reviewFor:
      "From the actual test suite this command runs (not the tool's documentation alone), which URLs/origins it navigates to, and whether any of them is a live remote origin rather than a local server/fixture.",
  },
  {
    command: "publint",
    docs: "https://publint.dev/",
    reviewFor:
      "Whether any option queries the npm registry or another remote source beyond the local packed contents.",
  },
  {
    command: "markdownlint-cli2",
    docs: "https://github.com/DavidAnson/markdownlint-cli2#readme",
    reviewFor:
      "Whether a custom rule this repository's config loads can execute code with capabilities beyond linting Markdown text, and where such a rule could be loaded from.",
  },
  {
    command: "licensee",
    docs: "https://github.com/jslicense/licensee.js#readme",
    reviewFor:
      "Whether any option queries a remote license database, versus resolving license text only from each package's own local metadata.",
  },
  {
    command: "vitest",
    docs: "https://vitest.dev/",
    reviewFor:
      "From the actual test files this command runs (not the tool's documentation alone), whether any of them performs a real network call rather than only exercising code in-process.",
  },
  {
    command: "eslint",
    docs: "https://eslint.org/docs/latest/",
    reviewFor:
      "Whether ESLint's config/plugin resolution (`extends`, shareable configs, plugins) can load from a remote source, and what a loaded plugin is able to execute.",
  },
  {
    command: "stylelint",
    docs: "https://stylelint.io/",
    reviewFor:
      "Whether stylelint's plugin/config resolution can load from a remote source, and what a loaded plugin is able to execute.",
  },
  {
    command: "npm",
    docs: "https://docs.npmjs.com/cli/commands/npm-audit",
    reviewFor:
      "Exactly what `npm audit` sends to and receives from the registry, and that the exact subcommand/flags used here are the documented ones, not a different npm subcommand with different effects (e.g. `publish`, `install`).",
  },
  {
    command: "secretlint",
    docs: "https://github.com/secretlint/secretlint#readme",
    reviewFor:
      "Whether any rule reports a finding (or a matched secret's value) to a destination other than the local `--output` file, and separately verify against src/presets/security-secrets.ts's own policy code that a matched secret's value is excluded from this package's own output.",
  },
  {
    command: "tsc",
    docs: "https://www.typescriptlang.org/docs/",
    reviewFor:
      "What a custom transformer configured in tsconfig.json is able to do during a compile, and whether this repository's own tsconfig.json configures one.",
  },
]

const BY_COMMAND: ReadonlyMap<string, PresetCommandGuidance> = new Map(
  PRESET_COMMAND_GUIDANCE.map((entry) => [entry.command, entry]),
)

/**
 * The scaffold-guidance line for one preset command -- the concrete question its `justification`
 * should answer, and where to find the answer. A command with no table entry gets a generic
 * prompt (still a real, blocking stub -- the table is guidance, never a gate).
 * @param command - The preset command name.
 * @returns A one-line reviewer prompt.
 */
export function guidanceFor(command: string): string {
  const entry = BY_COMMAND.get(command)
  if (entry === undefined) {
    return `Reviewing a spawn of "${command}": document what network or code-execution capability this command has under the exact flags the preset passes it, and why repo-contract spawning it on a consumer's behalf is acceptable.`
  }
  return `Reviewing a spawn of "${command}": ${entry.reviewFor} Docs: ${entry.docs}`
}

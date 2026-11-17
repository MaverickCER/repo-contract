/** What a command prints when its `-C` directory fails the check: one stream, or a JSON document. */
export type MissingDirectoryOutput =
  | { readonly stderr: string }
  | { readonly stdout: string }
  | { readonly json: Record<string, unknown> }

/** One `-C` case: a name whose first word is the command, the arguments before `-C`, the output. */
export type MissingDirectoryCase = [string, string[], MissingDirectoryOutput]

/**
 * Every command that takes `-C`, in text and `--json` mode, with what it prints when `-C` names no
 * usable directory. Each command keeps its own failure path: a JSON error document where its
 * `--json` mode has one, otherwise one stderr line. The real-bin and in-process tests share it.
 * @param message - What `checkDirectory` says about the path: missing, not a directory, or
 *   unreadable.
 * @returns The cases.
 */
export function missingDirectoryCases(message: string): MissingDirectoryCase[] {
  const line = (command: string) => ({ stderr: `repo-contract ${command}: ${message}\n` })
  return [
    ["affected", ["affected"], line("affected")],
    ["affected --json", ["affected", "--json"], line("affected")],
    ["cache stats", ["cache", "stats"], line("cache")],
    ["cache stats --json", ["cache", "stats", "--json"], line("cache")],
    ["doctor", ["doctor"], { stderr: `repo-contract doctor: failed: ${message}\n` }],
    ["doctor --json", ["doctor", "--json"], { json: { schemaVersion: 1, error: message } }],
    ["except", ["except", "mutation:x"], line("except")],
    [
      "except --json",
      ["except", "mutation:x", "--json"],
      { json: { schemaVersion: 1, id: "mutation:x", state: "error", message } },
    ],
    ["exceptions", ["exceptions"], line("exceptions")],
    ["exceptions --json", ["exceptions", "--json"], line("exceptions")],
    ["explain", ["explain"], line("explain")],
    ["explain --json", ["explain", "--json"], line("explain")],
    ["merge-mutation", ["merge-mutation", "--total", "1", "1=a.json"], line("merge-mutation")],
    ["metrics", ["metrics"], line("metrics")],
    ["metrics --json", ["metrics", "--json"], line("metrics")],
    ["mutation plan", ["mutation", "plan"], line("mutation")],
    ["mutation plan --json", ["mutation", "plan", "--json"], line("mutation")],
    ["mutation run", ["mutation", "run"], { stdout: `${message}\n` }],
    [
      "mutation run --json",
      ["mutation", "run", "--json"],
      {
        json: {
          schemaVersion: 1,
          state: "error",
          report: "",
          exitCode: null,
          shard: null,
          mutate: null,
          timeouts: { rerun: 0, caught: 0 },
          inputs: null,
          message,
        },
      },
    ],
    ["npm-script", ["npm-script", "test"], line("npm-script")],
    ["npm-script --json", ["npm-script", "test", "--json"], line("npm-script")],
    ["quick-start", ["quick-start"], { stdout: `${message}\n` }],
    [
      "quick-start --json",
      ["quick-start", "--json"],
      { json: { schemaVersion: 1, readme: "README.md", state: "error", message } },
    ],
  ]
}

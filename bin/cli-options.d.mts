export type ParsedCommandOptions =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | { kind: "run"; options: Record<string, string | string[] | true>; positionals: string[] }
export function parseCommandOptions(
  argv: readonly string[],
  spec: {
    values: Readonly<Record<string, string>>
    repeated?: Readonly<Record<string, string>>
    flags?: Readonly<Record<string, string>>
    positionals?: number
  },
): ParsedCommandOptions
export function messageOf(error: unknown): string
export function commandDirectory(cwd: string, option: string | undefined): string
export function checkDirectory(dir: string): string | undefined

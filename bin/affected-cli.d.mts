export const AFFECTED_USAGE: string
export type ParsedAffectedArgs =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | {
      kind: "run"
      options: {
        format: "text" | "json" | "tests" | "sources" | "mutate"
        explain: boolean
        base?: string
        cwd?: string
        tsconfig?: string
      }
    }
export function parseAffectedArgs(argv: readonly string[]): ParsedAffectedArgs
export function runAffected(input: Record<string, unknown>): Promise<number>

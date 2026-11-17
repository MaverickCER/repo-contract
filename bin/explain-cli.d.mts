export const EXPLAIN_USAGE: string
export type ParsedExplainArgs =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | {
      kind: "run"
      options: { config?: string; format: "text" | "markdown" | "json"; cwd?: string }
    }
export function parseExplainArgs(argv: readonly string[]): ParsedExplainArgs
export function runExplain(input: Record<string, unknown>): Promise<number>

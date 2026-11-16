export const EXCEPT_USAGE: string
export type ParsedExceptArgs =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | {
      kind: "run"
      options: {
        id: string
        set: { field: string; value: string }[]
        dir: string
        report: string
        json: boolean
        cwd?: string
      }
    }
export function parseExceptArgs(argv: readonly string[]): ParsedExceptArgs
export function runExcept(input: Record<string, unknown>): Promise<number>

export const METRICS_USAGE: string
export type ParsedMetricsArgs =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | {
      kind: "run"
      options: {
        json: boolean
        cwd?: string
        log?: string
        actor?: "human" | "agent"
        since?: { days: number } | { hours: number } | { at: string }
      }
    }
export function parseMetricsArgs(argv: readonly string[]): ParsedMetricsArgs
export function runMetrics(input: Record<string, unknown>): Promise<number>

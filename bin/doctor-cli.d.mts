export const DOCTOR_USAGE: string
export type ParsedDoctorArgs =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | { kind: "run"; options: { fix: boolean; json: boolean; cwd?: string } }
export function parseDoctorArgs(argv: readonly string[]): ParsedDoctorArgs
export function runDoctor(input: Record<string, unknown>): Promise<number>

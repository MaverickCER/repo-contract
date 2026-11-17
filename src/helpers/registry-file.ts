/**
 * JSON error text that never quotes the file. A registry may be a link to a file outside the
 * directory, and V8's JSON errors quote the bytes around the fault. So a reason built from one
 * could echo that file.
 */

/**
 * Where a JSON parse failed, from the error's message, and nothing else from it.
 * @param error - what `JSON.parse` threw.
 * @returns ` (line L, column C)`, ` (at position N)` on older engines, or `""` when the message
 *   names neither.
 */
export function jsonErrorLocation(error: unknown): string {
  if (!(error instanceof Error)) return ""
  const line = /\(line (\d+) column (\d+)\)/.exec(error.message)
  if (line !== null) return ` (line ${line[1]}, column ${line[2]})`
  const position = /at position (\d+)/.exec(error.message)
  return position === null ? "" : ` (at position ${position[1]})`
}

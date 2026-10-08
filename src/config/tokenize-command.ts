import { InvalidCheckConfigError } from "../errors.js"

/**
 * Consumes a `\`-escape sequence starting at `run[i]`, if one applies here. A backslash escapes the
 * next character (and is itself dropped) when unquoted or inside a double-quoted span; inside
 * single quotes it is a literal character, exactly as in every POSIX shell -- so a Windows path in
 * single quotes survives intact. A trailing backslash with nothing left to escape is not an escape
 * and is kept literally by the caller.
 * @param run - the full command string being tokenized.
 * @param i - the index of the candidate backslash.
 * @param quote - the current quote context (`"'"`, `'"'`, or `null` for unquoted).
 * @returns the escaped character and the index just past the two-character sequence, or `undefined` when no escape applies at `i`.
 */
function consumeEscape(
  run: string,
  i: number,
  quote: "'" | '"' | null,
): { readonly value: string; readonly next: number } | undefined {
  if (run[i] !== "\\" || quote === "'") return undefined
  // No explicit `i + 1 < run.length` pre-check: a trailing backslash at
  // end-of-string reads `run[i + 1]` as `undefined` (which `noUncheckedIndexedAccess`
  // already types), and the `escaped === undefined` guard below returns
  // `undefined` for exactly that case -- so the caller keeps the backslash
  // literal. One guard, one behavior, nothing to mutation-suppress.
  const escaped: string | undefined = run[i + 1]
  if (escaped === undefined) return undefined
  return { value: escaped, next: i + 2 }
}

// Single-character shell/multi-command operators rejected outright when they
// appear unquoted. A literal newline (`\n`/`\r`) and the two-character `$(`
// are handled separately in `rejectUnquotedOperator` -- every entry here is
// exactly one character, matched by a single Set lookup rather than a chain
// of per-character `if`s.
const UNQUOTED_SHELL_OPERATORS: ReadonlySet<string> = new Set([";", "&", "|", "`", "<", ">"])

/**
 * Throws `InvalidCheckConfigError` when the unquoted character `char` at `run[i]` is a
 * shell/multi-command operator repo-contract never interprets (`;`, `&`, `|`, a backtick, `<`, `>`,
 * `$(`, or a literal newline). Returns normally when `char` is legitimate literal argv content --
 * glob characters and a bare `$` deliberately included (see `tokenizeRunString`'s doc comment).
 * @param char - the character under the cursor, already known defined by the caller.
 * @param run - the full command string, needed only to look one character ahead for `$(`.
 * @param i - the index of `char` within `run`.
 * @param checkId - identifies which check's `run` was invalid, used in the thrown error message.
 */
function rejectUnquotedOperator(char: string, run: string, i: number, checkId: string): void {
  const reject = (operator: string): never => {
    throw new InvalidCheckConfigError(
      checkId,
      `run string contains an unquoted "${operator}" -- repo-contract never invokes a shell for ` +
        `string-form "run", so shell operators are not interpreted. Use "run: [...]" (array ` +
        `form) to pass "${operator}" as a literal argument, or set "shell: true" to opt into ` +
        `real shell execution.`,
    )
  }

  if (char === "\n" || char === "\r") reject("newline")
  if (UNQUOTED_SHELL_OPERATORS.has(char)) reject(char)
  if (char === "$" && run[i + 1] === "(") reject("$(")
}

/**
 * Splits a `run` string into argv (executable + arguments) without invoking
 * a shell -- no shell operator is ever executed, no glob is ever expanded by
 * this package, no environment variable is ever substituted. The result is
 * deterministic: the same input string always produces the same argv array.
 *
 * Quoting: `'...'` and `"..."` group whitespace into a single argument and
 * are themselves stripped from the resulting token. `\` escapes the next
 * character (and is itself stripped) when unquoted or inside a double-quoted
 * span; inside single quotes it is a literal character, exactly as in every
 * POSIX shell -- so a Windows path in single quotes survives intact.
 * Unquoted whitespace (space, tab) separates tokens.
 *
 * Rejected outright (throws `InvalidCheckConfigError`, checkId identifies
 * which check's `run` was invalid): any *unquoted* occurrence of a true
 * shell/multi-command operator -- `;`, `&`, `|`, a backtick, `$(`, `<`, `>`,
 * or a literal newline. A string containing one of these almost always
 * reflects a mistaken assumption that shell interpretation is happening;
 * the fix is either `run: [...]` (array form, bypasses tokenization
 * entirely) or explicit `shell: true`.
 *
 * Deliberately NOT rejected: glob characters (`*`, `?`, `~`, `[`, `]`, `{`,
 * `}`) and a bare `$`. These are common, legitimate literal argv content --
 * many CLI tools (eslint, prettier, tsc) accept and internally expand glob
 * patterns themselves, e.g. `eslint "src/**\/*.ts"` -- and since no shell is
 * ever invoked here, they carry zero shell-injection risk regardless of
 * where they appear in the string.
 * @param run - the command string to tokenize.
 * @param checkId - identifies which check's `run` was invalid, used in the thrown error message.
 * @returns the tokenized argv (executable followed by its arguments).
 */
export function tokenizeRunString(run: string, checkId: string): readonly string[] {
  const tokens: string[] = []
  let current = ""
  let hasCurrent = false
  let quote: "'" | '"' | null = null
  // Index of the first character the next pass handles: an escape sequence consumes more than one
  // character, and the passes it covers must not handle them again. The loop walks a finite list of
  // the string's own UTF-16 units (the unit `consumeEscape` indexes by), so it cannot run unbounded
  // however the body changes.
  let resume = 0

  for (const [i, char] of run.split("").entries()) {
    if (i < resume) continue
    if (quote !== null) {
      const escape = consumeEscape(run, i, quote)
      if (escape !== undefined) {
        current += escape.value
        resume = escape.next
        continue
      }
      if (char === quote) {
        quote = null
        continue
      }
      current += char
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      hasCurrent = true
      continue
    }

    // An unquoted backslash before a newline is a shell line-continuation.
    // repo-contract never interprets one -- and it must be rejected *here*,
    // before `consumeEscape` below, because `consumeEscape` would otherwise
    // treat `\<newline>` as an ordinary escape: splice a literal newline into
    // the token and advance the cursor past the newline, so the bare-newline
    // rejection further down never runs.
    const nextChar = run[i + 1]
    if (char === "\\" && (nextChar === "\n" || nextChar === "\r")) {
      throw new InvalidCheckConfigError(
        checkId,
        `run string contains an unquoted line continuation (a backslash before a newline) -- ` +
          `repo-contract never invokes a shell for string-form "run". Use "run: [...]" (array ` +
          `form), or set "shell: true" to opt into real shell execution.`,
      )
    }

    const escape = consumeEscape(run, i, null)
    if (escape !== undefined) {
      current += escape.value
      hasCurrent = true
      resume = escape.next
      continue
    }

    if (char === " " || char === "\t") {
      if (hasCurrent) {
        tokens.push(current)
        current = ""
        hasCurrent = false
      }
      continue
    }

    rejectUnquotedOperator(char, run, i, checkId)

    current += char
    hasCurrent = true
  }

  if (quote !== null) {
    throw new InvalidCheckConfigError(checkId, `run string has an unterminated ${quote} quote.`)
  }
  if (hasCurrent) tokens.push(current)

  if (tokens.length === 0) {
    throw new InvalidCheckConfigError(checkId, "run string is empty or contains only whitespace.")
  }

  return tokens
}

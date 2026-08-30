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
  let i = 0

  // Loosening the `i < run.length` bound to `i <= run.length` is
  // behaviorally invisible: the one extra iteration it would permit reads
  // `run[run.length]`, which is `undefined`, and is caught immediately below
  // by the (itself unmutatable, for the same `noUncheckedIndexedAccess`
  // reason) `char === undefined` check -- confirmed equivalent by exhaustive
  // differential testing against a wide corpus of inputs, not assumed.
  //
  // `iterations` is a second, independent forward-progress bound: every loop
  // pass that doesn't throw/break advances `i` by exactly 1 or 2, so no
  // correct execution ever needs more than `run.length` passes -- a
  // regression that makes `i` stand still or move backward (a `+=`
  // accidentally becoming `-=`), or that wipes the loop body entirely,
  // would otherwise hang forever instead of failing loudly. It is
  // deliberately tracked in the `for` statement's own update/condition
  // clauses rather than inside the loop body: those clauses sit outside the
  // body's own `{ ... }` block, so they keep running (and keep bounding the
  // loop) even under a mutation that replaces the entire body with `{}`,
  // which a bound placed inside the body could not survive.
  //
  // Every mutation of this line's own clauses (loosening either half of the
  // `&&`, swapping it for `||`, or reversing `iterations`' own direction) is
  // itself equivalent as long as the *body* still advances `i` correctly:
  // `i < run.length` alone already terminates the loop at the right point
  // for correct code, with the `iterations` bound only ever mattering in
  // combination with a genuine body regression -- confirmed empirically:
  // mutating this line in isolation (leaving the body untouched) produces no
  // observable difference. It exists precisely to convert the *body*
  // mutations described above from an unkillable hang into a fast, visible
  // test failure, not to be independently killable itself.
  // Stryker disable next-line ConditionalExpression,EqualityOperator,LogicalOperator,AssignmentOperator,BlockStatement -- loosening i < run.length to i <= run.length is behaviorally invisible since the unmutatable char === undefined check right after already catches it, and the iterations bound is a second, independent forward-progress bound tracked in this line's own clauses (outside the body's braces) specifically so a body-emptying mutation can't produce an unkillable hang; every mutation of this line's own clauses is equivalent as long as the body still advances i correctly, confirmed empirically.
  for (let iterations = 0; i < run.length && iterations <= run.length; iterations += 1) {
    const char = run[i]
    // Unreachable given the loop condition (`i < run.length` already
    // guarantees `run[i]` is defined) -- kept only because
    // `noUncheckedIndexedAccess` can't itself express that invariant.
    // Stryker disable next-line ConditionalExpression -- unreachable given the loop's own i < run.length guard already ensures run[i] is defined; kept only because noUncheckedIndexedAccess can't itself express that invariant.
    if (char === undefined) break

    if (quote !== null) {
      const escape = consumeEscape(run, i, quote)
      if (escape !== undefined) {
        current += escape.value
        i = escape.next
        continue
      }
      if (char === quote) {
        quote = null
        i += 1
        continue
      }
      current += char
      i += 1
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      hasCurrent = true
      i += 1
      continue
    }

    // An unquoted backslash before a newline is a shell line-continuation --
    // repo-contract never interprets one, and consuming the escape would splice
    // a literal newline into an argv token, exactly what an unquoted bare
    // newline is rejected for below.
    const nextChar = run[i + 1]
    if (char === "\\" && (nextChar === "\n" || nextChar === "\r")) {
      rejectUnquotedOperator(nextChar, run, i + 1, checkId)
    }

    const escape = consumeEscape(run, i, null)
    if (escape !== undefined) {
      current += escape.value
      hasCurrent = true
      i = escape.next
      continue
    }

    if (char === " " || char === "\t") {
      if (hasCurrent) {
        tokens.push(current)
        current = ""
        hasCurrent = false
      }
      i += 1
      continue
    }

    rejectUnquotedOperator(char, run, i, checkId)

    current += char
    hasCurrent = true
    i += 1
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

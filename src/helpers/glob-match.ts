/**
 * A small, dependency-free glob matcher -- the replacement for the `minimatch` runtime dependency
 * (see specs/decisions/0017-own-glob-matcher-replaces-minimatch.md). Pure string logic: it reads no
 * environment variable, touches no filesystem, imports nothing, and builds no `RegExp` from its
 * input -- a pattern is tokenized and matched by a position-set simulation that is polynomial in
 * the sizes of the pattern and the value, so no pattern can cause catastrophic backtracking.
 *
 * Supported syntax (exactly what exception-policy category keys use, e.g. `"security/*"`):
 * - `*`   any run of characters except `/`
 * - `**`  any run of characters including `/`; a whole `**` + `/` segment also matches zero segments
 * - `?`   exactly one character except `/`
 * - `[abc]`, `[a-z]`, `[!abc]` / `[^abc]`  a character class (a reversed range matches nothing)
 * - `{a,b}`  alternation (nestable)
 * - `\x`  the literal character `x`
 *
 * Not supported (treated as literal text, never as a special form): extglobs (`+(a|b)`), POSIX
 * classes (`[[:alpha:]]`), dotfile exclusion, case folding.
 */

type Token =
  | { readonly kind: "literal"; readonly char: string }
  | { readonly kind: "one" }
  | { readonly kind: "star" }
  | { readonly kind: "globstar" }
  | { readonly kind: "globstar-slash" }
  | { readonly kind: "class"; readonly negated: boolean; readonly members: string }

/** Upper bound on the alternatives one pattern's brace groups may expand to. */
const MAX_EXPANSIONS = 1024

/** One `x-y` range inside a class body (a lone or trailing `-` is a literal dash). */
const CLASS_RANGE = /[\s\S]-[\s\S]/g

const TOKEN = /\\(.)|\*\*\/|\*\*|\*|\?|\[([^\]]+)\]|[\s\S]/g

/**
 * Finds the first brace group (scanning closing braces left to right) whose body holds a comma and
 * no braces of its own -- the innermost expandable group. `{x}` (no comma) is never expandable.
 * @param pattern - the glob to search.
 * @returns the group's span and its comma-separated alternatives, or `undefined` when none is left.
 */
function findCommaGroup(
  pattern: string,
):
  | { readonly start: number; readonly end: number; readonly alternatives: readonly string[] }
  | undefined {
  const closers = Array.from(pattern, (_char, index) => index).filter(
    (index) => pattern.charAt(index) === "}",
  )
  for (const end of closers) {
    const start = pattern.lastIndexOf("{", end)
    const body = pattern.slice(start + 1, end)
    if (start !== -1 && body.includes(",") && !body.includes("{") && !body.includes("}")) {
      return { start, end, alternatives: body.split(",") }
    }
  }
  return undefined
}

/**
 * Expands every `{a,b}` alternation into the brace-free patterns it stands for.
 * @param pattern - the glob, possibly containing brace groups.
 * @returns every brace-free alternative.
 * @throws {Error} when the expansion would exceed {@link MAX_EXPANSIONS} patterns.
 */
function expandBraces(pattern: string): readonly string[] {
  const pending = [pattern]
  const done: string[] = []
  const finished = Array.from({ length: MAX_EXPANSIONS }).some(() => {
    const next = pending.pop()
    if (next === undefined) return true
    const group = findCommaGroup(next)
    if (group === undefined) {
      done.push(next)
    } else {
      const head = next.slice(0, group.start)
      const tail = next.slice(group.end + 1)
      pending.push(...group.alternatives.map((alternative) => `${head}${alternative}${tail}`))
    }
    return false
  })
  if (!finished) {
    throw new Error(
      `Glob pattern ${JSON.stringify(pattern)} expands to too many brace alternatives.`,
    )
  }
  return done
}

/**
 * Tokenizes one brace-free glob.
 * @param pattern - the brace-free glob.
 * @returns its tokens, in order.
 */
function tokenize(pattern: string): readonly Token[] {
  return [...pattern.matchAll(TOKEN)].map((match): Token => {
    const token = match[0]
    const escaped = match[1]
    const members = match[2]
    if (escaped !== undefined) return { kind: "literal", char: escaped }
    if (members !== undefined) {
      const negated = members.startsWith("!") || members.startsWith("^")
      return { kind: "class", negated, members: negated ? members.slice(1) : members }
    }
    switch (token) {
      case "**/":
        return { kind: "globstar-slash" }
      case "**":
        return { kind: "globstar" }
      case "*":
        return { kind: "star" }
      case "?":
        return { kind: "one" }
      default:
        return { kind: "literal", char: token }
    }
  })
}

/**
 * Whether `char` is in a class body such as `a-cx` (ranges and single characters).
 * @param char - the character under test.
 * @param members - the class body without brackets or negation marker.
 * @returns `true` when the class contains `char`.
 */
function classContains(char: string, members: string): boolean {
  const ranges = members.match(CLASS_RANGE) ?? []
  const singles = members.replace(CLASS_RANGE, "")
  return (
    ranges.some((range) => range.charAt(0) <= char && char <= range.charAt(2)) ||
    singles.includes(char)
  )
}

/**
 * Whether one token can consume exactly `value.slice(from, to)`.
 * @param piece - the token.
 * @param value - the value being matched.
 * @param from - where the token starts.
 * @param to - where the token would end.
 * @returns `true` when the token matches that span.
 */
function canGo(piece: Token, value: string, from: number, to: number): boolean {
  const char = value.charAt(from)
  switch (piece.kind) {
    case "literal":
      return to === from + 1 && char === piece.char
    case "one":
      return to === from + 1 && char !== "/"
    case "class":
      return to === from + 1 && char !== "/" && classContains(char, piece.members) !== piece.negated
    case "star":
      return to >= from && !value.slice(from, to).includes("/")
    case "globstar":
      return to >= from
    case "globstar-slash":
      return to >= from && (to === from || value.charAt(to - 1) === "/")
  }
}

/**
 * Advances the set of reachable value positions across one token.
 * @param piece - the token to consume.
 * @param value - the value being matched.
 * @param current - which positions are reachable before the token.
 * @param positions - `0..value.length`, precomputed once per match.
 * @returns which positions are reachable after the token.
 */
function step(
  piece: Token,
  value: string,
  current: readonly boolean[],
  positions: readonly number[],
): boolean[] {
  return positions.map((to) =>
    positions.some((from) => current[from] && canGo(piece, value, from, to)),
  )
}

/**
 * Whether `value` matches the glob `pattern` (see this module's own doc comment for the exact
 * syntax). Nothing is cached: compiling a category glob costs microseconds, and a cache would make a
 * pattern's code paths run only for the first caller.
 * @param value - the string to test (an exception category such as `"security/xss"`).
 * @param pattern - the glob to test it against.
 * @returns `true` when the whole of `value` matches `pattern`.
 * @throws {Error} when `pattern`'s brace groups expand to too many alternatives.
 */
export function globMatch(value: string, pattern: string): boolean {
  const alternatives = expandBraces(pattern).map(tokenize)
  const positions = Array.from({ length: value.length + 1 }, (_, index) => index)
  return alternatives.some((tokens) => {
    const start = positions.map((position) => position === 0)
    const end = tokens.reduce((current, token) => step(token, value, current, positions), start)
    return end[value.length] === true
  })
}

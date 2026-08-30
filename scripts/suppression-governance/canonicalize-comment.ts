type CommentKind = "single" | "multi"

/**
 * Strips a block comment's decorative syntax line-by-line: a leading `*` used purely for
 * left-alignment (and the whitespace around it) is removed from every line, and any line that
 * becomes empty once decoration is stripped (typically the line that held only the closing
 * delimiter) is dropped entirely -- it never carried semantic content of its own. The remaining
 * lines are joined with a single space, not `\n`, so that the one-line and multi-line block forms
 * of the *same* directive (e.g. `eslint-disable-next-line` naming its rules on one line vs. one
 * per continuation line) canonicalize to the identical string -- that equivalence is what stops
 * synchronization from treating a purely cosmetic reformat as a removed suppression plus a new
 * one, discarding its hand-authored justification.
 * @param body - The block comment's text with its outer delimiters already removed.
 * @returns The block comment's lines, decoration-stripped, joined by a single space.
 */
function stripBlockDecoration(body: string): string {
  return body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim()
      return trimmed.startsWith("*") ? trimmed.slice(1).trim() : trimmed
    })
    .filter((line) => line.length > 0)
    .join(" ")
}

/**
 * Reduces a raw comment token's full source text (delimiters included) to its canonical semantic
 * content: decorative comment syntax (the single-line prefix, the block comment's opening and
 * closing delimiters, left-aligning `*` characters, and the whitespace around all of those) is
 * removed; the directive text itself is never otherwise altered. A multiline block directive
 * collapses back to one line -- e.g. an `eslint-disable` block naming one rule per continuation
 * line canonicalizes to those rule tokens joined by a single space, with the delimiter-only
 * closing line dropped -- so it is byte-identical to the same directive written on one line.
 * Purely decorative reformatting (re-indenting, adding/removing alignment `*`s, wrapping the rule
 * list across lines) of an unchanged directive produces identical canonical output -- this is what
 * keeps synchronization from treating a reformat as a new suppression.
 * @param rawText - The comment token's exact source text, including its delimiters.
 * @param kind - Whether the token is a single-line or block comment.
 * @returns The decoration-stripped canonical content.
 */
export function canonicalizeComment(rawText: string, kind: CommentKind): string {
  if (kind === "single") {
    return rawText.replace(/^\/\//, "").trim()
  }

  // Every MultiLineCommentTrivia token the TypeScript scanner produces starts with a 2-character
  // opening delimiter; `endsWith` guards the closing one in case of an unterminated comment at
  // end-of-file (no closing delimiter present), rather than assuming it's always there.
  const OPEN_DELIMITER_LENGTH = 2
  const CLOSE_DELIMITER_LENGTH = 2
  const withoutOpen = rawText.slice(OPEN_DELIMITER_LENGTH)
  const body = withoutOpen.endsWith("*/")
    ? withoutOpen.slice(0, -CLOSE_DELIMITER_LENGTH)
    : withoutOpen
  return stripBlockDecoration(body)
}

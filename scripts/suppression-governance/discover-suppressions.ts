import { readFile } from "node:fs/promises"
import path from "node:path"
import * as ts from "typescript"
import { canonicalizeComment } from "./canonicalize-comment.js"
import { recognizeSuppression } from "./recognizers.js"

/** One suppression found in source, before registry reconciliation: no semantic id yet; check.ts's `toFindings` attaches it. */
export interface DiscoveredSuppression {
  readonly file: string
  readonly line: number
  readonly domain: string
  readonly rule: readonly string[]
  readonly content: string
  readonly reason: string
}

const JSX_EXTENSIONS: ReadonlySet<string> = new Set([".tsx", ".jsx"])

/**
 * Which scanner language variant to use, by file extension: JSX changes how the scanner
 * tokenizes some constructs, so `.tsx`/`.jsx` files need it even though comment tokenization
 * itself doesn't otherwise differ.
 * @param file - The file's path (only its extension is inspected).
 * @returns The scanner language variant to use for `file`.
 */
function languageVariantFor(file: string): ts.LanguageVariant {
  // Lowercased to match find-source-files.ts's own case-insensitive discovery. Its doc comment
  // gives "Legacy.TSX" as an example file it must match. Without this, a mixed-case .TSX/.JSX
  // file is scanned with the wrong (Standard, not JSX) variant.
  return JSX_EXTENSIONS.has(path.extname(file).toLowerCase())
    ? ts.LanguageVariant.JSX
    : ts.LanguageVariant.Standard
}

/**
 * Scans one file's full text for every comment token. It returns every one a recognizer
 * (recognizers.ts) classifies as a suppression directive. It uses the TypeScript compiler's own
 * scanner, not a hand-rolled comment parser and not ESLint itself. This check must be able to
 * audit suppressions that caused ESLint to be bypassed, so it can't depend on ESLint running
 * successfully (see specs/decisions/0006-suppression-governance.md).
 *
 * A bare `scanner.scan()` loop doesn't, by itself, know how to resume scanning a template literal
 * after a `${...}` substitution. That is normally the parser's job. The parser calls
 * `scanner.reScanTemplateToken()` once it has tracked enough brace nesting to know a given `}`
 * closes the substitution rather than some other construct. Skipping that (as this function
 * previously did) desyncs the scanner permanently at the first template literal containing a
 * substitution anywhere in the file. The `}` that should resume template scanning is instead
 * read as an ordinary `CloseBraceToken`. The substitution's own closing backtick is then misread
 * as the *opening* of a new, unterminated template literal. That literal swallows everything after
 * it, including every subsequent comment's text, until some later, unrelated backtick closes it.
 * `templateBraceDepths` records, for each currently-open template substitution, the brace depth
 * at which it began. That depth counts `{`/`}` pairs *within* the substitution's own expression.
 * The matching `}` can then be identified and correctly re-scanned.
 * @param relativePath - The file's repo-relative POSIX path, used as `DiscoveredSuppression.file` and to select the scanner's language variant.
 * @param text - The file's full source text.
 * @returns Every suppression directive found in `text`, in source order.
 */
export function discoverSuppressionsInFile(
  relativePath: string,
  text: string,
): DiscoveredSuppression[] {
  const sourceFile = ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, false)
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ false,
    languageVariantFor(relativePath),
    text,
  )

  const found: DiscoveredSuppression[] = []
  const templateBraceDepths: number[] = []
  let braceDepth = 0
  let kind = scanner.scan()

  while (kind !== ts.SyntaxKind.EndOfFileToken) {
    if (kind === ts.SyntaxKind.TemplateHead) {
      templateBraceDepths.push(braceDepth)
    } else if (kind === ts.SyntaxKind.OpenBraceToken) {
      braceDepth += 1
    } else if (kind === ts.SyntaxKind.CloseBraceToken) {
      const openSubstitutionDepth = templateBraceDepths.at(-1)
      if (openSubstitutionDepth === braceDepth) {
        kind = scanner.reScanTemplateToken(/* isTaggedTemplate */ false)
        if (kind === ts.SyntaxKind.TemplateTail) templateBraceDepths.pop()
        continue
      }
      braceDepth -= 1
    }

    const isComment =
      kind === ts.SyntaxKind.SingleLineCommentTrivia ||
      kind === ts.SyntaxKind.MultiLineCommentTrivia

    if (isComment) {
      const start = scanner.getTokenStart()
      const canonicalContent = canonicalizeComment(
        scanner.getTokenText(),
        kind === ts.SyntaxKind.SingleLineCommentTrivia ? "single" : "multi",
      )
      const recognized = recognizeSuppression(canonicalContent)

      if (recognized) {
        found.push({
          file: relativePath,
          line: ts.getLineAndCharacterOfPosition(sourceFile, start).line + 1,
          domain: recognized.domain,
          rule: recognized.rule,
          content: canonicalContent,
          reason: recognized.reason,
        })
      }
    }

    kind = scanner.scan()
  }

  return found
}

/**
 * Discovers every suppression directive across `files` (repo-relative POSIX paths, resolved
 * against `root`), in file order and then source order within each file.
 * @param root - Absolute repository root `files` are relative to.
 * @param files - Repo-relative POSIX file paths to scan (see listSourceFiles).
 * @returns Every suppression directive found, with no id or registry record attached yet: check.ts does that.
 */
export async function discoverSuppressions(
  root: string,
  files: readonly string[],
): Promise<DiscoveredSuppression[]> {
  // Each file's read is independent I/O with no dependency on any other file's. Promise.all
  // parallelizes them, and `.map` preserves file order in the resolved array whichever read
  // settles first. That keeps "in file order and then source order within each file" (see this
  // function's own doc comment) intact.
  const perFile = await Promise.all(
    files.map(async (relativePath) => {
      const text = await readFile(path.join(root, relativePath), "utf8")
      return discoverSuppressionsInFile(relativePath, text)
    }),
  )

  return perFile.flat()
}

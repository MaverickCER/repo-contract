// A `// Stryker disable ...` comment tells the mutation-testing check
// (checks/mutation.ts) to exempt the line(s) it guards from the
// repository's 100%-mutation-kill policy, with zero further verification --
// that policy is otherwise the strongest signal this repository has that a
// test actually asserts something (see specs/verification-taxonomy.md's
// "Mutation" section). An unexplained exemption from it is exactly the kind
// of thing that should be impossible to introduce silently. This rule
// requires a real explanatory comment adjacent to every disable directive,
// so every exemption stays auditable at the point it's introduced rather
// than depending on a reviewer noticing it.
//
// "Real" is judged, not merely "a comment exists": every disable/restore
// directive and every bare `v8 ignore start|stop|next` marker is stripped
// out of the candidate text first (both appear routinely paired with
// Stryker directives in this codebase -- see spawn-check.ts), and what
// remains must still clear a minimum length. This is a deliberately loose
// heuristic, not a prose-quality check -- it only needs to distinguish "an
// explanation was attempted" from "nothing was written at all."

const DISABLE_PATTERN = /^\s*Stryker\s+disable\b/i

// A single unnested `.*` (rather than a repeated `(\s+\S+)*` token group) --
// `.` never matches a newline, so this still stops at the end of the
// directive's own comment line without needing a second, nested quantifier.
const DIRECTIVE_ONLY_PATTERN = /Stryker\s+(?:disable|restore).*|v8\s+ignore\s+(?:start|stop|next)/gi
const MIN_RATIONALE_LENGTH = 20

function hasSubstantiveText(commentValue) {
  const stripped = commentValue
    .replace(DIRECTIVE_ONLY_PATTERN, " ")
    .replace(/[-*/]+/g, " ")
    .trim()

  return stripped.length >= MIN_RATIONALE_LENGTH
}

// Walks backward from `disableIndex` through comments on strictly
// consecutive lines (no blank line or code line breaking the chain).
// Directive-only comments (further Stryker/v8-ignore markers) are skipped
// over rather than treated as rationale or as chain-breakers, since real
// rationale routinely sits one line above a `/* v8 ignore start */` marker
// rather than directly above the `Stryker disable` line itself.
function hasAdjacentRationale(comments, disableIndex) {
  let expectedLine = comments[disableIndex].loc.start.line - 1

  for (let index = disableIndex - 1; index >= 0; index--) {
    const candidate = comments[index]

    if (candidate.loc.end.line !== expectedLine) return false

    if (hasSubstantiveText(candidate.value)) return true

    expectedLine = candidate.loc.start.line - 1
  }

  return false
}

/** @type {import("eslint").Rule.RuleModule} */
const requireStrykerRationale = {
  meta: {
    type: "problem",
    docs: {
      description:
        "require an explanatory comment directly above every `// Stryker disable` directive",
    },
    schema: [],
    messages: {
      missingRationale:
        "`Stryker disable` directive has no explanatory comment adjacent to it. Add a comment above it describing why this line is exempt from the mutation-testing policy.",
    },
  },
  create(context) {
    return {
      Program() {
        const comments = context.sourceCode.getAllComments()

        comments.forEach((comment, index) => {
          if (!DISABLE_PATTERN.test(comment.value)) return
          if (hasAdjacentRationale(comments, index)) return

          context.report({ node: comment, messageId: "missingRationale" })
        })
      },
    }
  },
}

export default requireStrykerRationale

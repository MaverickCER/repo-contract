# 0016: A vague rationale is rejected structurally, the same as any other malformed `PolicyResult`

## Status

Accepted. Implemented in `src/policy/run-policies.ts` (`VAGUE_RATIONALE_PATTERNS`,
`matchedVagueRationalePattern`, wired into `invalidPolicyResultReason`);
covered by `test/unit/policy/run-policies.test.ts`'s "invalid PolicyResult"
suite. `PolicyResult`'s own doc comment (`src/types.ts`) and
`schemas/verdict.schema.json`'s generated description now state this is
enforced, not merely documented.

## Context

`PolicyResult.rationale`'s own doc comment has always said a rationale like
"see output above" or "check the report for details" "defeats the purpose"
of a structured, machine-and-human-readable result — but until now that was
prose alone. `runPolicies` already validates every other part of a
`PolicyResult`'s shape at runtime (`outcome` is one of the three real
values; `rationale` is a string at all) via `invalidPolicyResultReason`,
treating a violation exactly like a thrown error — a deliberate choice
(see that function's own doc comment) because nothing stops a JavaScript
consumer, or a typo'd literal, from returning something invalid at runtime
even though TypeScript would catch it at compile time. A vague-but-present
rationale string passed every one of those checks: `typeof rationale ===
"string"` is true for `"see output above"` just as much as for a real
finding. A cross-package audit ahead of this package's `1.0` release,
run specifically against the bar this whole project holds _other_ tools
to ("as much detailed, specific, immediately actionable information as
possible"), found this exact gap: the one requirement TypeScript's type
checker structurally cannot enforce (a `string`'s _content_, not its type)
was the one requirement nothing enforced at all beyond a doc comment and
CODE_REVIEW.md's own review checklist.

## Decision

`invalidPolicyResultReason` — the same function that already rejects a
malformed `outcome`/non-string `rationale` — now also rejects a rationale
matching one of a small, fixed set of known vague-deferral phrases
(`VAGUE_RATIONALE_PATTERNS`): "see output/logs above," "check the
report/logs/output for details," and "see above for details," each
matched case-insensitively as a whole phrase (not by co-occurrence of
individual words, so a legitimate rationale that happens to mention "the
report" or "the log" as part of a real, specific sentence is never a false
positive). A match is treated exactly like any other invalid
`PolicyResult` shape: the check's `policy` call is treated as having
thrown, wrapped in the same `PolicyThrewError` family every other policy
failure already gets, with a message naming which known pattern matched
and instructing the author to state the specific finding directly.

This is a fixed, deliberately narrow blocklist, not a general vagueness
detector — catching every genuinely non-specific rationale is undecidable.
It catches the exact anti-patterns this package's own documentation already
named as the ones to avoid, structurally, for repo-contract's own checks
and every consumer's custom ones alike.

## Consequences

- A check (repo-contract's own, or a consumer's) that regresses to a vague
  deferral now fails loudly, with a specific error naming the problem,
  instead of silently shipping a rationale that "defeats the purpose."
- No change to any valid, specific rationale — the pattern match requires
  "see"/"check" immediately before the vague noun phrase, not mere
  co-occurrence, so real sentences mentioning "the report" or "the log" in
  passing are unaffected (covered directly by test cases).
- `PolicyResult`'s own doc comment and the generated `schemas/verdict.schema.json`
  description now point at this enforcement directly, closing the
  "asserted in prose, enforced nowhere" gap the audit found.

## Alternatives considered

- **A JSON Schema `pattern`/`not` constraint on `rationale` instead.**
  Rejected — `schemas/verdict.schema.json` is generated from `src/types.ts`
  via `ts-json-schema-generator`, and expressing "must NOT match this
  pattern" through that tool's JSDoc-tag support is fragile and, more
  importantly, only matters to a consumer who explicitly runs schema
  validation against a `Verdict` (today, only this package's own
  conformance test does) — far weaker than blocking the value at the
  moment it's produced, which the runtime check already does for everyone.
- **A minimum length requirement.** Rejected — length is a poor proxy for
  specificity (a long rationale can still be vague; a short one can be
  exactly right, e.g. `"exit code 0"`), and an arbitrary length threshold
  invites gaming without meaningfully raising quality.
- **Escalating a match to a hard `fail` outcome on the check itself,
  rather than treating it as a thrown-policy error.** Rejected — this
  reuses the exact mechanism (and exact class hierarchy) the codebase
  already established for "the returned value doesn't satisfy the
  `PolicyResult` contract," which is precisely what a vague rationale is;
  inventing a second, parallel mechanism for the same underlying problem
  would be inconsistent for no real benefit.

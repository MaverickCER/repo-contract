# 0014: CodeRabbit becomes a surfaced check because its non-execution is itself recorded

## Status

Accepted. Implemented in `checks/coderabbitai.ts`, `scripts/coderabbitai/{review,evidence-types,
policy-config,registry}.ts`. Supersedes the reasoning (not the tool) behind
`.githooks/pre-push`'s former standalone `coderabbit review --agent` step, which this check now
replaces inside `npm run contract` itself.

## Context

Before this change, `.githooks/pre-push` ran `coderabbit review --agent` as a bespoke shell step
after `npm run contract`, guarded by `command -v coderabbit` and deliberately never wired into the
contract itself. The reasoning at the time (see the pre-push script's own former comment) was
sound as far as it went: an LLM-assisted review is assistive and non-deterministic, not the kind
of evidence a self-hosting contract check is built around, and git hooks are inherently local —
the step could never run in CI regardless, so nothing was lost by keeping it a separate,
best-effort shell step outside the contract's own accounting.

That reasoning has a real gap: a step that lives entirely outside the contract's evidence model is
also invisible to it. A contributor who bypasses the hook (`--no-verify`), lacks the CLI, or
simply never had it installed sees no distinct signal that CodeRabbit's own review never ran —
the push either succeeds (because `npm run contract` alone gates it) or the hook prints a
console line a CI run and a PR reviewer both never see. Nothing records _that a local review was
skipped_, only whether one happened to run.

Separately, `specs/decisions/0013-reusable-exception-policy-helper.md` established a general
exception-policy primitive precisely so a finding — from any tool — can be gated on a
finding-specific, verified waiver rather than accepted or dismissed by fiat. CodeRabbit findings
were the one review signal in this repository with no such mechanism at all: a contributor's only
options were to fix what CodeRabbit flagged or to simply not run it locally, with the outcome
either way invisible to the same evidence/policy pipeline every other check participates in.

## Decision

`coderabbitai` becomes a real, always-declared `repo-contract` check
(`repo-contract.config.ts`), not a conditionally-included one. Its evidence
(`scripts/coderabbitai/evidence-types.ts`) is a closed state machine:

- `"reviewed"` — the CLI actually ran, on a real branch, outside CI; its findings are evaluated
  against `.repo-contract/exceptions/coderabbit.json` via the same `repo-contract/helpers`
  exception-policy primitive `security-socket` and the suppression-governance retrofit use.
- `"not-applicable"` (`reason: "ci"`) — running in CI, where review is delegated to CodeRabbit's
  own GitHub App integration instead of this CLI. Carries `expectedProvider:
"coderabbit-github-app"` so no future automation reading this evidence mistakes "ran in CI" for
  "review was skipped" — the _review itself_ still happens, through a different channel this
  check doesn't own or need to duplicate.
- `"unavailable"` (`"cli-not-installed"` | `"git-context-unavailable"`) — the CLI isn't on `PATH`,
  or the checkout can't establish the git context a diff-based review needs (a detached `HEAD`).
- `"error"` — the CLI ran but produced a malformed or unrecognized event stream, or reported a
  real failure. Fails closed, exactly like `checks/mutation.ts` does for a malformed Stryker
  report.

`checks/coderabbitai.ts`'s policy maps `"not-applicable"`/`"unavailable"` to **`warn`**, never a
silent `pass` and never a `fail` — this is the load-bearing design choice, and it is what makes
including this check safe despite CodeRabbit being assistive and non-deterministic: **every**
environment that doesn't produce a real review — CI included — shows the identical warning. A
contributor who bypasses the hook, or lacks the CLI, sees exactly the same signal CI always shows,
so a local skip can never masquerade as "nothing to warn about." The check's own presence, not its
outcome, is the guarantee.

`.githooks/pre-push` drops its bespoke `coderabbit` step entirely — `npm run contract` now runs
it as `coderabbitai`, with the same self-skip behavior the old hook step had, now recorded as
evidence instead of a console line.

## Consequences

- Every `npm run contract` run — local or CI — reports on CodeRabbit review status explicitly,
  where before only a local, hook-only step did, and only when a contributor happened not to skip
  it.
- CodeRabbit findings are now first-class exception-policy subjects: a finding a maintainer
  judges incorrect or acceptable is dismissed the same governed way a Socket alert or a
  suppressed lint rule is — a finding-specific, verified `.repo-contract/exceptions/
coderabbit.json` record, not silent dismissal.
- Because there is no more-authoritative tool to mechanically re-run against an AI-generated
  finding, `scripts/coderabbitai/registry.ts` excludes `"validated-false-positive"` from a
  CodeRabbit exception's own allowed `exceptionType` set, and requires every verification's
  `method` to be `"independent-human-review"` — never `"mechanical-reverification"`. A human's
  own accountable judgment call is the only verification this check can ever accept.
- CodeRabbit's own `--agent` event stream provides no native per-finding identifier and no
  structured line number — `NormalizedFinding.identity` is deliberately coarse (`file` +
  `severity` only; see `scripts/coderabbitai/evidence-types.ts`'s own doc comment), a known,
  documented limitation rather than a precise-looking key that silently stops matching once the
  CLI's own free-text finding wording shifts between runs.
- This check never invokes an LLM itself, and never introduces new ambient/network surface: it
  spawns the same, already-locally-installed `coderabbit` binary the pre-push hook always did,
  through the same `cross-spawn` pattern `security-socket` uses for `socket`.

## Alternatives considered

- **Leaving CodeRabbit as a pre-push-only step, unchanged.** Rejected — this is the exact gap
  this ADR exists to close: a step invisible to the contract's own evidence model cannot be
  gated, warned about consistently, or reasoned about the way every other check is.
- **Mapping `"not-applicable"`/`"unavailable"` to a silent `pass`.** Rejected, and considered
  carefully: a silent pass is indistinguishable from "CodeRabbit reviewed this and found nothing,"
  which is false in both cases. `warn` was chosen deliberately, including for the CI steady state,
  specifically so a local skip can never look different from the expected CI condition — see this
  ADR's own Decision section.
- **Mapping `"not-applicable"`/`"unavailable"` to `fail`.** Rejected — CodeRabbit access
  (installation, or CI's own GitHub App delegation) is not guaranteed in every environment this
  contract runs in, and this check must never become a hard, unconditional dependency on a paid,
  third-party credential existing everywhere.
- **Allowing `"mechanical-reverification"` for a CodeRabbit finding judged a false positive.**
  Rejected — there is no tool this check could re-run to mechanically substantiate dismissing an
  AI-generated finding the way re-running secretlint or the network scanner does for their own
  findings; admitting this method here would silently reintroduce an unverifiable "trust me"
  dismissal specifically for the one finding source this repository has the least independent way
  to check.

# 0024: The aiReview preset gates on scored JSON from a consumer-chosen agent

## Status

Accepted 2026-11-13 at the owner's request, for the next minor release. Amends
[ADR 0004](0004-public-surface-stays-narrow-no-cli-experimental-presets.md) (options on the command
line) and [ADR 0007](0007-no-network-surface.md) (reviewed preset commands). Supersedes nothing.

## Context

An AI review was example code in `examples/demo`: each adopter copied a check that asked a model for
scored JSON and gated on the scores. The owner asked for it as a published preset whose agent,
credentials, prompt and fallback a developer can change.

Three forces shape it:

- A model can answer differently on every run, and often wraps its JSON in prose or a code fence. A
  policy that reads prose cannot be tested, and one that rejects every wrapped reply is noisy.
- An unreadable reply must never pass silently: nothing was reviewed.
- No single AI tool fits every adopter. Every other preset wraps one tool that repo-contract names,
  and the `preset-commands` check holds each such command to a reviewed record (ADR 0007).
  `preset-commands` treated a `run` that is not a string literal as a hard failure.

## Decision

- `aiReview(options)` ships in `repo-contract/presets`, Experimental like the rest of the catalog.
  `agent` is required: the consumer names the command, and the prompt goes at `{prompt}` or last.
- The reply shape is fixed, and the default prompt states it with an example:
  `{ findings: [{ rule, file, line, severity, score, reason }], summary: { score } }`.
- Parsing has three steps: the whole output as JSON, then the text from its first `{` to its last
  `}`, then the `fallback` review. JSON of another shape also goes to the fallback, with the problems
  in the reason.
- The default fallback is one `warn` finding, "the reviewer's output could not be parsed". A
  developer can replace it, for example with an `error` finding to block on an unreadable reply.
- The policy fails on an `error` finding at or above `errorThreshold`, warns on any other `warn` or
  `error` finding, and passes on `info` only.
- Credentials travel in the check's `env`, never in `run`. This is the one exception to ADR 0004's
  rule that execution options appear on the command line. Every reason redacts their values.
- `preset-commands` records a `run:` array that starts with a spread as the consumer-supplied command
  of its file, `consumer-supplied/<file>`. It needs a reviewed record like any other command. Every
  other non-literal `run:` stays a hard failure.
- `src/presets/ai-review.ts` is mutation-tested, unlike the rest of `src/presets/**`, because its
  parser and policy are logic rather than a command and a shared helper.

## Consequences

Adopters get a tested AI check without copying code. The unit tests pin every parse branch, every
threshold boundary and the redaction. They cannot prove a model's judgement, and the GUIDE says so.

The evidence records the full prompt in `args`, and the agent's own stdout and stderr. A credential
the agent itself prints therefore reaches the evidence; the redaction covers reasons only.

The `consumer-supplied/ai-review` record covers whatever `src/presets/ai-review.ts` spawns. A change
there that prepends its own command stays covered until a reviewer notices. The unit tests pin the
exact argv, which narrows that gap. To reverse the decision, remove the preset, its record and the
spread rule in `scripts/preset-commands/scan.ts`.

## Alternatives considered

- **Keep it as example code.** Rejected: every adopter re-derives the same parser, and copies drift.
- **Default `agent` to one vendor's CLI.** Rejected: it ties the preset to one vendor and its flags.
  Revisit if one agent CLI becomes the common choice of adopters.
- **Fail on an unreadable reply by default.** Rejected: a flaky model would block merges on noise.
  The warning keeps it visible, and the fallback option makes it a failure for teams that want one.
- **Parse with the runner's `output: { format: "json" }`.** Rejected: it cannot recover JSON
  wrapped in prose, so most real replies would go to the fallback.
- **Let `preset-commands` accept any non-literal `run:`.** Rejected: a hidden command could then
  pass review by obfuscation. Only the spread form, keyed by its file, is accepted.

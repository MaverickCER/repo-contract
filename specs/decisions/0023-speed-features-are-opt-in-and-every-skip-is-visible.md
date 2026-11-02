# 0023: Speed features are opt-in, and every skip is visible

## Status

Accepted. Implemented in `src/affected/shard.ts`, `src/affected/fail-fast.ts`, `src/affected/artifacts.ts` and
`src/affected/doctor.ts` (published in `repo-contract/affected`, Experimental), `src/metrics/` (published in
`repo-contract/metrics`, Experimental), the `expensive` check option and `failFast` run option in `src/execution/`,
and `repo-contract doctor`, `metrics` and `cache why` in `bin/`. Follows
[ADR 0021](0021-affected-scope-is-a-pure-analysis-that-only-ever-widens.md) and
[ADR 0022](0022-a-full-run-is-cold-and-a-cache-replays-only-identical-inputs.md).

## Context

Narrowing a run and reusing results make it faster. Three more savings are available -- stopping early when a cheap
check has already failed, splitting mutation testing across CI jobs, and restoring build output -- and a way to see
whether the savings are real. Each can also hide a problem: a run that stops early reports fewer failures, a shard
that goes missing reports fewer mutants, a restored build can differ from a fresh one. The people who rely on a green
run most are those handing work to an agent, who need the green to mean what it says.

## Decision

- **Fail-fast is off unless asked for, in CI as much as locally.** `RunRepoContractOptions.failFast` (set by
  `--fail-fast` or `REPO_CONTRACT_FAIL_FAST`) makes a check marked `expensive` resolve without spawning once a check
  that is not `expensive` has failed. `resolveFailFast` never turns it on for a release. The default run reports every
  problem.
- **A skip is evidence, never a pass.** A skipped check has `status: "aborted"` and `skipReason: "fail-fast"`, still
  gets a policy invocation, and the shared terminal-status helper fails it with a message saying it did not run. A new
  `CheckStatus` member was rejected: widening that union is a compile-time break for any consumer that mixes policies
  from two versions of this package, whereas an optional field is not.
- **Sharding loses nothing or fails.** `planShards` places every target in exactly one shard (heaviest first onto the
  lightest, ties broken by name, so the plan is deterministic) and never plans more shards than targets.
  `mergeMutationReports` refuses a missing, repeated or out-of-range shard, a report that is not a mutation report,
  disagreeing schema versions, and a file mutated by two shards. There is no partial merge.
- **Restored build output is verified.** `packArtifacts` stores each file with a SHA-256 and refuses unsafe paths;
  `unpackArtifacts` refuses the whole set if any shape, path or checksum is wrong, which a caller treats as a miss. A
  full run still bypasses the cache (ADR 0022), so a release always builds fresh.
- **`doctor` repairs only what needs no judgement.** The one fix is appending the cache directory to `.gitignore`;
  everything else is advice. `--fix` shows the change before writing it and is idempotent.
- **Measurement is local and file-based.** `.repo-contract/metrics/runs.jsonl` holds one JSON object per run. Nothing
  is sent anywhere. The actor (`human` or `agent`) is whatever the caller's own configuration says; it is never
  inferred from commits or authorship. A line that cannot be read is skipped and counted, never fatal.
- **Maturity is computed, not claimed.** `maturityLevel` is a pure function of recorded facts, and names what the next
  level needs. An evidence manifest carries each check's verdict and an evidence hash under a digest of the whole, so
  "this release passed the full contract" can be checked by anyone holding the manifest.

## Consequences

- A user who wants speed turns it on; a user who wants the whole list of problems gets it without doing anything.
- A skipped check shows up in every report as a failure to run, so fail-fast can lower the number of problems shown
  but not turn a failing run green.
- The CLI grows to `affected`, `cache`, `doctor` and `metrics` besides `init`, all read-only except `doctor --fix`,
  which writes only the files its findings name.
- Wiring these into a runner (flags, environment, hooks, the CI matrix, writing the run log) belongs to the consumer.

## Alternatives considered

- **Fail-fast by default in CI.** Rejected: it hides failures behind the first one and makes every run a bisection.
- **A `skipped` check status.** Rejected for the compatibility reason above.
- **Hash-based sharding.** Rejected: it ignores how long a file takes, so one shard can run several times longer than
  the rest.
- **Partial merges with a warning.** Rejected: a missing shard would make the score look better than it is.

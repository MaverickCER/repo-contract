# 0020: Reporting hooks are optional inputs that can never change a run

## Status

Accepted. Implemented in `src/run-repo-contract.ts` (the two options), `src/execution/run-checks.ts` (where a
check's evidence is final) and `src/policy/run-policies.ts` (where its verdict is). The ready-made hooks are in
`src/helpers/contract-logs.ts`, published as `repo-contract/helpers` (beta).

## Context

A run produces evidence and verdicts, and a repository that wants something done with them while the run is
still going (keep each check's raw output, print a line, post to a channel) had to wait for the whole run to
finish, or wrap the runner. The two obvious fixes both cost something: a built-in logger would make the
package choose where and whether to write (ADR 0011: spawning and ambient access are the consumer's), and a
plugin or event-bus system would add a second extension model next to checks and policies.

## Decision

- `RunRepoContractOptions` gains two optional functions. `onEvidence(checkId, evidence)` is called once for each
  check as soon as its evidence is final. `onVerdict(checkId, result)` is called once for each check as soon as
  its policy has returned a valid result.
- A hook is an input, not a behaviour. It gets its own copy of what it is given, its return value is ignored, and
  one that throws, or an `async` one that rejects, is ignored too: reporting can never change what a run does,
  which checks run, or what the verdict is. A policy that throws is still reported through the run's usual error,
  never through the hook.
- A run with neither hook behaves exactly as before.
- Writing a log is not in the core. `repo-contract/helpers` offers `onEvidenceSaveToRepoContractLogs` and
  `onVerdictPrependRepoContractLogs` for the common case, built only on the hooks and on file operations the
  caller can replace; a problem writing is reported once per run through `onProblem` and never thrown.

## Consequences

- A repository chooses where output goes, in its own contract file, with ordinary code.
- Phasing is unchanged: policies still run after every check's evidence is assembled, so verdict hooks fire once
  the checks have finished, in the order the policies settle.
- The two hook names are public surface (Experimental until the package is 1.0, like the rest of the options).

## Alternatives considered

- **A built-in logger.** Rejected: the package would pick the folder, the format and whether to touch the disk.
- **An event or plugin system.** Rejected: a second extension model for two moments in a run.
- **Letting a hook veto or change a result.** Rejected: that is what a policy is for, and a policy is the one
  place that explains itself.

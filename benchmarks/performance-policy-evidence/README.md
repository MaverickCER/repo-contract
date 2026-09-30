# performance-policy-evidence

Measures `src/evidence/build-evidence.ts`'s `buildEvidence` and `src/policy/run-policies.ts`'s
`runPolicies` — the two stages repo-contract runs immediately after `runChecks` (see
`src/run-repo-contract.ts`) — as pure, in-memory CPU cost, deliberately isolated from real
process-spawn overhead (see the sibling `performance-checks` category for that).

See [`../README.md`](../README.md) for the shared methodology across all three categories.

## What's generated

[`fixtures.mjs`](fixtures.mjs)'s `generateEvidenceFixture(checkCount, payloadBytes)` builds
`checkCount` synthetic `CheckExecutionEntry` triples — the exact shape `runChecks` returns — with
real JSON stdout of roughly `payloadBytes` each (a `findings` array of small structured records,
the shape a real lint/security tool's parsed output takes), and a real, non-trivial `policy` that
reads both its own parsed output and its `dependsOn` dependencies' evidence (~15% of checks declare
one dependency on an earlier check, exercising `runPolicies`' per-check dependency-evidence-
gathering loop). No process is ever spawned.

| Tier     | Checks | Payload/check | Purpose                                                              |
| -------- | ------ | ------------- | -------------------------------------------------------------------- |
| `small`  | 20     | ~500 B        | Fast-feedback sanity point.                                          |
| `medium` | 100    | ~5 KB         | Mid-ladder point — both check count and per-check payload size grow. |
| `large`  | 400    | ~50 KB        | Top of the scaling ladder.                                           |

## Run it

```sh
npm run benchmark:policy-evidence
```

# 0025: Four tiers, each a general rule

## Status

Accepted 2026-11-16 by the owner, for the next minor release. Builds on
[ADR 0019](0019-helpers-promoted-presets-stay-experimental.md): tiers are built from presets, so
they are Experimental too. [ADR 0023](0023-speed-features-are-opt-in-and-every-skip-is-visible.md)'s
rule that every skip is visible applies to a check a tier override turns off. Supersedes nothing.

## Context

Every adopter assembled the same checks by hand from the preset catalog, and each copy drifted.
internal-package-contract (IPC) held the fullest set, but it mixes general rules with the owner's
conventions, vendors and fleet plumbing. A stranger who adopts repo-contract without IPC had no
named bar to start from.

Three forces shape the answer:

- A tier must hold rules that apply to every codebase of its kind. A rule only one owner wants
  belongs in that owner's own standard, which can harden a tier.
- `strict` needs Coverage, Crap and Mutation, and repo-contract had no preset for any of them.
  Porting them is about 13 hours, so other general IPC checks wait for a later round.
- A private app should be able to run `strict`, which sits on `library`. publint, attw and the
  tarball checks judge a package someone installs, and a private package has no such consumer.

## Decision

- `repo-contract/tiers` exports four tiers. Each holds every check of the tier before it:
  - **basic**: every codebase that has source code. Format, Lint, Typecheck, Tests,
    SecuritySecrets, SecurityDeps.
  - **app**: basic plus what built, shipped and maintained code needs. Build, DeadCode,
    Duplication (2%), Licenses, DocsLinks, Coverage (80 on lines and statements).
  - **library**: app plus what keeps a package working for the people who install it, and
    nothing else. Packaging, TypeResolution, BundledDependencies, QuickStart.
  - **strict**: library plus general rigor that costs time. Crap (30, complexity 20), DistNoUrls,
    DocsMarkdown, Commits, Mutation (score 80). Coverage rises to 80 on all four metrics and
    Duplication falls to 0.75%.
- There is no `fleet` tier. IPC builds on `strict()` and hardens it: Mutation `minScore: 100` or a
  recorded exception, and its own checks.
- `strict` asks for a mutation score of 80 with no Timeout left after re-runs. 80 matches its
  coverage floor. A Timeout fails at any score, because it may hide an infinite loop.
- On a `private: true` package, the four library-only checks pass as not applicable. Their tools
  still run; only the verdict changes, and the rationale says why.
- One overrides object, keyed by check id, changes a tier. An options object merges over the
  tier's options for that check; Coverage thresholds merge per metric. `false` keeps the check in
  the run as a pass that names the override, so the skip stays visible.
- A tier carries its name, overrides and settings as metadata. `explainTier` reads them back and
  lists every setting looser than the tier. Higher is stricter for coverage and the mutation score.
  Lower is stricter for the duplication budget, the CRAP score and complexity.
- Eight general checks keep a tier on paper and ship in a later minor: DocsFragments, GithubActions
  and GitHygiene at `app`; PackedConsumer and EngineMatrix at `library`; Suppressions,
  SecurityDevDeps and CleanCheckout at `strict`. `plannedChecks` lists them, so no tier looks more
  complete than it is.
- Four checks moved from where the first draft placed them, each by the tier rules. Coverage moved
  from `library` to `app`, because it is not a compatibility rule. Commits and DocsMarkdown moved
  from `app` to `strict`, and DistNoUrls from `library`: a convention, a style and a shipped URL
  each break no consumer.

## Consequences

A stranger can adopt a named bar in one line and see in `explainTier` what they loosened. IPC
deletes its private Coverage, Crap and Mutation copies and keeps only what is its own.

The tiers inherit the presets' Experimental tier. A planned check joining a tier fails some
repositories that passed before, and it can land in a minor while `0.x`. The changeset must say so.

`explainTier` reads settings from the metadata only. A check the user replaced by hand keeps the
metadata's settings, and a config without metadata gets its checks compared but not its settings.

The not-applicable rule reads `package.json` in the working directory. A check given its own `cwd`
in a workspace is judged by the root manifest.

To reverse a tier move, change `src/tiers/catalog.ts` and this record together.

## Alternatives considered

- **A `fleet` tier holding IPC's checks.** Rejected: it encodes one owner's vendors and policy in a
  package meant for strangers.
- **Port all eight general IPC checks now.** Rejected for this round: about 19.5 more hours, and
  tiers are Experimental, so they can join in a minor.
- **Demand 100% mutation in `strict`.** Rejected: it makes a recorded exception for every
  equivalent mutant the price of entry. IPC keeps 100% for its own packages.
- **Fail library-only checks on a private package.** Rejected: a private app could then never run
  `strict`.
- **Drop a turned-off check from `checks`.** Rejected: the skip would vanish from the verdict, and a
  `dependsOn` naming it would no longer resolve.

# Adoption guide for technical decision-makers

Use this guide to decide whether `repo-contract` fits your organization. It is written for a principal or staff engineer, an engineering manager or a security reviewer. Each section summarizes a primary source (`README.md`, `SECURITY.md`, `specs/architecture.md` or an ADR) and links to it. Nothing here is a new claim.

## What problem this solves

`repo-contract` turns a repository's quality rules into one owned, versioned contract instead of a loose set of CI steps. Most repositories enforce quality gates as independent CI steps: a lint job, a test job, a coverage job. Each is configured, ordered and reported on separately, usually by whoever set up CI first, and never revisited. Two failure modes follow directly from that:

- A check fails and the log says only `Process completed with exit code 1`. Whoever is on the hook has to re-run it locally to find out what broke.
- A platform team wanting the same bar across twenty repositories ends up copy-pasting YAML. The copies drift the moment one repo's copy gets a "quick fix" the others never receive.

The contract is a declarative graph of checks. Each check produces structured `Evidence` (what happened) and a repository-owned `Verdict` (whether that was acceptable). Every outcome carries a mandatory, specific reason (its `rationale`), never a bare pass or fail. See [README.md](README.md) for the full pitch and a real example of that evidence in practice.

## Security & threat model

Full detail: [`SECURITY.md`](SECURITY.md). The summary a security reviewer needs:

- **No shell interpretation by default.** A `run` string is tokenized into an executable and its arguments; a `run` array is used as argv verbatim. Neither ever passes through a shell on POSIX. An untrusted value interpolated into `run` cannot inject a second command, a redirect, or a pipeline. The one unavoidable exception is Windows resolving a `.cmd`/`.bat` shim, which is how almost every npm-installed CLI is invoked there. `cross-spawn`'s own argument escaping handles it, not a shell that repo-contract itself invokes ([ADR 0003](specs/decisions/0003-cross-platform-command-execution-and-process-cleanup.md)).
- **No ambient capability the caller didn't grant.** Process spawning and environment-variable access are capabilities the _consumer_ supplies (`spawn`/`env` on `defineRepoContract()`'s own config). The repo-contract library never imports a process-spawning implementation or reads `process.env`. Only the `affected` and `doctor` commands in the `bin` do, to run `git` ([ADR 0011](specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md)).
- **The `init` CLI only scaffolds local files.** Neither it nor the library engine makes network calls or collects telemetry. A check in this repository's own contract enforces the no-network property; it is not only documented.
- **Supply-chain posture:** npm's OIDC trusted publishing (no long-lived `NPM_TOKEN`) with provenance attestation. A consumer can verify that a published artifact was built by this repository's own CI, not a maintainer's laptop.

What installing it adds, generated from `package.json`:

<!-- ipc:begin dependencies -->

Installing `repo-contract` installs no other packages. It names 1 optional peer, which you install yourself when you use the part that needs it.

| Package      | Kind          | Range     | Why                                                                                                                                                                                                             |
| ------------ | ------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typescript` | optional peer | `>=5.0.0` | Only for `repo-contract/affected` and the `repo-contract affected` command, which read the project's own compiler API to follow imports (GUIDE.md's runtime support lists the versions). Nothing else loads it. |

<!-- ipc:end dependencies -->

## Versioning, stability, and long-term support

The eventual `1.0` stability promise will cover a three-tier model. Full detail: [`VERSIONING.md`](VERSIONING.md).

- **Stable:** `defineRepoContract`/`runRepoContract`'s signatures and the `Evidence`/`CheckEvidence`/`Verdict` shapes with their execution/phasing invariants. It also covers the exported error hierarchy, the `run`-string tokenization contract, `repo-contract/helpers`' exception primitives, and the published `./schema` files' own `$id`s.
- **Experimental:** `repo-contract/presets`, `repo-contract/affected`, `repo-contract/metrics` and the `init` CLI's detection table/generated file content. Each may still change shape, including breaking, in a minor release before a real feedback cycle has run.
- **Private:** everything under `src/execution/`, `src/parsing/`, `src/policy/`, and `src/config/`'s internals. These are never re-exported and may change at any time.

Before `1.0`, any minor release may change a Stable API. While the package is `0.x`, a breaking change bumps the minor version and a feature bumps the patch version. The release tooling deflates one level; [VERSIONING.md](VERSIONING.md#pre-10-status) explains how, and why no automation can publish `1.0.0` by itself.

Security backports start at the first `1.0` release, per [ADR 0015](specs/decisions/0015-security-backport-window.md). Security fixes will be backported to the latest minor release of the previous major version. The window lasts a minimum of six months after a new major version ships. This is a forward commitment, not yet a proven track record.

`Evidence` and `Verdict` each version independently via their own `version` field, separately from the package's own semver. See VERSIONING.md's "Evidence and Verdict schema versioning" section. This matters because repo-contract's output is meant to be consumed as a CI-interoperability artifact (a dashboard, a stored baseline, a separate tool). That artifact may outlive the package version that produced it.

## Architectural guarantees worth knowing before you adopt

| Invariant                                                                                                                                                                                                                                                                                                                                    | Why it matters for adoption                                                                                                                                           | ADR                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Execution, evidence assembly, and policy evaluation are a strict, sequential contract. No policy ever observes partially-assembled evidence, and every configured check gets a policy call regardless of its own outcome.                                                                                                                    | No race between "did the check finish" and "did we judge it". A `Verdict` is never computed from an incomplete `Evidence`.                                            | [0001](specs/decisions/0001-execution-and-policy-are-a-strict-sequential-contract.md)                                                |
| Ordering is exactly two primitives: `dependsOn` (a real evidence dependency) and `isolated` (a scheduling barrier). Declaration order is the required topological order; a genuine scheduling race is fixed by declaring the dependency, never papered over with a retry.                                                                    | A flaky-looking check is a real bug to fix at the source. A retry loop is not allowed to hide it.                                                                     | [0002](specs/decisions/0002-dependson-and-isolated-are-two-scheduling-primitives.md)                                                 |
| Every `PolicyResult`'s `rationale` is validated at runtime, not only typed: outcome must be exactly `"pass"`/`"fail"`/`"warn"` and rationale must be a string. A rationale matching a known vague-deferral phrase ("see output above," "check the report for details") is now rejected structurally, the same as any other malformed result. | A check (this repository's own, or a consumer's custom one) that regresses to a vague, unhelpful rationale fails loudly and immediately, instead of shipping quietly. | [0016](specs/decisions/0016-vague-rationale-is-a-structural-policy-failure.md)                                                       |
| Mutation testing is held to zero survivors on this repository's own `src/`, with each excluded file and its reason listed in the `mutate` array of `stryker.config.mjs`. Every accepted exception is a reviewable, justified record via the suppression-governance registry, not a silent exclusion.                                         | The tool that tells other repositories "your test suite has a real gap here" holds its own test suite to the same bar, not a looser one.                              | None (`CODE_REVIEW.md` §3)                                                                                                           |
| Process spawning and environment access are capabilities the consumer supplies, never owned by the package. See Security above.                                                                                                                                                                                                              | No ambient capability a security review has to hunt for; the injection points are the two you already pass in.                                                        | [0011](specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md) |

Notes on the table:

- **Vague rationales (ADR 0016):** this project's own `1.0`-readiness audit found one requirement TypeScript's type system can't enforce: a string's _content_. It was also the one requirement nothing else enforced, which is why vague rationales are now rejected.
- **Mutation exclusions:** static mutants are not counted, and every other exception is a record. See [`CODE_REVIEW.md`](CODE_REVIEW.md#3-automated-checks-versus-residual-review).

## Migrating onto repo-contract

Start with two walkthroughs; there is no dedicated migration guide yet. (`@maverickcer/env-cap` and `data-cap` each have several.) This package replaces a loose collection of independent CI steps, not one specific competing tool. So the honest starting points are these:

- [`examples/day-one-walkthrough`](examples/day-one-walkthrough/README.md): adding the contract to a repository with an already-red check.
- [`examples/exceptions-walkthrough`](examples/exceptions-walkthrough/README.md): the governed-waiver flow for a check that can't be fixed immediately.

Adoption is incremental by design. `runRepoContract`'s `checks` option runs a named subset, so a team can wire in one check at a time. It does not have to replace an entire CI pipeline in one PR.

## Questions this document doesn't answer

- **What does a post-`1.0` backport/LTS policy look like in practice, once exercised?** Not yet known. [ADR 0015](specs/decisions/0015-security-backport-window.md) is a forward commitment, not a track record. Track the [ADRs](https://github.com/MaverickCER/repo-contract/tree/main/specs/decisions) for when that changes.
- **Is there a first-party migration guide from tool X?** Not currently. See "Migrating onto repo-contract" above for the closest equivalent.
- **What's the actual OpenSSF Scorecard-informed score for this repository?** See the live [OpenSSF Scorecard viewer](https://scorecard.dev/viewer/?uri=github.com/MaverickCER/repo-contract). You can also run `npm run contract` to regenerate the informational `docs/OpenSSF-Scorecard.md` locally. It is git-ignored, so it is not a link into the repository. It is informational evidence, not a certification (see that document's own disclaimer).

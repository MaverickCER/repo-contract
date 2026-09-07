# 0013: A reusable exception-policy primitive

## Status

Accepted. Implemented in `src/helpers/{index,exception-policy,load-exception-registry}.ts`,
published as the third, independent `repo-contract/helpers` subpath (Experimental, see
VERSIONING.md). `checks/shared/evaluate-exception-findings.ts` and
`scripts/shared/exception-record.ts` build the check-owned matching / canonical-identity /
content-bound-verification layer on top of it. The `suppression-governance`, `security-socket`,
and `coderabbitai` checks consume that layer (with more security-* checks retrofitted onto it
over the same release); this ADR covers the primitive and its plumbing, with each check's own use
of it documented in that check's own ADR (0006, 0014) or PR.

## Context

`scripts/suppression-governance/` (ADR 0006) already solved a real problem well: every
`disable-comments.json` record resolves a `(domain, rule)` pair to `forbidden` / `allowed` /
`exception`, and `"exception"` is only satisfied once every named field is non-empty prose. That
logic — exact match, then glob, then a domain default, then a global default; the strictest of
several matching rules wins; a record is judged field-by-field, never by a bare count — is
correct, well-tested, and entirely welded to one domain: `resolve-policy.ts`'s types and functions
hardcode `SuppressionRequirement`'s five field names, `disable-comments.json`'s on-disk shape, and
`(domain, rule)` as the classification vocabulary. Nothing about the actual precedence algorithm
or field-completeness check needs any of that — it is a real, general-purpose primitive trapped
inside one check's own module.

The immediate motivation is a family of upcoming checks (`security-socket`, `coderabbitai`, and a
retrofit of `security-deps`/`security-secrets`/`security-network`) that each need the same shape of
decision: a finding's severity/category resolves to forbidden-outright, unconditionally-allowed, or
permitted-only-with-a-named-justification, evaluated against a small on-disk registry of
hand-maintained waivers. Writing that logic five more times, slightly differently each time, is
exactly the kind of drift `scripts/suppression-governance/resolve-policy.ts`'s own doc comment
already warns against for its two existing consumers (`checks/suppression-governance.ts` and
`checks/mutation.ts`) — a policy config change in one place could silently fail to apply to
another.

## Decision

Extract the reusable core into a new, independent published subpath: `repo-contract/helpers`
(`src/helpers/`), built and published exactly like `repo-contract/presets` — its own `tsup` entry,
its own `package.json` export/shim, its own generated API report, its own dependency-cruiser/ESLint
boundary. Classified **Experimental** (VERSIONING.md), the same tier `repo-contract/presets`
carries, for the same reason: a new pre-1.0 surface shipped before a real feedback cycle.

**The core decides nothing and matches nothing.** It never invents the names "domain"/"rule"/
"severity"/"exceptionType" — a classification is exactly `{ group, category }`, and a consumer
maps its own vocabulary onto that shape at the call site. It never matches a finding to a record —
that stays entirely check-owned. It never derives a canonical identity for a record, and it
publishes no matched/unmatched batch result type. These exclusions are deliberate, not oversights:
teaching the core what a "finding" is, or what makes two records the same waiver, would turn a
small, general precedence-and-completeness primitive into an accidental policy/identity framework
every consumer would then be stuck with. The genuinely check-specific pieces — matching, canonical-
identity validation, a small closed `exceptionType` vocabulary, content-bound verification — live
one layer down, in `checks/shared/` (unpublished), where check-specific identity already belongs.

Published API, deliberately minimal: `ExceptionPolicy`, `ExceptionCategoryGroup`,
`ExceptionPolicyConfig`, `ExceptionClassification`, `ExceptionVerdict`, `ExceptionDeterminant`,
`resolveExceptionPolicy`, `evaluateExceptionRecord`, `evaluateExceptionRecords`,
`validateExceptionPolicyConfig`, `hashRequirementFields`, `loadExceptionRegistry`. Every function
is synchronous and pure except `loadExceptionRegistry`, whose only I/O is an injectable `readFile`
defaulting to `node:fs/promises` — `src/helpers/**` never imports `node:child_process` or reads
`process.env` (enforced by `scripts/verify-no-ambient-capabilities.mjs` against the real published
tarball, the same mechanism ADR 0011 already established for the root package).

`resolveExceptionPolicy` ports `resolve-policy.ts`'s exact precedence algorithm — exact match, then
glob (`minimatch`), then a group default, then a caller-supplied global default — generalized from
`(domain, rule)` to `{ group, category }`, plus one addition: a classification whose `category` is
the literal string `"*"` resolves as the strictest policy across the entire group at once (a
blanket match, not an ordinary glob target), and a literal `"*"` as a `rules` key is rejected by
`validateExceptionPolicyConfig` as a near-certain mistake — it would be consulted only as an
ordinary glob (matching the one-character target `"*"`, not "every category"), silently defeating
the blanket-match feature's own intent. `evaluateExceptionRecord`'s `classifications` parameter is
typed as a non-empty tuple (`readonly [ExceptionClassification, ...ExceptionClassification[]]`) —
zero classifications is a caller bug (which one would silently fall back to `globalDefault`?),
never a runtime guess.

`hashRequirementFields` is new, not a port of anything `resolve-policy.ts` already had: a
deterministic `node:crypto` digest of a set of fields' current values, over `{ group, category }`-
agnostic content. This exists specifically to make a future "verification" mechanism
content-bound rather than merely attested — recording a hash at the moment a claim was checked, and
recomputing it later, detects an edited claim automatically with no separate staleness-tracking
logic. `checks/shared/exception-record.ts`'s `isVerified` is the first consumer of this, but the
hashing primitive itself belongs in the published core: it is exactly as generic as everything else
here (fields, a record, a `fieldValue` accessor), and a consumer outside this monorepo building
their own verification story on top of `repo-contract/helpers` gets it for free.

`loadExceptionRegistry` validates only the registry's on-disk envelope (`{ "$schema"?: string,
"exceptions": unknown }`) — a missing file is a normal, empty-registry state, not an error; every
other failure (unreadable, malformed JSON, a missing `"exceptions"` field, a schema-validation
failure) is reported as `{ ok: false, errors }`, never thrown. What's _inside_ `exceptions` is
validated by a caller-supplied `StandardSchemaV1<unknown, readonly T[]>` (see ADR 0012) — the
loader never assumes a specific record shape, mirroring the same "consumer supplies a trusted
capability, this package calls it without owning its internals" relationship
`RepoContractConfig.spawn`/`env` already establish (ADR 0011).

**A new runtime dependency, evaluated explicitly, not assumed away.** `resolveExceptionPolicy`'s
glob matching genuinely needs a real pattern-matching implementation — not just types, unlike
`StandardSchemaV1` (ADR 0012) — so `minimatch` becomes this package's first real `dependencies`
entry (previously zero; see ADR 0008/0011's "zero runtime dependencies" framing for `spawn`/`env`,
which was always about ambient _capabilities_, not literally every dependency). `minimatch` is
already a long-standing, zero-dependency, extremely widely used devDependency of this repository
(used internally by `scripts/suppression-governance/resolve-policy.ts`) — promoting the exact same
pinned version to a real dependency, rather than hand-vendoring a glob matcher's actual algorithmic
logic (a real correctness risk a thin vendor copy would not meaningfully reduce, unlike a pure-type
interface), is the honest choice here. `tsup.config.ts` marks it `external` (never bundled into
`dist/`), the same explicit treatment `yaml` already gets.

## Consequences

- A future `security-socket`/`coderabbitai`/`security-deps`/`security-secrets`/`security-network`
  retrofit (and `suppression-governance`'s own retrofit, still pending — see the "Alternatives
  considered" note below) shares one tested precedence algorithm and one tested field-completeness
  check, instead of five-plus near-identical copies.
- `repo-contract` now ships one real runtime dependency (`minimatch`) where it previously shipped
  zero. This is scoped and explained above, not silent — a consumer who never imports
  `repo-contract/helpers` still pays nothing extra at runtime (the root and `presets` entry points
  do not import `minimatch` at all).
- `repo-contract/helpers` carries no automated backward-compatibility protection of its own yet,
  the same interim gap ADR 0004 already documents for `repo-contract/presets` — the Experimental
  classification is the mitigation, not a permanent answer.
- Matching, canonical-identity validation, and a closed `exceptionType` vocabulary are available in
  `checks/shared/` for this repository's own checks to build on, but are not published — an outside
  consumer wanting that layer writes their own, the same way they would write their own `matchRecord`
  today.

## Alternatives considered

- **Retrofitting `suppression-governance` onto this core in the same change**: rejected for this
  PR specifically — the retrofit is a pure, zero-behavior-change refactor with its own differential
  property test as evidence, and belongs in its own reviewable, revertible commit once this
  primitive itself has landed, not bundled into the same change that introduces it.
- **Publishing a matched/unmatched batch result type, or teaching the core a canonical-ID/indexed-
  registry concept**: rejected outright — this would re-introduce exactly the identity/matching
  semantics this design deliberately keeps out of the published core (see Decision above). The
  useful parts of that idea (verifying a record's own addressing key against itself; a convenience
  `Map` index) are adopted one layer down, in `checks/shared/`, where check-specific identity
  already lives.
- **A single generic `run`/`policy` factory** analogous to what ADR 0004 already rejected for
  presets: not applicable here in the same way (this primitive has no `run`/execution concept at
  all), but the same underlying principle held — a classification-neutral core stays useful only by
  staying narrow; teaching it more would make it either too weak to reuse or an ever-growing pile of
  special cases.
- **Hand-vendoring a small glob matcher instead of depending on `minimatch`**: rejected — unlike
  `StandardSchemaV1` (ADR 0012), a glob matcher is real, non-trivial algorithmic logic, not a pure
  type interface; a hand-vendored reimplementation would be a genuine correctness risk with no
  offsetting benefit, since `minimatch` is already a long-standing, zero-dependency, widely-audited
  devDependency of this exact repository.
- **Making `readFile` a required parameter with no `node:fs/promises` default**: considered, to
  keep `src/helpers/**` provably as capability-free as the root package's `spawn`/`env` requirement
  (ADR 0011) — rejected as unnecessary friction for the common case (a real file, read from real
  disk) that the root package's own `src/presets/security-secrets.ts` already performs the same
  way. `loadExceptionRegistry`'s `path` is a trusted, consumer-supplied value (a check's own
  registry-file location), not externally-tainted input, and is documented as exactly that
  trust boundary at its one narrowly-scoped ESLint carve-out (`eslint.config.js`).

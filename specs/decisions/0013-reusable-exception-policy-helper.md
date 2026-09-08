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
`ExceptionPolicyConfig`, `ExceptionClassification`, `ExceptionRecordEvaluation`, `ExceptionVerdict`,
`ExceptionDeterminant`, `resolveExceptionPolicy`, `evaluateExceptionRecord`,
`evaluateExceptionRecords`, `validateExceptionPolicyConfig`, `hashRequirementFields`,
`loadExceptionRegistry`, and (added by the 2026-09 "review surface" amendment below)
`reconcileExceptions`, `serializeExceptionRegistry`, `writeExceptionRegistry`, `ExceptionRecordCore`,
`ExceptionReconciliation` — plus a re-export of the hand-vendored `StandardSchemaV1` type (ADR 0012)
so a consumer can type `loadExceptionRegistry`'s `schema` argument without reaching past this
independent barrel into the root export. Every function
is synchronous and pure except `loadExceptionRegistry` and `writeExceptionRegistry`, whose only
I/O is through injectable `node:fs/promises` capabilities — `src/helpers/**` never imports
`node:child_process` or reads
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

## Verification, not attestation

Every field this primitive checks for completeness is _self-reported_ by whoever wants the
exception permitted — `justification`, `alternatives`, `remediation`, an `exceptionType`. A policy
that requires those fields proves an exception was _described_; it never proves the description was
_examined_. `scripts/suppression-governance/`'s original design (ADR 0006) has exactly this shape:
its `verificationMethod` field _names_ a technique (`mutation-run`, `existing-test-suite`, …)
without anything ever confirming the technique was applied to that specific record. That is
attestation, not enforcement — and it is the weakness every check built on this primitive
(`security-socket`, `coderabbitai`, the `security-*` retrofits, and `disable-comments.json` itself
via ADR 0006's amendment) closes with one further gate.

`hashRequirementFields` is what makes that gate possible without the core learning anything new.
The check-owned layer (`checks/shared/`, `scripts/shared/exception-record.ts`) records, alongside a
sign-off (`verifiedBy` / `verifiedAt`), a `verifiedContentHash` — `hashRequirementFields()` over
the record's prose/classification fields _at the moment of sign-off_. On every later run the check
recomputes that hash from the record's _current_ field values and treats the sign-off as present
only while the two still match. Editing any hashed field after sign-off silently invalidates the
hash, the verification field reverts to "missing", and the record fails policy again — with no
separate staleness-tracking logic anywhere, and with `src/helpers/`'s generic core still only ever
seeing "a named field, trimmed, non-empty."

Two deliberate refinements live one layer down, in `checks/shared/` / `scripts/shared/`, never in
the published core:

- **A closed verification-`method` vocabulary** (for the checks whose records carry a
  `verification` block): `"mechanical-reverification"` — re-run the same tool that raised the
  finding, scoped narrowly, and confirm it no longer fires — or `"independent-human-review"`, an
  accountable human judgment call for everything mechanical re-verification can't reach. A
  `validated-false-positive` claim _must_ be a `mechanical-reverification`; `coderabbitai` (an AI
  opinion with no more-authoritative oracle to re-run) forbids `mechanical-reverification` outright
  (ADR 0014). `suppression-governance` reuses its existing `verificationMethod` enum instead of a
  second `method` field — see ADR 0006's amendment for why.
- **Staged reporting of the verification field.** It is a genuinely required field the whole time —
  `evaluateExceptionRecord`'s pass/fail semantics never change — but a freshly-created record's
  first reported `missing` list names only the still-empty _authoring_ fields, never a demand to
  sign off on prose that doesn't exist yet. `stageMissingFields` filters it back in only once every
  authoring field is filled. Purely a presentation choice, so the published contract stays
  untouched.

## The exception registry is the review surface (amendment, 2026-09)

Every one of this repository's own guardrail-loosening mechanisms is being unified onto
`.repo-contract/exceptions/*.json` so that folder is the complete, single place a reviewer looks
to see what a PR deliberately weakened. The unification runs on the same evidence/policy split
ADR 0001 establishes, plus a small registry-lifecycle layer added to `repo-contract/helpers`:

- **A check emits 100% of its findings, with zero knowledge of exceptions.** Evidence states
  exactly what is wrong; an exception may change the _verdict_, never the _evidence_. A check that
  filters its own output against an allowlist (as `scripts/security-network/scan.ts` did for
  preset commands) is the specific bug this closes.
- **`reconcileExceptions` (`repo-contract/helpers`)** diffs a run's findings against the loaded
  registry: a matched record is preserved verbatim; an unmatched finding gets a fresh, blank
  **stub** written to disk (the human fills in one prose field); a record whose id matches no
  finding is **surfaced as stale and never removed** — retiring one is an explicit, reviewable
  human edit. `deriveId` must be injective over a run's findings (a collision is an integrity
  error the check surfaces, not a silent merge of two findings), and it is **semantic** — keyed to
  what is excepted. Most checks keep the file line _out_ of the id so ordinary edits do not churn
  the registry (`security-network:<capability>:<file>`, `preset-command:<command>`,
  `dead-code:<kind>:<name>`). `suppression-governance` is the deliberate exception: its id is
  `suppression:<domain>:<rule>:<file>:<line>` **including the line**, because a `<domain,rule,file>`
  key collides for ~30% of this repository's own directives (many equivalent-mutant `Stryker
disable`s in one file), and a colliding `deriveId` is a hard integrity failure, not a mergeable
  state. The accepted tradeoff: moving a suppressed directive to a new line makes its old record
  stale and scaffolds a fresh blank stub — both fail the build until a human carries the
  justification across. No move detection is attempted (an automated registry that silently
  transferred justification between locations would itself be the bypass ADR 0006 forbids).
- **`serializeExceptionRegistry` / `writeExceptionRegistry`** give the on-disk form one canonical,
  deterministic shape (`id`-sorted, fixed key order, `\n`, trailing newline) written atomically
  (temp file + rename) and only when the bytes actually change — so a fully-governed tree stays
  clean across `npm run contract` runs, and a run that _would_ scaffold a stub leaves the tree
  dirty, which CI fails on.
- **The policy stays a pure function of evidence** — it performs no I/O and never re-reads a
  registry itself.

Trust boundary: the folder is the complete **exception-approval surface** _given that_ the
finding-producing code (`deriveId`, the scanners) is itself under normal code review. The
mechanism provides discoverability and completeness, **not attestation authenticity** — a blank
`justification` fails the build, but nothing checks that a filled-in one is true. A PR-approval
gate that binds a human sign-off to the record is a deliberate follow-up, not part of this
amendment.

## Consequences

- `suppression-governance`, `security-socket`, and `coderabbitai` (with more `security-*` checks
  retrofitted onto it over the same release) share one tested precedence algorithm and one tested
  field-completeness check, instead of five-plus near-identical copies. Each landed in its own
  reviewable commit once this primitive itself had landed, not bundled in with it.
- `repo-contract` now ships one real runtime dependency (`minimatch`) where it previously shipped
  zero. This is scoped and explained above, not silent — a consumer who never imports
  `repo-contract/helpers` still pays nothing extra at runtime (the root and `presets` entry points
  do not import `minimatch` at all).
- `repo-contract/helpers` carries no automated backward-compatibility protection of its own yet,
  the same interim gap ADR 0004 already documents for `repo-contract/presets` — the Experimental
  classification is the mitigation, not a permanent answer.
- Matching (`checks/shared/evaluate-exception-findings.ts`), canonical-identity validation, a
  closed `exceptionType` vocabulary, and `validateExceptionRegistry` — the one generic
  core-plus-per-registry-schema validator every `.repo-contract/exceptions/*.json` shares, owning
  the `id`/`version`/`justification` core, id namespace, unknown-field rejection and id uniqueness,
  and delegating registry-specific fields to a small `ExceptionRegistrySchema`
  (`scripts/shared/exception-record.ts`) — are available for this repository's own checks to build
  on, but are not published. An outside consumer wanting that layer writes their own, the same way
  they would write their own `matchRecord` today.
- No generated JSON Schema backs `disable-comments.json` (or any exception registry): the runtime
  `validateExceptionRegistry` is authoritative, and editor schema support for an internal registry
  is not part of the contract. The bespoke `disable-comments.schema.json`, its generator entry, and
  its schema-conformance test were removed with the `suppression-governance` retrofit.

## Alternatives considered

- **Bundling the `suppression-governance` retrofit into the primitive's own introducing change**:
  rejected — that retrofit is a pure, zero-behavior-change refactor with its own differential
  property test as evidence, and landed in its own reviewable, revertible commit once this
  primitive itself had landed, not bundled into the same change that introduced it.
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

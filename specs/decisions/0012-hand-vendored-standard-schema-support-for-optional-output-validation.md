# 0012: Hand-vendored Standard Schema support for optional output validation

## Status

Accepted. Implemented in `src/standard-schema/types.ts`, `src/types.ts`,
`src/config/validate-config.ts`, `src/parsing/parse-output.ts`,
`src/parsing/format-schema-issues.ts`, `src/errors.ts`, `src/index.ts`.

## Context

`CheckDefinitionConfig.output` lets a check request its stdout be parsed as `"json"`, `"yaml"`, or
`"text"`, landing on `CheckEvidence.output.value` -- but that value is always `unknown`, and
nothing in repo-contract validates its shape. A malformed report (a linter's JSON output missing a
field a policy expects, an unexpected `null`, a differently-shaped array) surfaces only as
undefined behavior deep inside that policy function -- a `TypeError` on some property read, not a
clear, structured failure repo-contract itself can name.

[Standard Schema](https://standardschema.dev) exists to close exactly this gap for a library in
repo-contract's position: any schema object produced by Zod, Valibot, ArkType, or any other
compliant library exposes a `~standard.validate()` method with a fixed, vendor-neutral shape, so a
_consumer_ library can accept an opaque schema and validate (and optionally transform) a value
against it without depending on whichever library produced it. This is precisely the same relationship
[ADR 0011](0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md)
already established for `spawn`/`env`/`killProcessTree`: a consumer supplies a trusted capability;
repo-contract calls it without owning, wrapping, or bundling an implementation of it.

A separate, orthogonal extension spec, [StandardJSONSchemaV1](https://standardschema.dev/json-schema),
lets a schema optionally convert itself to JSON Schema (its own FAQ states the two specs are
independent: one is about validation, the other about JSON Schema conversion). Nothing in
repo-contract's own pipeline consumes a JSON Schema derived from a check's output schema today, so
adopting it now -- its own types, a helper function, a new error class, and their own tests/ADR
coverage -- would grow the public surface for a capability with no current caller. **This decision
is scoped to validation only** (`StandardSchemaV1`); `StandardJSONSchemaV1` is deferred to a future
change, to be picked up once something actually needs it.

**Vendor vs. depend, evaluated explicitly.** The real, currently published `@standard-schema/spec@1.1.0`
package (npm, published 2025-12-15) was inspected directly rather than assumed: it is ~22 KB
unpacked, ships only `.d.ts`/`.d.cts` declaration files plus a no-op `.js`/`.cjs` (no executable
logic any consumer code path ever runs) -- a genuinely types-only dependency, not a supply-chain
risk in the sense [ADR 0011](0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md)
was concerned with (an ambient runtime capability). Even so, this decision hand-vendors the single
`StandardSchemaV1` interface as a local, type-only file (`src/standard-schema/types.ts`) rather
than adding it as a dependency, consistent with
[ADR 0008](0008-self-hosting-tool-and-dependency-choices.md)'s existing stance of keeping this
package's dependency graph minimal on principle -- one fewer entry in the published `package.json`
and the audit/lockfile graph, for a capability that is pure TypeScript declarations either way. A
types-only dependency and a hand-vendored type file are behaviorally identical for a consumer
assigning a real Zod/Valibot/ArkType schema to `output.schema`; the difference is purely about
repo-contract's own dependency count, which ADR 0008 already treats as worth minimizing on its own
terms, not only where a real runtime-code risk exists.

**Version pin, for future maintenance:** vendored from `@standard-schema/spec@1.1.0`, on
2026-09-04. Upstream's `StandardSchemaV1.Props` actually extends a shared `StandardTypedV1.Props`
base (`version`/`vendor`/`types`); the vendored copy inlines those fields directly into one flat
`StandardSchemaV1` interface instead, since repo-contract has no use for the shared base on its
own -- structurally identical for any real schema object assigned to it. Re-diff against
`@standard-schema/spec`'s published `dist/index.d.ts` if this file is ever touched.

## Decision

`CheckDefinitionConfig.output` gains an optional `schema?: StandardSchemaV1` field. `parseOutput`
(the sole orchestration point -- `parse-json.ts`/`parse-yaml.ts`/`parse-text.ts` stay entirely
schema-unaware) runs `schema["~standard"].validate()` once a requested format's parse itself
succeeds:

- A successful `Result` (`issues === undefined`) _replaces_ `CheckEvidence.output.value` with the
  schema's own, possibly transformed/coerced output -- one of the most useful aspects of Standard
  Schema, not merely a boolean check.
- A failing `Result` becomes an ordinary `ParsedOutputFailure` -- indistinguishable in shape from a
  malformed-JSON/YAML parse failure, since from a policy's perspective "the tool's JSON parsed but
  doesn't match the expected shape" and "the tool's JSON was malformed" are the same category of
  problem: this check's output isn't what was expected, reported as data, never a throw. The
  `error` string is built by `format-schema-issues.ts`'s `formatSchemaIssues`, joining every issue's
  own path (rendered dotted/bracketed, e.g. `items[2].name`) and message.
- `validate()` itself throwing synchronously, or returning a `Promise` that rejects, is a different
  case entirely -- a bug in the _schema_, not malformed output, mirroring exactly how
  `PolicyThrewError` already treats a throwing policy as a bug in consumer code rather than a check
  failing its contract. It propagates as `StandardSchemaValidateThrewError` (or an `AggregateError`
  when multiple checks' schemas throw in the same run, via the same aggregation `build-evidence.ts`
  already performs for parser-dependency failures).

`validate-config.ts`'s `validateOutputSchema` checks only the three fields every
`StandardSchemaV1.Props` object must have -- `schema` is opaque, consumer-supplied, and anything
else in its shape (the optional `types` field, in particular) is not part of the contract this
function can or should enforce:

- `schema` and `schema["~standard"]` are non-null objects.
- `"~standard".version === 1`.
- `"~standard".vendor` is a string.
- `"~standard".validate` is a function.

It never calls `validate` itself -- config validation is purely structural, before anything
spawns; behavioral validation only happens once a check's stdout actually parses.

`CheckDefinitionConfig.output.schema`'s inferred output type is deliberately _not_ threaded to
`CheckEvidence.output.value`'s declared type -- it stays `unknown`, for the same
heterogeneous-checks-in-one-record TypeScript inference limitation already documented on
`CheckEvidence` (repo-contract cannot reliably carry one specific check's own literal
`output.format`, let alone one specific check's own `schema`'s inferred output type, through to
that same check's `policy` parameter once several checks with different formats/schemas live
together in one `checks` record). This is a deliberate, acknowledged tradeoff, not a gap this
change is attempting to close: runtime output transformation/validation is fully supported
independently of statically narrowing `CheckEvidence.output.value`; a schema still gives its own
author real compile-time input/output typing via `StandardSchemaV1<Input, Output>` for their own
code, just not threaded through this shared, cross-check `CheckEvidence` shape. A policy author
narrows or casts `.value` themselves, exactly as they already must for `"json"`/`"yaml"` with no
schema supplied.

`RepoContractConfig`'s own shape (validated separately in `validate-config.ts`) stays entirely out
of scope. Standard Schema exists to accept an opaque, vendor-supplied schema for a _consumer's own_
data; `RepoContractConfig`'s shape is repo-contract's own fixed, package-owned contract, already
correctly hand-validated field-by-field, and not a slot for a consumer-supplied schema at all.

## Consequences

- **Purely additive, zero new dependencies.** A new optional field, a new optional-only-when-used
  runtime code path, one new exported type (`StandardSchemaV1`) and one new exported error class
  (`StandardSchemaValidateThrewError`). No existing field, signature, or behavior changes for a
  consumer not opting into `output.schema`; a consumer who never sets it pays zero runtime cost.
  Ships as a `feat:` commit (minor-position bump, pre-1.0) per `VERSIONING.md`.
- **No `Evidence.version`/`Verdict.version` bump.** Their declared shapes are unchanged -- only
  _how_ `value`/`error` get populated changes, and only for a check whose config opts into
  `schema`.
- A consumer bringing their own schema library (Zod, Valibot, ArkType, or any other Standard
  Schema-compliant one) gets real shape validation and optional coercion/normalization of a check's
  parsed output, with repo-contract never installing or picking one on the consumer's behalf.
- `StandardJSONSchemaV1` (JSON Schema conversion) is not available yet. Adopting it later is a
  separate, independent change -- this decision does not foreclose it, only defers it until an
  actual consumer exists.

## Alternatives considered

- **Installing a default validator library** (e.g. bundling `zod` as a dependency and validating
  against it internally): rejected -- contradicts
  [ADR 0008](0008-self-hosting-tool-and-dependency-choices.md)'s minimal-dependency stance and
  forces one specific library choice onto every consumer, including those who already use a
  different one in their own repo.
- **Depending on `@standard-schema/spec` directly** instead of hand-vendoring: evaluated
  explicitly (see Context) rather than assumed away. It is a genuinely types-only, ~22 KB package
  with no executable logic -- a real, defensible choice -- but hand-vendoring costs nothing more at
  runtime and keeps this package's dependency count (and audit/lockfile surface) at zero for this
  feature, consistent with ADR 0008's existing minimal-dependency principle even where no real
  runtime-code risk exists.
- **Adopting `StandardJSONSchemaV1` in this same change**: rejected for now -- no code path in
  repo-contract's own pipeline consumes a JSON Schema derived from a check's output schema today;
  adding its types, a conversion helper, and a new error class now would grow the public/test/ADR
  surface for an unused capability. Deferred to a future, independent change.
- **Threading a schema's inferred output type through `CheckEvidence.output.value`'s declared
  type**: rejected -- the same TypeScript inference limitation already documented on
  `CheckEvidence` for heterogeneous check formats applies identically to heterogeneous schemas; a
  real, isolated repro during the original `output.format` design confirmed this is a genuine
  compiler limitation, not something a cleverer type could route around, so `value` stays `unknown`
  regardless of whether a schema is supplied.
- **Rejecting a schema whose `validate()` throws as an `InvalidCheckConfigError` at config-validation
  time**: rejected -- `validate` is only a function reference at config-validation time; there is
  no way to detect "will throw" without calling it, which config validation deliberately never
  does (see `validateOutputSchema`'s own doc comment).

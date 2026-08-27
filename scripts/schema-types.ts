// ts-json-schema-generator cannot resolve a generic interface as a root
// schema type, even one with a default type parameter (confirmed via an
// isolated repro during implementation -- see
// specs/decisions/0009-self-hosting-tool-and-dependency-choices.md). Evidence
// and Verdict are generic (parameterized over a consumer's specific
// CheckSchema) so that evidence.checks.<id> autocompletes/typechecks for a
// consumer's own config; the *published* schema instead describes the
// general, ungrounded shape (every consumer's own check ids are unknown
// ahead of time from a schema-generation standpoint, so the schema itself
// can only describe the shape generically, matching each type's own
// declared default type parameter). Not exported from src/ -- this file
// exists solely as a target for scripts/generate-json-schema.mjs.
import type { Evidence, Verdict } from "../src/types.js"

export type EvidenceSchemaSource = Evidence
export type VerdictSchemaSource = Verdict

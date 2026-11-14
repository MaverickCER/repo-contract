// The ts-json-schema-generator tool cannot resolve a generic interface as a
// root schema type, even one with a default type parameter. An isolated repro
// during implementation confirmed this; see
// specs/decisions/0008-self-hosting-tool-and-dependency-choices.md. Evidence
// and Verdict are generic, parameterized over a consumer's specific
// CheckSchema. This makes evidence.checks.<id> autocomplete/typecheck for a
// consumer's own config. The *published* schema instead describes the
// general, ungrounded shape. From a schema-generation standpoint, every
// consumer's own check ids are unknown ahead of time. The schema can only
// describe the shape generically, matching each type's own declared default
// type parameter. This file is not exported from src/. It exists solely as a
// target for scripts/generate-json-schema.mjs.
import type { Evidence, Verdict } from "../src/types.js"

export type EvidenceSchemaSource = Evidence
export type VerdictSchemaSource = Verdict

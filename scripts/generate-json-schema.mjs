// Generates schemas/*.schema.json (and one internal, non-published schema --
// see the "disable-comments" target below) directly from their source types
// -- never hand-authored, so a schema and the type it describes cannot
// silently drift apart. Regenerated as part of `npm run verify`.

import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createGenerator } from "ts-json-schema-generator"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// One entry per published schema, each independently versioned (see
// VERSIONING.md's schema-versioning policy -- Evidence and Verdict evolve
// independently of each other and of the package's own semver).
export const TARGETS = [
  {
    name: "evidence",
    // Targets scripts/schema-types.ts, not src/types.ts directly --
    // Evidence/Verdict are generic (parameterized over a consumer's own
    // CheckSchema), and ts-json-schema-generator cannot resolve a bare
    // generic interface as a root type even with a default type parameter.
    // See that file's own comment for the full rationale.
    sourceFile: "scripts/schema-types.ts",
    type: "EvidenceSchemaSource",
    outputFile: "schemas/evidence.schema.json",
    id: "https://maverickcer.github.io/repo-contract/schema/evidence.schema.json",
    title: "repo-contract Evidence",
    description:
      "Machine-readable record of what happened when a repo-contract configuration was " +
      "executed -- one entry per configured check, describing the command run, its exit " +
      "status, captured output, and (if requested) parsed output. Says nothing about whether " +
      "the result was acceptable -- see the paired Verdict schema for that. Generated from " +
      "src/types.ts's Evidence type -- never hand-authored.",
    // VERSIONING.md's "Evidence and Verdict schema versioning" section promises that additive
    // fields are a compatible change within the same schema `version` number -- a consumer
    // pinned to this schema must therefore still validate evidence produced by a newer
    // repo-contract version that has grown a field this schema doesn't know about yet.
    // ts-json-schema-generator's own default (`additionalProperties: false` on every object
    // without an index signature) contradicts that promise; overridden to `true` here for
    // exactly the two published, versioned schemas.
    additionalProperties: true,
  },
  {
    name: "verdict",
    sourceFile: "scripts/schema-types.ts",
    type: "VerdictSchemaSource",
    outputFile: "schemas/verdict.schema.json",
    id: "https://maverickcer.github.io/repo-contract/schema/verdict.schema.json",
    title: "repo-contract Verdict",
    description:
      "Machine-readable aggregate pass/fail result produced by evaluating repository-owned " +
      "policies against an Evidence object -- one entry per configured check, each " +
      "individually inspectable. Generated from src/types.ts's Verdict type -- never " +
      "hand-authored.",
    // See the "evidence" target's own comment above -- identical reasoning.
    additionalProperties: true,
  },
  {
    name: "disable-comments",
    // Deliberately left at ts-json-schema-generator's own strict default (additionalProperties:
    // false) rather than opting in like evidence/verdict above: this registry is internal,
    // single-producer/single-consumer tooling with no forward-compatibility promise (see this
    // target's own comment below) -- strict validation here catches a real drift bug rather than
    // tolerating one.
    // Targets scripts/suppression-governance/evidence-types.ts directly -- unlike
    // Evidence/Verdict above, DisableCommentRecord/DisableCommentRegistry are not generic, so
    // none of the scripts/schema-types.ts re-export indirection those two need (to work around
    // ts-json-schema-generator's inability to resolve a bare generic interface as a root type)
    // applies here.
    sourceFile: "scripts/suppression-governance/evidence-types.ts",
    type: "DisableCommentRegistry",
    outputFile: "scripts/suppression-governance/disable-comments.schema.json",
    // Deliberately NOT under the maverickcer.github.io/repo-contract/schema/ namespace the two
    // targets above use: disable-comments.json is this repository's own internal self-assurance
    // registry (see specs/decisions/0007-suppression-governance.md), not part of the published
    // package surface (schemas/ is inside package.json's `files` and its `exports["./schema/*"]`;
    // this file deliberately lives outside that directory so it never ships to a consumer or gets
    // promoted to VERSIONING.md's Stable tier). The $id below reflects that non-published status
    // rather than reusing the public schema host.
    id: "https://github.com/maverickcer/repo-contract/internal/disable-comments.schema.json",
    title: "repo-contract Disable Comments",
    description:
      "Machine-readable schema for this repository's own disable-comments.json suppression- " +
      "governance registry (see specs/decisions/0007-suppression-governance.md) -- internal " +
      "self-assurance tooling, never part of the published package surface. Generated from " +
      "scripts/suppression-governance/evidence-types.ts's DisableCommentRegistry type -- never " +
      "hand-authored.",
  },
]

// ts-json-schema-generator (unlike e.g. typescript-json-schema) has no JSDoc-annotation mechanism
// for value-level JSON Schema keywords (`minimum`, `minLength`, `minItems`, `pattern`, ...) -- it
// only ever derives structural shape from the TS type itself. That means a value-level invariant
// registry.ts's `validateRecord` enforces at runtime (e.g. "line must be a positive integer") can
// never appear in the generated schema no matter what the source type or its JSDoc says, since
// TypeScript's own `number`/`string`/`readonly string[]` types carry no such refinement.
// Merged in by basename after generation, purely for the internal "disable-comments" target
// (never the two published schemas/evidence.schema.json /verdict.schema.json -- those stay
// exactly what the generator produces): each entry mirrors one of validateRecord's own checks, so
// a divergence between the two is now a schema-conformance-test failure (an invalid record that
// satisfies the schema but not the validator) rather than a silent, undetected gap. `file`'s
// `pattern` only approximates "well-formed repo-relative path" (no leading `/`, no `..` segment)
// -- registry.ts's `isWellFormedRepoRelativePath` remains the authoritative, exact check.
const DISABLE_COMMENTS_PROPERTY_OVERRIDES = {
  file: { minLength: 1, pattern: "^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$)).+$" },
  line: { type: "integer", minimum: 1 },
  domain: { minLength: 1 },
  // `items` is assigned wholesale (Object.assign only shallow-merges), so `type: "string"` must
  // be repeated here rather than relying on the generator's own `{ type: "string" }` surviving --
  // it would otherwise be silently clobbered.
  rule: { minItems: 1, items: { type: "string", minLength: 1 } },
  content: { minLength: 1 },
}

/**
 * Merges `DISABLE_COMMENTS_PROPERTY_OVERRIDES` into the generated "disable-comments" schema's
 * `DisableCommentRecord` definition -- see that constant's own comment for why this can't instead
 * be expressed as a generator input.
 * @param schema - The freshly generated schema object (mutated in place).
 */
function applyDisableCommentsOverrides(schema) {
  const record = schema.definitions?.DisableCommentRecord
  if (record === undefined) {
    throw new Error(
      "generate-json-schema: expected a DisableCommentRecord definition to layer value-level overrides onto, but none was generated -- did evidence-types.ts's DisableCommentRecord shape change?",
    )
  }
  for (const [property, override] of Object.entries(DISABLE_COMMENTS_PROPERTY_OVERRIDES)) {
    const existing = record.properties?.[property]
    if (existing === undefined) {
      throw new Error(
        `generate-json-schema: expected DisableCommentRecord to have a "${property}" property to override, but it did not.`,
      )
    }
    Object.assign(existing, override)
  }
}

function generateSchema(target) {
  const config = {
    path: path.join(root, target.sourceFile),
    tsconfig: path.join(root, "tsconfig.json"),
    type: target.type,
    expose: "export",
    jsDoc: "extended",
    skipTypeCheck: false,
    // Defaults to ts-json-schema-generator's own strict `false` when a target doesn't opt in --
    // see the "disable-comments" target's own comment for why that default is correct there.
    additionalProperties: target.additionalProperties ?? false,
  }

  const schema = createGenerator(config).createSchema(config.type)
  if (target.name === "disable-comments") applyDisableCommentsOverrides(schema)
  return {
    $schema: schema.$schema,
    $id: target.id,
    title: target.title,
    description: target.description,
    ...schema,
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const target of TARGETS) {
    const schema = generateSchema(target)
    const outPath = path.join(root, target.outputFile)
    mkdirSync(path.dirname(outPath), { recursive: true })
    writeFileSync(outPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8")
    console.log(`[schema] wrote ${path.relative(root, outPath)}`)
  }
}

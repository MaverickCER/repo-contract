// Generates schemas/*.schema.json directly from their source types -- never
// hand-authored, so a schema and the type it describes cannot silently drift
// apart. Regenerated as part of `npm run verify`.
//
// disable-comments.json deliberately has NO generated schema: its runtime
// validator (scripts/shared/exception-record.ts's validateExceptionRegistry +
// scripts/suppression-governance/evidence-types.ts's SUPPRESSION_EXCEPTION_SCHEMA)
// is authoritative and editor schema support for that internal registry is not
// part of the contract -- see specs/decisions/0013-reusable-exception-policy-helper.md's
// "The exception registry is the review surface" section.

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
]

function generateSchema(target) {
  const config = {
    path: path.join(root, target.sourceFile),
    tsconfig: path.join(root, "tsconfig.json"),
    type: target.type,
    expose: "export",
    jsDoc: "extended",
    skipTypeCheck: false,
    // Defaults to ts-json-schema-generator's own strict `false` when a target doesn't opt in.
    additionalProperties: target.additionalProperties ?? false,
  }

  const schema = createGenerator(config).createSchema(config.type)
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

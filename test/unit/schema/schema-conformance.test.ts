// eslint-disable-next-line import-x/no-named-as-default -- ajv's own documented usage is `import Ajv from "ajv"`; `Ajv` is coincidentally also a named export of the same class.
import Ajv from "ajv"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { runRepoContract } from "../../../src/run-repo-contract.js"
import { testEnv } from "../../helpers/test-env.js"
import { testSpawn } from "../../helpers/test-spawn.js"

/**
 * Golden/snapshot contracts, extended: schemas/evidence.schema.json and
 * schemas/verdict.schema.json are the published, generated (never
 * hand-authored -- see scripts/generate-json-schema.mjs) contract a real
 * consumer validates against via the package's `./schema` export. This is a
 * genuinely distinct question from API compatibility ("did the public
 * TypeScript surface change?", scripts/api-contract/): here it's "does a
 * real runtime Evidence/Verdict object actually conform to the schema this
 * package publishes for it?" -- API Extractor analyzes *types* statically;
 * this validates real *values*. Not a new top-level verification category
 * (see specs/verification-taxonomy.md's Contract-testing rejection entry) --
 * a small strengthening of the existing Golden/snapshot contracts category.
 *
 * disable-comments.json deliberately has no generated schema: its runtime
 * validator (scripts/shared/exception-record.ts's validateExceptionRegistry +
 * scripts/suppression-governance/evidence-types.ts's SUPPRESSION_EXCEPTION_SCHEMA)
 * is authoritative and editor schema support for that internal registry is not
 * part of the contract -- see specs/decisions/0013-reusable-exception-policy-helper.md's
 * "The exception registry is the review surface" section. Its conformance tests
 * live in test/unit/suppression-governance/exception-schema.test.ts.
 */

// A fresh Ajv per compilation: Ajv refuses to compile two schemas that share a
// `$id` on one instance, and several tests here compile the same schema.
function compileSchema(schema: object) {
  return new Ajv({ strict: false }).compile(schema)
}

function loadSchema(name: string): object {
  return JSON.parse(
    readFileSync(new URL(`../../../schemas/${name}`, import.meta.url), "utf8"),
  ) as object
}

describe("Evidence/Verdict runtime conformance to the published JSON Schema", () => {
  it("a real Evidence object from runRepoContract() validates against schemas/evidence.schema.json", async () => {
    const { evidence } = await runRepoContract({
      checks: {
        ok: {
          run: [process.execPath, "-e", "process.stdout.write(JSON.stringify({hello:'world'}))"],
          output: { format: "json" },
          policy: () => ({ outcome: "pass", rationale: "ok" }),
        },
        failing: {
          run: [process.execPath, "-e", "process.exit(1)"],
          policy: ({ result }) => ({
            outcome: result.exitCode === 0 ? "pass" : "fail",
            rationale: "checked exit code",
          }),
        },
      },
      spawn: testSpawn,
      env: testEnv,
    })

    const validate = compileSchema(loadSchema("evidence.schema.json"))
    const valid = validate(evidence)

    expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true)
  })

  it("a real Verdict object from runRepoContract() validates against schemas/verdict.schema.json", async () => {
    const { verdict } = await runRepoContract({
      checks: {
        ok: {
          run: [process.execPath, "-e", "process.exit(0)"],
          policy: ({ result }) => ({
            outcome: result.exitCode === 0 ? "pass" : "fail",
            rationale: "checked exit code",
          }),
        },
      },
      spawn: testSpawn,
      env: testEnv,
    })

    const validate = compileSchema(loadSchema("verdict.schema.json"))
    const valid = validate(verdict)

    expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true)
  })

  it("tolerates an unknown additive field, per VERSIONING.md's forward-compatibility promise for this schema version", async () => {
    const { evidence } = await runRepoContract({
      checks: {
        ok: {
          run: [process.execPath, "-e", "process.exit(0)"],
          policy: () => ({ outcome: "pass", rationale: "ok" }),
        },
      },
      spawn: testSpawn,
      env: testEnv,
    })

    // Simulates a consumer, pinned to today's schema, validating evidence produced by a future
    // repo-contract version that has grown a field this schema doesn't know about yet -- exactly
    // the scenario VERSIONING.md's "Additive fields... are a compatible change" promise covers.
    const evidenceWithNewField = { ...evidence, aFutureField: "added in a later minor version" }

    // `compileSchema` builds a fresh Ajv -- another test in this file already
    // compiled evidence.schema.json, and Ajv rejects the same $id twice per instance.
    const validate = compileSchema(loadSchema("evidence.schema.json"))
    const valid = validate(evidenceWithNewField)

    expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true)
  })
})

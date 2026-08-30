// eslint-disable-next-line import-x/no-named-as-default -- ajv's own documented usage is `import Ajv from "ajv"`; `Ajv` is coincidentally also a named export of the same class.
import Ajv from "ajv"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  SUPPRESSION_CATEGORIES,
  VERIFICATION_METHODS,
} from "../../../scripts/suppression-governance/evidence-types.js"
import { validateSuppressionRegistry } from "../../../scripts/suppression-governance/registry.js"
import { runRepoContract } from "../../../src/run-repo-contract.js"

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
 * The disable-comments.json describe block below extends this same idea to
 * scripts/suppression-governance/disable-comments.schema.json -- generated
 * the same way, but deliberately NOT under schemas/ (see
 * specs/decisions/0006-suppression-governance.md and the new
 * category/verificationMethod ADR: this schema describes an internal,
 * unpublished self-assurance registry, not a consumer-facing contract).
 * `loadInternalSchema` below reads it from its own location rather than
 * `loadSchema`'s `schemas/` path. ajv stays test-only throughout this file --
 * it is never imported under src/, scripts/, or checks/, and adding this
 * schema does not change that: `registry.ts`'s hand-written validator
 * remains the only runtime gate on disable-comments.json.
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

function loadInternalSchema(name: string): object {
  return JSON.parse(
    readFileSync(
      new URL(`../../../scripts/suppression-governance/${name}`, import.meta.url),
      "utf8",
    ),
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

describe("disable-comments.json conformance to its internal, generated JSON Schema", () => {
  it("the real, current disable-comments.json validates against the generated schema -- deliberately redundant with registry.ts's own hand-written validator, since this checks the *generated schema*, not the *runtime validator*; a disagreement between the two would itself be the finding", async () => {
    const registry = JSON.parse(
      readFileSync(new URL("../../../disable-comments.json", import.meta.url), "utf8"),
    ) as unknown

    const validate = compileSchema(loadInternalSchema("disable-comments.schema.json"))
    const valid = validate(registry)

    expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true)
  })

  it("the generated schema's category/verificationMethod enum order matches SUPPRESSION_CATEGORIES/VERIFICATION_METHODS' declared order exactly", () => {
    const schema = loadInternalSchema("disable-comments.schema.json") as {
      definitions: {
        SuppressionCategory: { enum: readonly string[] }
        VerificationMethod: { enum: readonly string[] }
      }
    }

    expect(schema.definitions.SuppressionCategory.enum).toEqual([...SUPPRESSION_CATEGORIES])
    expect(schema.definitions.VerificationMethod.enum).toEqual([...VERIFICATION_METHODS])
  })

  const VALID_RECORD = {
    file: "src/example.ts",
    line: 10,
    domain: "eslint",
    rule: ["no-console"],
    content: "eslint-disable-next-line no-console",
    justification: "",
    alternatives: "",
    remediation: "",
    category: "",
    verificationMethod: "",
    reason: "",
  }

  // generate-json-schema.mjs's DISABLE_COMMENTS_PROPERTY_OVERRIDES layers value-level invariants
  // (minLength/minimum/minItems/pattern) onto the generated schema specifically so a record that
  // violates one of registry.ts's own runtime checks is rejected by *both* -- not accepted by the
  // schema while only registry.ts catches it. Each case here mutates exactly one field off a
  // record that is otherwise valid, and asserts schema and validator agree it's invalid; per the
  // describe block's own doc comment above, a disagreement between the two is itself the finding
  // these cases exist to catch.
  it.each([
    ["line is not an integer", { ...VALID_RECORD, line: 1.5 }],
    ["line is zero", { ...VALID_RECORD, line: 0 }],
    ["file is empty", { ...VALID_RECORD, file: "" }],
    ["file has a leading slash", { ...VALID_RECORD, file: "/src/example.ts" }],
    ['file has a ".." segment', { ...VALID_RECORD, file: "../example.ts" }],
    ["domain is empty", { ...VALID_RECORD, domain: "" }],
    ["content is empty", { ...VALID_RECORD, content: "" }],
    ["rule is an empty array", { ...VALID_RECORD, rule: [] }],
    ["rule contains an empty string", { ...VALID_RECORD, rule: [""] }],
  ] as const)(
    "the generated schema and registry.ts's validator agree that a record is invalid when %s",
    (_description, invalidRecord) => {
      const validate = compileSchema(loadInternalSchema("disable-comments.schema.json"))
      expect(validate([invalidRecord])).toBe(false)

      const result = validateSuppressionRegistry([invalidRecord])
      expect(result.ok).toBe(false)
    },
  )
})

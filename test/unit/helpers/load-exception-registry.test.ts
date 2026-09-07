import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { loadExceptionRegistry } from "../../../src/helpers/load-exception-registry.js"
import type { StandardSchemaV1 } from "../../../src/standard-schema/types.js"

interface FixtureException {
  readonly id: string
}

/** A schema that validates `unknown` as an array of `{ id: string }` -- proves only that the loader hands `exceptions` through to a caller's own schema untouched, never a real production registry shape. */
const fixtureExceptionsSchema: StandardSchemaV1<unknown, readonly FixtureException[]> = {
  "~standard": {
    version: 1,
    vendor: "fixture",
    validate: (value) => {
      if (!Array.isArray(value)) {
        return { issues: [{ message: "exceptions must be an array" }] }
      }
      const issues: StandardSchemaV1.Issue[] = []
      const records: FixtureException[] = []
      for (const [index, entry] of value.entries()) {
        if (
          typeof entry !== "object" ||
          entry === null ||
          typeof (entry as Record<string, unknown>).id !== "string"
        ) {
          issues.push({ message: "must have a string id", path: [index, "id"] })
          continue
        }
        records.push({ id: (entry as Record<string, unknown>).id as string })
      }
      if (issues.length > 0) return { issues }
      return { value: records }
    },
  },
}

/** A schema whose `validate()` always fails with exactly the given issues -- for tests that need precise control over `StandardSchemaV1.Issue.path` shapes, independent of `fixtureExceptionsSchema`'s own record-validation logic. */
function rawIssuesSchema(
  issues: readonly StandardSchemaV1.Issue[],
): StandardSchemaV1<unknown, readonly FixtureException[]> {
  return { "~standard": { version: 1, vendor: "fixture", validate: () => ({ issues }) } }
}

describe("loadExceptionRegistry -- fixture readFile overrides", () => {
  it("returns ok:true with an empty array when readFile rejects with ENOENT (missing file)", async () => {
    const result = await loadExceptionRegistry({
      path: ".repo-contract/exceptions/fixture.json",
      schema: fixtureExceptionsSchema,
      readFile: () => {
        const error = new Error("ENOENT: no such file or directory") as NodeJS.ErrnoException
        error.code = "ENOENT"
        return Promise.reject(error)
      },
    })
    expect(result).toEqual({ ok: true, records: [] })
  })

  it("returns ok:false when readFile rejects with a non-ENOENT error", async () => {
    const result = await loadExceptionRegistry({
      path: ".repo-contract/exceptions/fixture.json",
      schema: fixtureExceptionsSchema,
      readFile: () => {
        const error = new Error("permission denied") as NodeJS.ErrnoException
        error.code = "EACCES"
        return Promise.reject(error)
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain("permission denied")
  })

  it("returns ok:false (never throws) when readFile rejects with null instead of an Error -- e.g. a test double, or an unusual real filesystem implementation", async () => {
    const result = await loadExceptionRegistry({
      path: ".repo-contract/exceptions/fixture.json",
      schema: fixtureExceptionsSchema,
      // This test exists specifically to prove loadExceptionRegistry's own catch block never
      // throws when a caller-supplied readFile rejects with a non-Error value -- see CodeRabbit
      // finding on PR #42 / src/helpers/load-exception-registry.ts.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- deliberate non-Error rejection, see above
      readFile: () => Promise.reject(null),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain("Could not read")
    expect(result.errors[0]).toContain("null")
  })

  it("uses error.message when readFile rejects with a plain object whose code isn't a string (falls through the ENOENT check, still uses the real message)", async () => {
    const result = await loadExceptionRegistry({
      path: ".repo-contract/exceptions/fixture.json",
      schema: fixtureExceptionsSchema,
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- deliberate non-Error rejection, distinguishing the code-lookup fallback from the ENOENT-string-match mutant
      readFile: () => Promise.reject({ code: 123, message: "a real message" }),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain("a real message")
  })

  it("falls back to String(error) when readFile rejects with a plain object carrying neither a string code nor a string message", async () => {
    const result = await loadExceptionRegistry({
      path: ".repo-contract/exceptions/fixture.json",
      schema: fixtureExceptionsSchema,
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- deliberate non-Error rejection, distinguishing the String(error) fallback from the real-message mutant
      readFile: () => Promise.reject({}),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain("Could not read")
    expect(result.errors[0]).toContain("[object Object]")
  })

  it("returns ok:false when the file content is not valid JSON", async () => {
    const result = await loadExceptionRegistry({
      path: ".repo-contract/exceptions/fixture.json",
      schema: fixtureExceptionsSchema,
      readFile: () => Promise.resolve("{ not valid json"),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain("is not valid JSON")
  })

  it("returns ok:false when the parsed JSON is not an object (e.g. a bare array)", async () => {
    const result = await loadExceptionRegistry({
      path: ".repo-contract/exceptions/fixture.json",
      schema: fixtureExceptionsSchema,
      readFile: () => Promise.resolve("[]"),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain('an "exceptions" array')
  })

  it('returns ok:false when the envelope is missing its "exceptions" field entirely', async () => {
    const result = await loadExceptionRegistry({
      path: ".repo-contract/exceptions/fixture.json",
      schema: fixtureExceptionsSchema,
      readFile: () => Promise.resolve(JSON.stringify({ $schema: "./fixture.schema.json" })),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors).toEqual([
      '.repo-contract/exceptions/fixture.json is missing its required "exceptions" field.',
    ])
  })

  it("hands exceptions through to the caller's schema, and returns ok:false with its formatted issues when validation fails", async () => {
    const result = await loadExceptionRegistry({
      path: ".repo-contract/exceptions/fixture.json",
      schema: fixtureExceptionsSchema,
      readFile: () => Promise.resolve(JSON.stringify({ exceptions: [{ notId: "x" }] })),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors).toEqual(["[0].id: must have a string id"])
  })

  it("returns ok:true with the schema's own validated (and possibly transformed) records on success", async () => {
    const result = await loadExceptionRegistry({
      path: ".repo-contract/exceptions/fixture.json",
      schema: fixtureExceptionsSchema,
      readFile: () =>
        Promise.resolve(
          JSON.stringify({
            $schema: "./fixture.schema.json",
            exceptions: [{ id: "a", extraneous: "dropped by the schema" }, { id: "b" }],
          }),
        ),
    })
    expect(result).toEqual({ ok: true, records: [{ id: "a" }, { id: "b" }] })
  })

  it("an empty exceptions array is valid and yields no records", async () => {
    const result = await loadExceptionRegistry({
      path: ".repo-contract/exceptions/fixture.json",
      schema: fixtureExceptionsSchema,
      readFile: () => Promise.resolve(JSON.stringify({ exceptions: [] })),
    })
    expect(result).toEqual({ ok: true, records: [] })
  })

  it("returns ok:false naming the envelope's problem when the parsed JSON is null", async () => {
    const result = await loadExceptionRegistry({
      path: ".repo-contract/exceptions/fixture.json",
      schema: fixtureExceptionsSchema,
      readFile: () => Promise.resolve("null"),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain('an "exceptions" array')
  })

  it("returns ok:false naming the envelope's problem when the parsed JSON is a bare primitive", async () => {
    const result = await loadExceptionRegistry({
      path: ".repo-contract/exceptions/fixture.json",
      schema: fixtureExceptionsSchema,
      readFile: () => Promise.resolve("42"),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected ok:false")
    expect(result.errors[0]).toContain('an "exceptions" array')
  })

  describe("formatting a failed validation's issues", () => {
    it("renders an issue with no path at all as just its message", async () => {
      const result = await loadExceptionRegistry({
        path: ".repo-contract/exceptions/fixture.json",
        schema: rawIssuesSchema([{ message: "top-level problem" }]),
        readFile: () => Promise.resolve(JSON.stringify({ exceptions: [] })),
      })
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error("expected ok:false")
      expect(result.errors).toEqual(["top-level problem"])
    })

    it("renders an issue with an explicitly empty path as just its message", async () => {
      const result = await loadExceptionRegistry({
        path: ".repo-contract/exceptions/fixture.json",
        schema: rawIssuesSchema([{ message: "empty-path problem", path: [] }]),
        readFile: () => Promise.resolve(JSON.stringify({ exceptions: [] })),
      })
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error("expected ok:false")
      expect(result.errors).toEqual(["empty-path problem"])
    })

    it("renders a PathSegment object's own .key alongside a plain string segment", async () => {
      const result = await loadExceptionRegistry({
        path: ".repo-contract/exceptions/fixture.json",
        schema: rawIssuesSchema([{ message: "nested problem", path: [{ key: "foo" }, "bar"] }]),
        readFile: () => Promise.resolve(JSON.stringify({ exceptions: [] })),
      })
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error("expected ok:false")
      expect(result.errors).toEqual(["foo.bar: nested problem"])
    })

    it("renders a string first segment bare, with no leading dot", async () => {
      const result = await loadExceptionRegistry({
        path: ".repo-contract/exceptions/fixture.json",
        schema: rawIssuesSchema([{ message: "string-first problem", path: ["foo", "bar"] }]),
        readFile: () => Promise.resolve(JSON.stringify({ exceptions: [] })),
      })
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error("expected ok:false")
      expect(result.errors).toEqual(["foo.bar: string-first problem"])
    })

    it("renders a numeric first segment bracketed", async () => {
      const result = await loadExceptionRegistry({
        path: ".repo-contract/exceptions/fixture.json",
        schema: rawIssuesSchema([{ message: "numeric-first problem", path: [0, "bar"] }]),
        readFile: () => Promise.resolve(JSON.stringify({ exceptions: [] })),
      })
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error("expected ok:false")
      expect(result.errors).toEqual(["[0].bar: numeric-first problem"])
    })
  })
})

describe("loadExceptionRegistry -- default readFile (real node:fs/promises)", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "repo-contract-load-exception-registry-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("returns ok:true with an empty array for a genuinely missing file on real disk", async () => {
    const result = await loadExceptionRegistry({
      path: path.join(dir, "does-not-exist.json"),
      schema: fixtureExceptionsSchema,
    })
    expect(result).toEqual({ ok: true, records: [] })
  })

  it("reads and validates a real file from disk when readFile is not overridden", async () => {
    const filePath = path.join(dir, "fixture.json")
    await writeFile(filePath, JSON.stringify({ exceptions: [{ id: "real-file" }] }), "utf8")

    const result = await loadExceptionRegistry({ path: filePath, schema: fixtureExceptionsSchema })
    expect(result).toEqual({ ok: true, records: [{ id: "real-file" }] })
  })
})

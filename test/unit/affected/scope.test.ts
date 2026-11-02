import { describe, expect, it } from "vitest"
import { parseScopeArgs, resolveScope } from "../../../src/affected/scope.js"

describe("parseScopeArgs", () => {
  it("returns the arguments untouched when there is no scope flag", () => {
    expect(parseScopeArgs(["lint", "format"])).toEqual({ ok: true, rest: ["lint", "format"] })
  })

  it("reads --scope <value> and --scope=<value> and removes them from the rest", () => {
    expect(parseScopeArgs(["--scope", "affected", "lint"])).toEqual({
      ok: true,
      scope: "affected",
      rest: ["lint"],
    })
    expect(parseScopeArgs(["lint", "--scope=full"])).toEqual({
      ok: true,
      scope: "full",
      rest: ["lint"],
    })
  })

  it("accepts auto explicitly", () => {
    expect(parseScopeArgs(["--scope", "auto"])).toEqual({ ok: true, scope: "auto", rest: [] })
  })

  it("reads --base the same two ways", () => {
    expect(parseScopeArgs(["--base", "origin/dev"])).toEqual({
      ok: true,
      base: "origin/dev",
      rest: [],
    })
    expect(parseScopeArgs(["--base=abc123"])).toEqual({ ok: true, base: "abc123", rest: [] })
  })

  it("rejects an unknown scope, naming the choices", () => {
    const result = parseScopeArgs(["--scope", "partial"])
    expect(result).toEqual({
      ok: false,
      error: 'The scope must be one of auto, affected, full, not "partial".',
    })
  })

  it("rejects a missing value, including when the next token is another flag", () => {
    expect(parseScopeArgs(["--scope"])).toEqual({
      ok: false,
      error: "--scope needs a value: auto, affected or full.",
    })
    expect(parseScopeArgs(["--scope", "--json"])).toEqual({
      ok: false,
      error: "--scope needs a value: auto, affected or full.",
    })
    expect(parseScopeArgs(["--base"])).toEqual({ ok: false, error: "--base needs a git ref." })
    expect(parseScopeArgs(["--base="])).toEqual({ ok: false, error: "--base needs a git ref." })
  })

  it("rejects a repeated flag rather than picking one", () => {
    expect(parseScopeArgs(["--scope", "full", "--scope", "affected"])).toEqual({
      ok: false,
      error: "--scope was given more than once.",
    })
    expect(parseScopeArgs(["--base", "a", "--base=b"])).toEqual({
      ok: false,
      error: "--base was given more than once.",
    })
  })

  it("stops at -- so what follows is never read as a flag", () => {
    expect(parseScopeArgs(["--", "--scope", "full"])).toEqual({
      ok: true,
      rest: ["--", "--scope", "full"],
    })
  })
})

describe("resolveScope", () => {
  it("runs affected locally when nothing says otherwise", () => {
    expect(resolveScope({ env: {} })).toEqual({
      scope: "affected",
      source: "default",
      reason: "a local run compares with the base branch",
    })
  })

  it("honours an explicit scope", () => {
    expect(resolveScope({ requested: "full", env: {} })).toEqual({
      scope: "full",
      source: "flag",
      reason: "--scope full",
    })
    expect(resolveScope({ requested: "affected", env: {} })).toEqual({
      scope: "affected",
      source: "flag",
      reason: "--scope affected",
    })
  })

  it("treats auto as no request", () => {
    expect(resolveScope({ requested: "auto", env: {} }).source).toBe("default")
  })

  it("reads REPO_CONTRACT_SCOPE below the flag", () => {
    expect(resolveScope({ env: { REPO_CONTRACT_SCOPE: "full" } })).toEqual({
      scope: "full",
      source: "env",
      reason: "REPO_CONTRACT_SCOPE=full",
    })
    expect(
      resolveScope({ requested: "affected", env: { REPO_CONTRACT_SCOPE: "full" } }).scope,
    ).toBe("affected")
  })

  it("ignores an empty or auto REPO_CONTRACT_SCOPE, and rejects an invalid one", () => {
    expect(resolveScope({ env: { REPO_CONTRACT_SCOPE: "" } }).source).toBe("default")
    expect(resolveScope({ env: { REPO_CONTRACT_SCOPE: "auto" } }).source).toBe("default")
    expect(() => resolveScope({ env: { REPO_CONTRACT_SCOPE: "some" } })).toThrow(
      'REPO_CONTRACT_SCOPE must be one of auto, affected, full, not "some".',
    )
  })

  it.each(["pull_request", "pull_request_target", "merge_group"])(
    "runs affected for the %s event",
    (event) => {
      expect(resolveScope({ env: { GITHUB_EVENT_NAME: event, CI: "true" } })).toEqual({
        scope: "affected",
        source: "ci-event",
        reason: `the ${event} event compares with its base`,
      })
    },
  )

  it.each(["push", "schedule", "workflow_dispatch", "workflow_call", "anything"])(
    "runs everything for the %s event",
    (event) => {
      expect(resolveScope({ env: { GITHUB_EVENT_NAME: event } })).toEqual({
        scope: "full",
        source: "ci-event",
        reason: `the ${event} event validates the whole tree`,
      })
    },
  )

  it("runs everything on a CI system it does not recognise", () => {
    expect(resolveScope({ env: { CI: "true" } })).toEqual({
      scope: "full",
      source: "ci-event",
      reason: "CI is set but no pull request is known, so the whole tree is validated",
    })
    expect(resolveScope({ env: { CI: "false" } }).scope).toBe("affected")
    expect(resolveScope({ env: { CI: "" } }).scope).toBe("affected")
    expect(resolveScope({ env: { CI: "0" } }).scope).toBe("affected")
  })

  it("lets CI_FULL force everything, over a flag, an env scope and a pull request", () => {
    for (const value of ["1", "true", "TRUE", "yes"]) {
      expect(
        resolveScope({
          requested: "affected",
          env: {
            CI_FULL: value,
            GITHUB_EVENT_NAME: "pull_request",
            REPO_CONTRACT_SCOPE: "affected",
          },
        }),
      ).toEqual({ scope: "full", source: "ci-full", reason: `CI_FULL=${value}` })
    }
  })

  it("does not treat other CI_FULL values as a force", () => {
    for (const value of ["", "0", "false", "no", "maybe"]) {
      expect(resolveScope({ env: { CI_FULL: value } }).source).toBe("default")
    }
  })

  it("lets an explicit flag win over a non-release CI event", () => {
    expect(resolveScope({ requested: "affected", env: { GITHUB_EVENT_NAME: "push" } })).toEqual({
      scope: "affected",
      source: "flag",
      reason: "--scope affected",
    })
  })

  it("always validates a release in full, whatever is requested", () => {
    expect(
      resolveScope({
        requested: "affected",
        env: { GITHUB_EVENT_NAME: "release", REPO_CONTRACT_SCOPE: "affected" },
      }),
    ).toEqual({
      scope: "full",
      source: "release",
      reason: "a release always validates the whole tree",
    })
    expect(
      resolveScope({
        requested: "affected",
        env: { GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/tags/v1.2.3" },
      }),
    ).toEqual({
      scope: "full",
      source: "release",
      reason: "a release always validates the whole tree",
    })
    expect(
      resolveScope({ requested: "affected", env: { GITHUB_REF: "refs/heads/main" } }).scope,
    ).toBe("affected")
  })
})

describe("scope flags in either order", () => {
  it("accepts --scope and --base together, in either order", () => {
    expect(parseScopeArgs(["--scope", "full", "--base", "x"])).toEqual({
      ok: true,
      scope: "full",
      base: "x",
      rest: [],
    })
    expect(parseScopeArgs(["--base", "x", "--scope", "full"])).toEqual({
      ok: true,
      scope: "full",
      base: "x",
      rest: [],
    })
  })

  it("leaves out what was not given", () => {
    const onlyBase = parseScopeArgs(["--base", "x"])
    expect(onlyBase).not.toHaveProperty("scope")
    const onlyScope = parseScopeArgs(["--scope", "full"])
    expect(onlyScope).not.toHaveProperty("base")
  })

  it("names the flag that was repeated", () => {
    expect(parseScopeArgs(["--base", "a", "--base", "b"])).toEqual({
      ok: false,
      error: "--base was given more than once.",
    })
  })
})

describe("an empty GITHUB_EVENT_NAME", () => {
  it("is no event: a local run narrows, a CI run without an event does not", () => {
    expect(resolveScope({ env: { GITHUB_EVENT_NAME: "" } })).toMatchObject({
      scope: "affected",
      source: "default",
    })
    expect(resolveScope({ env: { GITHUB_EVENT_NAME: "", CI: "true" } })).toMatchObject({
      scope: "full",
      reason: "CI is set but no pull request is known, so the whole tree is validated",
    })
  })
})

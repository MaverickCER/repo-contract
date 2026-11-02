import { describe, expect, it } from "vitest"
import { parseFailFastArgs, resolveFailFast } from "../../../src/affected/fail-fast.js"

describe("parseFailFastArgs", () => {
  it("leaves the arguments alone when there is no flag", () => {
    expect(parseFailFastArgs(["lint", "--scope", "full"])).toEqual({
      rest: ["lint", "--scope", "full"],
    })
  })

  it("reads --fail-fast and --no-fail-fast and removes them", () => {
    expect(parseFailFastArgs(["--fail-fast", "lint"])).toEqual({ failFast: true, rest: ["lint"] })
    expect(parseFailFastArgs(["lint", "--no-fail-fast"])).toEqual({
      failFast: false,
      rest: ["lint"],
    })
  })

  it("lets the last flag win", () => {
    expect(parseFailFastArgs(["--fail-fast", "--no-fail-fast"])).toEqual({
      failFast: false,
      rest: [],
    })
    expect(parseFailFastArgs(["--no-fail-fast", "--fail-fast"])).toEqual({
      failFast: true,
      rest: [],
    })
  })

  it("stops at the -- terminator and leaves what follows untouched", () => {
    expect(parseFailFastArgs(["--", "--fail-fast"])).toEqual({ rest: ["--", "--fail-fast"] })
    expect(parseFailFastArgs(["--fail-fast", "--", "--no-fail-fast"])).toEqual({
      failFast: true,
      rest: ["--", "--no-fail-fast"],
    })
  })
})

describe("resolveFailFast", () => {
  it("is off by default, in CI and locally", () => {
    expect(resolveFailFast({ env: {} })).toBe(false)
    expect(resolveFailFast({ env: { CI: "true", GITHUB_ACTIONS: "true" } })).toBe(false)
  })

  it.each(["1", "true", "TRUE", "yes", "on"])(
    "is turned on by REPO_CONTRACT_FAIL_FAST=%s",
    (value) => {
      expect(resolveFailFast({ env: { REPO_CONTRACT_FAIL_FAST: value } })).toBe(true)
    },
  )

  it.each(["0", "false", "no", "off", "", "maybe"])(
    "stays off for REPO_CONTRACT_FAIL_FAST=%j",
    (value) => {
      expect(resolveFailFast({ env: { REPO_CONTRACT_FAIL_FAST: value } })).toBe(false)
    },
  )

  it("lets an explicit flag win over the environment, both ways", () => {
    expect(resolveFailFast({ flag: false, env: { REPO_CONTRACT_FAIL_FAST: "1" } })).toBe(false)
    expect(resolveFailFast({ flag: true, env: { REPO_CONTRACT_FAIL_FAST: "0" } })).toBe(true)
  })

  it("never turns on for a release", () => {
    expect(resolveFailFast({ flag: true, env: { CI_FULL: "1" } })).toBe(false)
    expect(
      resolveFailFast({ env: { REPO_CONTRACT_FAIL_FAST: "1", GITHUB_EVENT_NAME: "release" } }),
    ).toBe(false)
    expect(
      resolveFailFast({ env: { REPO_CONTRACT_FAIL_FAST: "1", GITHUB_REF: "refs/tags/v1.0.0" } }),
    ).toBe(false)
  })
})

describe("release detection is case-insensitive and exact", () => {
  it.each(["TRUE", "Yes", "ON", "1"])("treats CI_FULL=%s as a release", (value) => {
    expect(resolveFailFast({ flag: true, env: { CI_FULL: value } })).toBe(false)
  })

  it("does not treat an unset or unrelated CI_FULL as a release", () => {
    expect(resolveFailFast({ flag: true, env: {} })).toBe(true)
    expect(resolveFailFast({ flag: true, env: { CI_FULL: "0" } })).toBe(true)
    expect(resolveFailFast({ flag: true, env: { GITHUB_REF: "refs/heads/main" } })).toBe(true)
    expect(resolveFailFast({ flag: true, env: { GITHUB_EVENT_NAME: "pull_request" } })).toBe(true)
  })
})

import { describe, expect, it } from "vitest"
import {
  coverageRecognizer,
  eslintRecognizer,
  prettierRecognizer,
  recognizeSuppression,
  strykerRecognizer,
  typescriptRecognizer,
} from "../../../scripts/suppression-governance/recognizers.js"

describe("eslintRecognizer", () => {
  it("recognizes eslint-disable-next-line with a single rule", () => {
    expect(eslintRecognizer("eslint-disable-next-line no-console")).toEqual({
      domain: "eslint",
      rule: ["no-console"],
      reason: "",
    })
  })

  it("recognizes eslint-disable-line", () => {
    expect(eslintRecognizer("eslint-disable-line no-console")).toEqual({
      domain: "eslint",
      rule: ["no-console"],
      reason: "",
    })
  })

  it("recognizes bare eslint-disable (block form)", () => {
    expect(eslintRecognizer("eslint-disable no-console")).toEqual({
      domain: "eslint",
      rule: ["no-console"],
      reason: "",
    })
  })

  it("recognizes multiple comma-separated rules", () => {
    expect(eslintRecognizer("eslint-disable-next-line no-console, no-alert")).toEqual({
      domain: "eslint",
      rule: ["no-console", "no-alert"],
      reason: "",
    })
  })

  it("recognizes multiple rules across canonicalized multiline content", () => {
    expect(
      eslintRecognizer(
        "eslint-disable security/detect-object-injection\nsecurity/detect-unsafe-regex",
      ),
    ).toEqual({
      domain: "eslint",
      rule: ["security/detect-object-injection", "security/detect-unsafe-regex"],
      reason: "",
    })
  })

  it("stops the rule list at a '--' description marker and captures the trailing prose as reason", () => {
    expect(
      eslintRecognizer("eslint-disable-next-line no-console -- this is a human explanation"),
    ).toEqual({ domain: "eslint", rule: ["no-console"], reason: "this is a human explanation" })
  })

  it('represents a rule-less directive (disables everything) as rule: ["*"]', () => {
    expect(eslintRecognizer("eslint-disable-next-line")).toEqual({
      domain: "eslint",
      rule: ["*"],
      reason: "",
    })
    expect(eslintRecognizer("eslint-disable-next-line -- reason")).toEqual({
      domain: "eslint",
      rule: ["*"],
      reason: "reason",
    })
  })

  it("does not recognize eslint-enable as a suppression", () => {
    expect(eslintRecognizer("eslint-enable no-console")).toBeUndefined()
  })

  it("does not recognize unrelated text", () => {
    expect(eslintRecognizer("just a normal comment")).toBeUndefined()
  })

  it("returns undefined for a separator-only rule list that parses to no rules", () => {
    expect(eslintRecognizer("eslint-disable-next-line ,")).toBeUndefined()
  })
})

describe("typescriptRecognizer", () => {
  it("recognizes @ts-ignore", () => {
    expect(typescriptRecognizer("@ts-ignore")).toEqual({
      domain: "typescript",
      rule: ["@ts-ignore"],
      reason: "",
    })
  })

  it("recognizes @ts-expect-error, including a trailing reason", () => {
    expect(typescriptRecognizer("@ts-expect-error legacy API")).toEqual({
      domain: "typescript",
      rule: ["@ts-expect-error"],
      reason: "legacy API",
    })
  })

  it("recognizes @ts-nocheck", () => {
    expect(typescriptRecognizer("@ts-nocheck")).toEqual({
      domain: "typescript",
      rule: ["@ts-nocheck"],
      reason: "",
    })
  })

  it("does not recognize unrelated text", () => {
    expect(typescriptRecognizer("@ts-check")).toBeUndefined()
  })

  it("does not recognize a directive-like identifier that merely starts with @ts-ignore", () => {
    expect(typescriptRecognizer("@ts-ignore-something-else")).toBeUndefined()
  })
})

describe("prettierRecognizer", () => {
  it("recognizes prettier-ignore", () => {
    expect(prettierRecognizer("prettier-ignore")).toEqual({
      domain: "prettier",
      rule: ["prettier-ignore"],
      reason: "",
    })
  })

  it("recognizes prettier-ignore with a trailing reason", () => {
    expect(prettierRecognizer("prettier-ignore -- keeps this table hand-aligned")).toEqual({
      domain: "prettier",
      rule: ["prettier-ignore"],
      reason: "-- keeps this table hand-aligned",
    })
  })

  it("does not recognize unrelated text", () => {
    expect(prettierRecognizer("prettier-ignore-start")).toBeUndefined()
  })
})

describe("coverageRecognizer", () => {
  it("recognizes v8, c8 and istanbul ignore directives as the coverage domain", () => {
    expect(coverageRecognizer("v8 ignore start")).toEqual({
      domain: "coverage",
      rule: ["v8-ignore-start"],
      reason: "",
    })
    expect(coverageRecognizer("c8 ignore next")).toEqual({
      domain: "coverage",
      rule: ["c8-ignore-next"],
      reason: "",
    })
    expect(coverageRecognizer("istanbul ignore if")).toEqual({
      domain: "coverage",
      rule: ["istanbul-ignore-if"],
      reason: "",
    })
  })

  it("keeps the author's reason after the directive", () => {
    expect(
      coverageRecognizer("v8 ignore start -- Windows-only; exercised on the CI Windows runner"),
    ).toEqual({
      domain: "coverage",
      rule: ["v8-ignore-start"],
      reason: "Windows-only; exercised on the CI Windows runner",
    })
  })

  it("keeps a reason written without the separator, and has none for a bare separator", () => {
    expect(coverageRecognizer("c8 ignore next because the branch is Windows-only")?.reason).toBe(
      "because the branch is Windows-only",
    )
    expect(coverageRecognizer("istanbul ignore else --")?.reason).toBe("")
    expect(coverageRecognizer("v8 ignore next")?.reason).toBe("")
  })

  it("does not treat the stop marker, or unrelated text, as a suppression", () => {
    expect(coverageRecognizer("v8 ignore stop")).toBeUndefined()
    expect(coverageRecognizer("v8 ignores nothing")).toBeUndefined()
    expect(coverageRecognizer("ignore start")).toBeUndefined()
  })

  it("is reached through recognizeSuppression", () => {
    expect(recognizeSuppression("v8 ignore file")?.rule).toEqual(["v8-ignore-file"])
  })
})

describe("coverageRecognizer line counts", () => {
  it("treats the line count of `ignore next N` as part of the directive, not the reason", () => {
    expect(coverageRecognizer("c8 ignore next 3 -- three lines of platform fallback")).toEqual({
      domain: "coverage",
      rule: ["c8-ignore-next"],
      reason: "three lines of platform fallback",
    })
    expect(coverageRecognizer("v8 ignore next 2")).toEqual({
      domain: "coverage",
      rule: ["v8-ignore-next"],
      reason: "",
    })
  })
})

describe("strykerRecognizer", () => {
  it("ends the mutator list at Stryker's own colon, keeping everything after it as the reason", () => {
    expect(
      strykerRecognizer(
        "Stryker disable next-line Regex: equivalent -- the anchors are only precision",
      ),
    ).toEqual({
      domain: "stryker",
      rule: ["Regex"],
      reason: "equivalent -- the anchors are only precision",
    })
    expect(strykerRecognizer("Stryker disable StringLiteral,ObjectLiteral: a reason")).toEqual({
      domain: "stryker",
      rule: ["StringLiteral", "ObjectLiteral"],
      reason: "a reason",
    })
    // A colon inside the reason of a `--` directive does not cut the list.
    expect(strykerRecognizer("Stryker disable next-line all -- see: the note")).toEqual({
      domain: "stryker",
      rule: ["all"],
      reason: "see: the note",
    })
  })

  it("recognizes a specific-mutator next-line disable with a reason", () => {
    expect(
      strykerRecognizer("Stryker disable next-line ConditionalExpression -- unreachable branch"),
    ).toEqual({ domain: "stryker", rule: ["ConditionalExpression"], reason: "unreachable branch" })
  })

  it("recognizes a comma-separated multi-mutator disable with a reason", () => {
    expect(
      strykerRecognizer(
        "Stryker disable next-line ConditionalExpression,StringLiteral -- both are equivalence-checked together",
      ),
    ).toEqual({
      domain: "stryker",
      rule: ["ConditionalExpression", "StringLiteral"],
      reason: "both are equivalence-checked together",
    })
  })

  it("recognizes the block (non next-line) form", () => {
    expect(strykerRecognizer("Stryker disable ConditionalExpression -- reason")).toEqual({
      domain: "stryker",
      rule: ["ConditionalExpression"],
      reason: "reason",
    })
  })

  it('recognizes a bare "all" disable as rule: ["all"], not rule: ["*"]', () => {
    expect(strykerRecognizer("Stryker disable next-line all -- reason")).toEqual({
      domain: "stryker",
      rule: ["all"],
      reason: "reason",
    })
  })

  it("returns an empty string reason, not undefined, when no '--' is present", () => {
    expect(strykerRecognizer("Stryker disable next-line ConditionalExpression")).toEqual({
      domain: "stryker",
      rule: ["ConditionalExpression"],
      reason: "",
    })
  })

  it("does not recognize Stryker restore as a suppression", () => {
    expect(strykerRecognizer("Stryker restore all")).toBeUndefined()
  })

  it("does not recognize unrelated text", () => {
    expect(strykerRecognizer("just a normal comment")).toBeUndefined()
  })
})

describe("recognizeSuppression", () => {
  it("tries every recognizer in order and returns the first match", () => {
    expect(recognizeSuppression("@ts-ignore")).toEqual({
      domain: "typescript",
      rule: ["@ts-ignore"],
      reason: "",
    })
    expect(recognizeSuppression("eslint-disable-next-line no-console")).toEqual({
      domain: "eslint",
      rule: ["no-console"],
      reason: "",
    })
    expect(
      recognizeSuppression("Stryker disable next-line ConditionalExpression -- reason"),
    ).toEqual({ domain: "stryker", rule: ["ConditionalExpression"], reason: "reason" })
  })

  it("returns undefined for an ordinary, non-suppression comment", () => {
    expect(recognizeSuppression("this explains why the code below works")).toBeUndefined()
  })
})

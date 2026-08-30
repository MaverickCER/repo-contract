import { describe, expect, it } from "vitest"
import {
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

describe("strykerRecognizer", () => {
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

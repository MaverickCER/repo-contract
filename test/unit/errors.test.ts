import { describe, expect, it } from "vitest"
import {
  DependencyDeclaredLaterError,
  InvalidCheckConfigError,
  InvalidRepoContractConfigError,
  ParserDependencyMissingError,
  PolicyReadFailedParseValueError,
  PolicyReadUnrequestedOutputError,
  PolicyThrewError,
  RepoContractError,
  UnknownCheckIdError,
} from "../../src/errors.js"

describe("error hierarchy", () => {
  it("every concrete error extends RepoContractError and Error", () => {
    const errors = [
      new InvalidRepoContractConfigError("reason"),
      new InvalidCheckConfigError("check-id", "reason"),
      new ParserDependencyMissingError("check-id", "yaml", new Error("boom")),
      new PolicyThrewError("check-id", new Error("boom")),
      new PolicyReadUnrequestedOutputError("check-id", "value", new TypeError("boom")),
      new PolicyReadFailedParseValueError("check-id", "score", new TypeError("boom")),
      new UnknownCheckIdError("check-id"),
      new DependencyDeclaredLaterError("check-id", "dep-id"),
    ]
    for (const error of errors) {
      expect(error).toBeInstanceOf(RepoContractError)
      expect(error).toBeInstanceOf(Error)
    }
  })

  it("each error class has a distinct, stable code", () => {
    expect(new InvalidRepoContractConfigError("x").code).toBe("REPO_CONTRACT_INVALID_CONFIG")
    expect(new InvalidCheckConfigError("id", "x").code).toBe("REPO_CONTRACT_INVALID_CHECK_CONFIG")
    expect(new ParserDependencyMissingError("id", "yaml", undefined).code).toBe(
      "REPO_CONTRACT_PARSER_DEPENDENCY_MISSING",
    )
    expect(new PolicyThrewError("id", undefined).code).toBe("REPO_CONTRACT_POLICY_THREW")
    expect(new PolicyReadUnrequestedOutputError("id", "value", undefined).code).toBe(
      "REPO_CONTRACT_POLICY_READ_UNREQUESTED_OUTPUT",
    )
    expect(new PolicyReadFailedParseValueError("id", "score", undefined).code).toBe(
      "REPO_CONTRACT_POLICY_READ_FAILED_PARSE_VALUE",
    )
    expect(new UnknownCheckIdError("id").code).toBe("REPO_CONTRACT_UNKNOWN_CHECK_ID")
    expect(new DependencyDeclaredLaterError("id", "dep-id").code).toBe(
      "REPO_CONTRACT_DEPENDENCY_DECLARED_LATER",
    )
  })

  it("codes are unique across the whole hierarchy", () => {
    const codes = [
      new InvalidRepoContractConfigError("x").code,
      new InvalidCheckConfigError("id", "x").code,
      new ParserDependencyMissingError("id", "yaml", undefined).code,
      new PolicyThrewError("id", undefined).code,
      new PolicyReadUnrequestedOutputError("id", "value", undefined).code,
      new PolicyReadFailedParseValueError("id", "score", undefined).code,
      new UnknownCheckIdError("id").code,
      new DependencyDeclaredLaterError("id", "dep-id").code,
    ]
    expect(new Set(codes).size).toBe(codes.length)
  })

  it("each error class sets .name to its own exact class name (not the generic 'Error')", () => {
    expect(new InvalidRepoContractConfigError("x").name).toBe("InvalidRepoContractConfigError")
    expect(new InvalidCheckConfigError("id", "x").name).toBe("InvalidCheckConfigError")
    expect(new ParserDependencyMissingError("id", "yaml", undefined).name).toBe(
      "ParserDependencyMissingError",
    )
    expect(new PolicyThrewError("id", undefined).name).toBe("PolicyThrewError")
    expect(new PolicyReadUnrequestedOutputError("id", "value", undefined).name).toBe(
      "PolicyReadUnrequestedOutputError",
    )
    expect(new PolicyReadFailedParseValueError("id", "score", undefined).name).toBe(
      "PolicyReadFailedParseValueError",
    )
    expect(new UnknownCheckIdError("id").name).toBe("UnknownCheckIdError")
    expect(new DependencyDeclaredLaterError("id", "dep-id").name).toBe(
      "DependencyDeclaredLaterError",
    )
  })

  describe("InvalidRepoContractConfigError", () => {
    it("message is exactly the fixed prefix plus the given reason", () => {
      expect(new InvalidRepoContractConfigError("checks must be an object.").message).toBe(
        "Invalid repo-contract config -- checks must be an object.",
      )
    })
  })

  describe("InvalidCheckConfigError", () => {
    it("carries the offending checkId", () => {
      const error = new InvalidCheckConfigError("my-check", "run is empty")
      expect(error.checkId).toBe("my-check")
    })

    it("message is exactly the fixed prefix (with checkId) plus the given reason", () => {
      const error = new InvalidCheckConfigError("my-check", "run must be a string.")
      expect(error.message).toBe('Invalid check config for "my-check" -- run must be a string.')
    })

    it("never embeds raw values -- only the checkId and a developer-authored reason", () => {
      const secretLikeReason = "run must be a string"
      const error = new InvalidCheckConfigError("my-check", secretLikeReason)
      expect(error.message).toContain("my-check")
      expect(error.message).toContain(secretLikeReason)
    })
  })

  describe("ParserDependencyMissingError", () => {
    it("carries checkId and format, and preserves the original failure as cause", () => {
      const cause = new Error("Cannot find module 'yaml'")
      const error = new ParserDependencyMissingError("mutation", "yaml", cause)
      expect(error.checkId).toBe("mutation")
      expect(error.format).toBe("yaml")
      expect(error.cause).toBe(cause)
    })

    it("message names the check, the format, and the exact install command", () => {
      const error = new ParserDependencyMissingError("mutation", "yaml", undefined)
      expect(error.message).toBe(
        'Check "mutation" requested output.format: "yaml", but the optional "yaml" peer ' +
          "dependency is not installed -- run `npm install yaml` to enable it.",
      )
    })
  })

  describe("PolicyThrewError", () => {
    it("carries checkId and preserves the original thrown value verbatim as cause", () => {
      const cause = new TypeError("cannot read property 'score' of undefined")
      const error = new PolicyThrewError("mutation", cause)
      expect(error.checkId).toBe("mutation")
      expect(error.cause).toBe(cause)
    })

    it("preserves a non-Error thrown value as cause without wrapping it", () => {
      const error = new PolicyThrewError("mutation", "a string throw")
      expect(error.cause).toBe("a string throw")
    })

    it("message is exact and identifies which check's policy failed", () => {
      const error = new PolicyThrewError("mutation", new Error("boom"))
      expect(error.message).toBe(
        'Policy for check "mutation" threw instead of returning a PolicyResult',
      )
    })
  })

  describe("PolicyReadUnrequestedOutputError", () => {
    it("carries checkId and preserves the original TypeError verbatim as cause", () => {
      const cause = new TypeError("Cannot read properties of undefined (reading 'value')")
      const error = new PolicyReadUnrequestedOutputError("mutation", "value", cause)
      expect(error.checkId).toBe("mutation")
      expect(error.cause).toBe(cause)
    })

    it("message names the check and the read property, and tells the user to add output.format", () => {
      const error = new PolicyReadUnrequestedOutputError("mutation", "value", undefined)
      expect(error.message).toContain('Policy for check "mutation" read `result.output.value`')
      expect(error.message).toContain("never requested an output format")
      expect(error.message).toContain('output: { format: "json" }')
    })

    it("is not the same class as PolicyThrewError -- a consumer can tell the two apart", () => {
      const error = new PolicyReadUnrequestedOutputError("id", "value", undefined)
      expect(error).not.toBeInstanceOf(PolicyThrewError)
    })
  })

  describe("PolicyReadFailedParseValueError", () => {
    it("carries checkId and preserves the original TypeError verbatim as cause", () => {
      const cause = new TypeError("Cannot read properties of undefined (reading 'score')")
      const error = new PolicyReadFailedParseValueError("mutation", "score", cause)
      expect(error.checkId).toBe("mutation")
      expect(error.cause).toBe(cause)
    })

    it("message names the check and the read property, and tells the user to check result.output.success", () => {
      const error = new PolicyReadFailedParseValueError("mutation", "score", undefined)
      expect(error.message).toContain(
        'Policy for check "mutation" read `result.output.value.score`',
      )
      expect(error.message).toContain("output failed to parse")
      expect(error.message).toContain("check `result.output.success`")
    })

    it("never repeats the parse failure's own text -- result.output.error may contain raw stdout content", () => {
      const parseFailureText = "Unexpected token 'x', \"xxx not json\" is not valid JSON"
      const error = new PolicyReadFailedParseValueError(
        "mutation",
        "score",
        new TypeError(parseFailureText),
      )
      expect(error.message).not.toContain(parseFailureText)
    })

    it("is not the same class as PolicyThrewError or PolicyReadUnrequestedOutputError", () => {
      const error = new PolicyReadFailedParseValueError("id", "score", undefined)
      expect(error).not.toBeInstanceOf(PolicyThrewError)
      expect(error).not.toBeInstanceOf(PolicyReadUnrequestedOutputError)
    })
  })

  describe("UnknownCheckIdError", () => {
    it("carries the offending checkId", () => {
      const error = new UnknownCheckIdError("nonexistent")
      expect(error.checkId).toBe("nonexistent")
    })

    it("message is exact and names the unrecognized id", () => {
      const error = new UnknownCheckIdError("nonexistent")
      expect(error.message).toBe(
        'options.checks names "nonexistent", which is not a check id in this config\'s checks object.',
      )
    })
  })

  describe("DependencyDeclaredLaterError", () => {
    it("carries the declaring checkId and the later-declared dependencyId", () => {
      const error = new DependencyDeclaredLaterError("a", "b")
      expect(error.checkId).toBe("a")
      expect(error.dependencyId).toBe("b")
    })

    it("message is exact and names both the declaring check and the forward-referenced dependency", () => {
      const error = new DependencyDeclaredLaterError("a", "b")
      expect(error.message).toBe(
        'Invalid check config for "a" -- dependsOn: ["b"], but "b" is declared later in the ' +
          "checks object. dependsOn may only reference a check declared earlier -- reorder the " +
          'checks object so "b" is declared before "a".',
      )
    })
  })
})

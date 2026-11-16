import { describe, it } from "vitest"

describe("R2x v2 exception record", () => {
  it.todo(
    "EXCEPTION_TYPES holds the eight types, required-for-package-to-exist and dev-only-not-shipped included",
  )
  it.todo(
    "EXCEPTION_METHODS holds mechanical-reverification, independent-human-review and policy-rule",
  )
  it.todo("emptyV2Fields returns every v2 field blank")
  it.todo("isLegacyRecord is true only for version 1")
  it.todo("isExpired is false for an empty expires and for today")
  it.todo("isExpired is true for a date strictly before now")
  it.todo("isExpired is false for an invalid date")
  it.todo("validateExceptionRegistry rejects a non-array")
  it.todo("validateExceptionRegistry rejects an id outside the namespace")
  it.todo("validateExceptionRegistry rejects an unknown key and names the permitted ones")
  it.todo("validateExceptionRegistry rejects a duplicate id")
  it.todo("validateExceptionRegistry rejects a version other than 1 or 2")
  it.todo("validateExceptionRegistry requires every v2 field and expires on a version 2 record")
  it.todo("validateExceptionRegistry rejects expires 2027-02-30")
  it.todo("validateExceptionRegistry reports every problem in one pass")
  it.todo("validateExceptionRegistry accepts a blank stub")
  it.todo("exceptionRegistryStandardSchema returns value on success and issues on failure")
  it.todo(
    "validateSecurityExceptionFields rejects validated-false-positive with independent-human-review",
  )
  it.todo("validateSecurityExceptionFields rejects a type outside the allowed list")
  it.todo("recordFieldValue answers LEGACY_FIELD_VALUE for a v2 field of a version 1 record")
  it.todo("recordFieldValue answers empty for a missing field of a version 2 record")
  it.todo("evaluateFindingVerdict returns unmatched for an undefined record")
  it.todo("isValidNonEmptyStringField pushes a message for an empty string")
})

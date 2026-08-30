import { describe, expect, it } from "vitest"
import { parse as shellQuoteParse } from "shell-quote"
import { tokenizeRunString } from "../../../src/config/tokenize-command.js"
import { InvalidCheckConfigError } from "../../../src/errors.js"

describe("tokenizeRunString", () => {
  it("splits on unquoted whitespace", () => {
    expect(tokenizeRunString("eslint . --format json", "lint")).toEqual([
      "eslint",
      ".",
      "--format",
      "json",
    ])
  })

  it("collapses runs of whitespace between tokens", () => {
    expect(tokenizeRunString("eslint    .", "lint")).toEqual(["eslint", "."])
  })

  it("groups a single-quoted argument into one token, stripping the quotes", () => {
    expect(tokenizeRunString("echo 'hello world'", "echo")).toEqual(["echo", "hello world"])
  })

  it("groups a double-quoted argument into one token, stripping the quotes", () => {
    expect(tokenizeRunString('echo "hello world"', "echo")).toEqual(["echo", "hello world"])
  })

  it("treats a backslash as an escape unquoted and inside double quotes", () => {
    expect(tokenizeRunString('echo "a\\"b"', "echo")).toEqual(["echo", 'a"b'])
    expect(tokenizeRunString("echo a\\ b", "echo")).toEqual(["echo", "a b"])
  })

  it("treats a backslash as a literal inside single quotes, like every POSIX shell", () => {
    expect(tokenizeRunString("tool 'C:\\path\\to\\thing'", "t")).toEqual([
      "tool",
      "C:\\path\\to\\thing",
    ])
    // A single-quoted span still ends only at the closing quote -- the
    // backslash never escapes it.
    expect(tokenizeRunString("tool 'a\\'", "t")).toEqual(["tool", "a\\"])
  })

  it("treats a trailing backslash with nothing left to escape as a literal backslash", () => {
    expect(tokenizeRunString("echo a\\", "echo")).toEqual(["echo", "a\\"])
  })

  it("does not expand glob characters -- they round-trip as literal argv content", () => {
    expect(tokenizeRunString('eslint "src/**/*.ts"', "lint")).toEqual(["eslint", "src/**/*.ts"])
    expect(tokenizeRunString("eslint src/**/*.ts", "lint")).toEqual(["eslint", "src/**/*.ts"])
  })

  it("does not treat brace/bracket/tilde glob-adjacent characters as operators", () => {
    expect(tokenizeRunString("tool --pattern={a,b} ~/file [x]", "tool")).toEqual([
      "tool",
      "--pattern={a,b}",
      "~/file",
      "[x]",
    ])
  })

  it("does not reject a bare $ (only $( command substitution is rejected)", () => {
    expect(tokenizeRunString("grep $100 file.txt", "grep")).toEqual(["grep", "$100", "file.txt"])
  })

  it("is deterministic -- the same input always produces the same output", () => {
    const input = 'npm run test -- --grep="foo bar" --watch=false'
    expect(tokenizeRunString(input, "tests")).toEqual(tokenizeRunString(input, "tests"))
  })

  it("returns the identical array shape for string-form vs. equivalent array-form intent", () => {
    expect(tokenizeRunString("node -e console.log(1)", "x")).toEqual([
      "node",
      "-e",
      "console.log(1)",
    ])
  })

  const operatorCases: readonly { readonly label: string; readonly input: string }[] = [
    { label: ";", input: "echo a; echo b" },
    { label: "&", input: "echo a & echo b" },
    { label: "|", input: "echo a | grep a" },
    { label: "`", input: "echo `whoami`" },
    { label: "$(", input: "echo $(whoami)" },
    { label: "<", input: "cat < file.txt" },
    { label: ">", input: "echo a > file.txt" },
    { label: "newline", input: "echo a\necho b" },
    // A lone carriage return (no accompanying \n) exercises the "\r" branch
    // of the newline check independently of the "\n" branch above.
    { label: "newline", input: "echo a\recho b" },
    // A backslash before a newline is a shell line-continuation: rejected too,
    // rather than consumed as an escape that would splice a literal newline in.
    { label: "newline", input: "echo a\\\necho b" },
    { label: "newline", input: "echo a\\\recho b" },
  ]

  it.each(operatorCases)(
    "rejects an unquoted $label operator with that operator named in the message",
    ({ input, label }) => {
      try {
        tokenizeRunString(input, "check-id")
        expect.unreachable(`expected tokenizeRunString to throw for: ${input}`)
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidCheckConfigError)
        expect((error as Error).message).toContain(`unquoted "${label}"`)
      }
    },
  )

  it("includes the checkId and a corrective suggestion in the rejection message", () => {
    try {
      tokenizeRunString("echo a && echo b", "my-check")
      expect.unreachable("expected tokenizeRunString to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCheckConfigError)
      const invalidCheckError = error as InvalidCheckConfigError
      expect(invalidCheckError.checkId).toBe("my-check")
      expect(invalidCheckError.message).toContain("shell: true")
      expect(invalidCheckError.message).toContain("run: [")
      expect(invalidCheckError.message).toContain("real shell execution")
    }
  })

  it("treats an escaped operator character as the first character of a token as a literal, not a rejection", () => {
    expect(tokenizeRunString("echo \\;", "echo")).toEqual(["echo", ";"])
  })

  it("rejects an empty string with a precise message", () => {
    expect(() => tokenizeRunString("", "check-id")).toThrow(
      "run string is empty or contains only whitespace.",
    )
  })

  it("rejects a whitespace-only string with the same precise message", () => {
    expect(() => tokenizeRunString("   \t  ", "check-id")).toThrow(
      "run string is empty or contains only whitespace.",
    )
  })

  it("rejects an unterminated single quote with a precise message naming the quote character", () => {
    expect(() => tokenizeRunString("echo 'unterminated", "check-id")).toThrow(
      "run string has an unterminated ' quote.",
    )
  })

  it("rejects an unterminated double quote with a precise message naming the quote character", () => {
    expect(() => tokenizeRunString('echo "unterminated', "check-id")).toThrow(
      'run string has an unterminated " quote.',
    )
  })

  describe("fuzz corpus generated via shell-quote (used only as a source of varied input strings, never as an equivalence oracle -- see the runtime-dependency rationale in the implementation plan)", () => {
    const corpus = [
      "npm run build",
      "eslint . --max-warnings 0",
      'echo "quoted arg"',
      "prettier --check src/**/*.ts",
      "vitest run --reporter=json",
      "node -e \"console.log('ok')\"",
      "tool --flag=value --other='single quoted'",
    ]

    it.each(corpus)(
      "either tokenizes to a non-empty argv or throws InvalidCheckConfigError: %s",
      (input) => {
        // shell-quote is used here only to confirm the corpus itself is
        // realistic/varied shell-shaped input -- its own parse result is
        // never compared against tokenizeRunString's output.
        expect(() => shellQuoteParse(input)).not.toThrow()

        let result: readonly string[] | undefined
        let threw = false
        try {
          result = tokenizeRunString(input, "fuzz")
        } catch (error) {
          threw = true
          expect(error).toBeInstanceOf(InvalidCheckConfigError)
        }
        if (!threw) {
          expect(result).toBeDefined()
          expect(result?.length).toBeGreaterThan(0)
        }
      },
    )
  })
})

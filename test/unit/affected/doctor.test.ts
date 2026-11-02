import { describe, expect, it } from "vitest"
import { diagnose, planFixes } from "../../../src/affected/doctor.js"
import type { DoctorSnapshot } from "../../../src/affected/doctor.js"

const healthy: DoctorSnapshot = {
  gitignore: "node_modules\n.repo-contract/cache/\n",
  vitestConfigs: [{ path: "vitest.config.ts", text: 'coverage: { reporter: ["text", "json"] }' }],
  workflows: [
    {
      path: ".github/workflows/ci.yml",
      text: "steps:\n  - uses: actions/checkout@v4\n    with:\n      fetch-depth: 0\n  - run: npm run contract\n",
    },
  ],
  hooksInstalled: true,
  starExportFiles: [],
}

const ids = (snapshot: DoctorSnapshot): string[] => diagnose(snapshot).findings.map((f) => f.id)

describe("diagnose", () => {
  it("finds nothing wrong with a healthy repository", () => {
    expect(diagnose(healthy)).toEqual({ clean: true, findings: [] })
  })

  describe("cache-not-ignored", () => {
    it.each([
      [undefined],
      [""],
      ["node_modules\n"],
      [".repo-contract/*\n"],
      ["# .repo-contract/cache/\n"],
      [".repo-contract/cache-old/\n"],
    ])("flags a .gitignore of %j", (gitignore) => {
      expect(ids({ ...healthy, gitignore })).toEqual(["cache-not-ignored"])
    })

    it.each([
      [".repo-contract/cache\n"],
      [".repo-contract/cache/\n"],
      ["/.repo-contract/cache\n"],
      ["/.repo-contract/cache/\n"],
      ["a\r\n.repo-contract/cache/\r\n"],
      ["  .repo-contract/cache/  \n"],
    ])("accepts a .gitignore of %j", (gitignore) => {
      expect(ids({ ...healthy, gitignore })).toEqual([])
    })

    it("offers the one safe fix: append the rule", () => {
      const finding = diagnose({ ...healthy, gitignore: "node_modules\n" }).findings[0]
      expect(finding?.fix).toEqual({ file: ".gitignore", append: ".repo-contract/cache/\n" })
      expect(finding?.severity).toBe("warn")
    })
  })

  describe("coverage-json-reporter", () => {
    it("flags a vitest config that configures coverage without the json reporter", () => {
      const snapshot = {
        ...healthy,
        vitestConfigs: [{ path: "vitest.config.ts", text: 'coverage: { reporter: ["text"] }' }],
      }
      const [finding] = diagnose(snapshot).findings
      expect(finding).toMatchObject({ id: "coverage-json-reporter", severity: "warn" })
      expect(finding?.message).toContain("vitest.config.ts")
      expect(finding).not.toHaveProperty("fix")
    })

    it("accepts single quotes and backticks around json", () => {
      for (const quote of ["'", "`"]) {
        const text = `coverage: { reporter: [${quote}json${quote}] }`
        expect(ids({ ...healthy, vitestConfigs: [{ path: "v.ts", text }] })).toEqual([])
      }
    })

    it("does not judge a config that mentions coverage but sets no reporter, such as a shared base", () => {
      const text = "coverage: { thresholds: { lines: 100 } }"
      expect(ids({ ...healthy, vitestConfigs: [{ path: "vitest.base.config.ts", text }] })).toEqual(
        [],
      )
    })

    it("does not mistake a test reporter for the coverage reporter", () => {
      const text = 'test: { reporter: ["default"] }, coverage: { reporter: ["json"] }'
      expect(ids({ ...healthy, vitestConfigs: [{ path: "v.ts", text }] })).toEqual([])
    })

    it("ignores configs that do not mention coverage, and repositories with no config", () => {
      expect(ids({ ...healthy, vitestConfigs: [{ path: "v.ts", text: "test: {}" }] })).toEqual([])
      expect(ids({ ...healthy, vitestConfigs: [] })).toEqual([])
    })

    it("names every config that lacks it", () => {
      const text = "coverage: { reporter: ['text'] }"
      const found = diagnose({
        ...healthy,
        vitestConfigs: [
          { path: "a/vitest.config.ts", text },
          { path: "b/vitest.config.ts", text },
        ],
      }).findings
      expect(found.map((f) => f.message.includes("a/") || f.message.includes("b/"))).toEqual([
        true,
        true,
      ])
    })
  })

  describe("checkout-shallow", () => {
    const workflow = (text: string) => ({
      ...healthy,
      workflows: [{ path: ".github/workflows/ci.yml", text }],
    })

    it("flags a workflow that runs the contract after a default shallow checkout", () => {
      const [finding] = diagnose(
        workflow("steps:\n  - uses: actions/checkout@v4\n  - run: npm run contract\n"),
      ).findings
      expect(finding).toMatchObject({ id: "checkout-shallow", severity: "warn" })
      expect(finding?.message).toContain(".github/workflows/ci.yml")
    })

    it("accepts fetch-depth: 0 in either spacing", () => {
      for (const depth of [
        "fetch-depth: 0",
        "fetch-depth:   0",
        "fetch-depth: '0'",
        'fetch-depth: "0"',
      ]) {
        expect(
          ids(
            workflow(
              `- uses: actions/checkout@v4\n  with:\n    ${depth}\n- run: npm run contract\n`,
            ),
          ),
        ).toEqual([])
      }
    })

    it("flags a depth other than 0", () => {
      expect(
        ids(
          workflow(
            "- uses: actions/checkout@v4\n  with:\n    fetch-depth: 1\n- run: npm run contract\n",
          ),
        ),
      ).toEqual(["checkout-shallow"])
    })

    it("ignores workflows that do not use the contract or do not check out", () => {
      expect(ids(workflow("- uses: actions/checkout@v4\n- run: npm test\n"))).toEqual([])
      expect(ids(workflow("- run: npm run contract\n"))).toEqual([])
    })

    it("also recognises the repo-contract CLI as a reason to need history", () => {
      expect(
        ids(workflow("- uses: actions/checkout@v4\n- run: npx repo-contract affected\n")),
      ).toEqual(["checkout-shallow"])
    })
  })

  it("flags missing hooks as information", () => {
    const [finding] = diagnose({ ...healthy, hooksInstalled: false }).findings
    expect(finding).toMatchObject({ id: "hooks-missing", severity: "info" })
  })

  it("lists export * barrels, which make a change to any of their modules widen", () => {
    const [finding] = diagnose({
      ...healthy,
      starExportFiles: ["src/index.ts", "src/util/index.ts"],
    }).findings
    expect(finding).toMatchObject({ id: "star-exports", severity: "info" })
    expect(finding?.message).toContain("src/index.ts")
    expect(finding?.message).toContain("src/util/index.ts")
  })

  it("orders findings by severity, then by id, and is not clean while any exists", () => {
    const result = diagnose({
      gitignore: "",
      vitestConfigs: [],
      workflows: [],
      hooksInstalled: false,
      starExportFiles: ["src/index.ts"],
    })
    expect(result.findings.map((f) => f.id)).toEqual([
      "cache-not-ignored",
      "hooks-missing",
      "star-exports",
    ])
    expect(result.clean).toBe(false)
  })
})

describe("planFixes", () => {
  it("creates a missing .gitignore with the rule", () => {
    const findings = diagnose({ ...healthy, gitignore: undefined }).findings
    expect(planFixes(findings, {})).toEqual([
      { file: ".gitignore", before: undefined, after: ".repo-contract/cache/\n" },
    ])
  })

  it("appends after a final newline, adding one if the file lacks it", () => {
    const findings = diagnose({ ...healthy, gitignore: "node_modules" }).findings
    expect(planFixes(findings, { ".gitignore": "node_modules" })).toEqual([
      {
        file: ".gitignore",
        before: "node_modules",
        after: "node_modules\n.repo-contract/cache/\n",
      },
    ])
    expect(planFixes(findings, { ".gitignore": "node_modules\n" })[0]?.after).toBe(
      "node_modules\n.repo-contract/cache/\n",
    )
  })

  it("is idempotent: a file that already has the rule is left out", () => {
    const findings = diagnose({ ...healthy, gitignore: "x\n" }).findings
    expect(planFixes(findings, { ".gitignore": "x\n.repo-contract/cache/\n" })).toEqual([])
  })

  it("folds several fixes for one file into one change", () => {
    const fix = { file: ".gitignore", append: "a\n" }
    const other = { file: ".gitignore", append: "b\n" }
    const findings = [
      { id: "x", severity: "warn" as const, message: "", hint: "", fix },
      { id: "y", severity: "warn" as const, message: "", hint: "", fix: other },
    ]
    expect(planFixes(findings, { ".gitignore": "" })).toEqual([
      { file: ".gitignore", before: "", after: "a\nb\n" },
    ])
  })

  it("plans nothing for findings without a fix", () => {
    expect(planFixes(diagnose({ ...healthy, hooksInstalled: false }).findings, {})).toEqual([])
  })
})

describe("diagnose: exact findings", () => {
  const only = (patch: Partial<DoctorSnapshot>) => diagnose({ ...healthy, ...patch }).findings

  it("words the cache finding", () => {
    expect(only({ gitignore: "" })).toEqual([
      {
        id: "cache-not-ignored",
        severity: "warn",
        message:
          ".repo-contract/cache/ is not in .gitignore, so cached results could be committed.",
        hint: "Add .repo-contract/cache/ to .gitignore (other files under .repo-contract/ stay tracked).",
        fix: { file: ".gitignore", append: ".repo-contract/cache/\n" },
      },
    ])
  })

  it("words the coverage finding", () => {
    expect(
      only({ vitestConfigs: [{ path: "v.ts", text: "coverage: { reporter: ['text'] }" }] }),
    ).toEqual([
      {
        id: "coverage-json-reporter",
        severity: "warn",
        message:
          'v.ts configures coverage without the "json" reporter, which affected-scope coverage reads.',
        hint: 'Add "json" to coverage.reporter.',
      },
    ])
  })

  it("words the checkout finding", () => {
    const text = "- uses: actions/checkout@v4\n- run: npm run contract\n"
    expect(only({ workflows: [{ path: "ci.yml", text }] })).toEqual([
      {
        id: "checkout-shallow",
        severity: "warn",
        message:
          "ci.yml runs the contract after a shallow checkout, so the affected analysis cannot see the base commit and runs everything.",
        hint: "Set fetch-depth: 0 on actions/checkout.",
      },
    ])
  })

  it("words the hooks finding", () => {
    expect(only({ hooksInstalled: false })).toEqual([
      {
        id: "hooks-missing",
        severity: "info",
        message: "The git hooks that run the contract are not installed.",
        hint: "Install them so a commit is checked before it leaves the machine.",
      },
    ])
  })

  it("words the export * finding, listing the files separated by commas", () => {
    expect(only({ starExportFiles: ["a.ts", "b.ts"] })).toEqual([
      {
        id: "star-exports",
        severity: "info",
        message:
          "export * makes a change to any module behind it widen to everything that imports the barrel: a.ts, b.ts.",
        hint: "Re-export by name where the barrel is large.",
      },
    ])
  })

  it("lists warnings before information, and within each by id", () => {
    const text = "- uses: actions/checkout@v4\n- run: npm run contract\n"
    const found = only({
      gitignore: "",
      hooksInstalled: false,
      starExportFiles: ["a.ts"],
      workflows: [{ path: "ci.yml", text }],
      vitestConfigs: [{ path: "v.ts", text: "coverage: { reporter: ['text'] }" }],
    })
    expect(found.map((f) => f.id)).toEqual([
      "cache-not-ignored",
      "checkout-shallow",
      "coverage-json-reporter",
      "hooks-missing",
      "star-exports",
    ])
  })

  it("keeps several findings of one rule in the order the files were given", () => {
    const text = "coverage: { reporter: ['text'] }"
    const found = only({
      vitestConfigs: [
        { path: "z.ts", text },
        { path: "a.ts", text },
      ],
    })
    expect(found.map((f) => f.message.split(" ")[0])).toEqual(["z.ts", "a.ts"])
  })
})

describe("planFixes whitespace", () => {
  it("sees the rule already present when it is padded or has Windows line endings", () => {
    const findings = diagnose({ ...healthy, gitignore: "x\n" }).findings
    expect(planFixes(findings, { ".gitignore": "x\r\n.repo-contract/cache/\r\n" })).toEqual([])
    expect(planFixes(findings, { ".gitignore": "x\n  .repo-contract/cache/  \n" })).toEqual([])
  })

  it("does not take a longer line that merely contains the rule for the rule", () => {
    const findings = diagnose({ ...healthy, gitignore: "x\n" }).findings
    expect(planFixes(findings, { ".gitignore": "x\n.repo-contract/cache/old\n" })).toHaveLength(1)
  })
})

import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { missingTierTools } from "../../../bin/preset-catalog.mjs"
import { extractQuickStart } from "../../../bin/quick-start-cli.mjs"
import { CONTRACT_RUNNER_TEMPLATE } from "../../../bin/templates.mjs"
import { tierChecks } from "../../../src/tiers/index.js"

/**
 * The README's first screen promises a tier in three commands and JSON for agents. The QuickStart
 * check runs the marked block; these tests pin what the block and the agent sentences say, so a
 * copy edit cannot drop the tier or name a command that prints npm's banner into the JSON.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const read = (file: string): string => readFileSync(path.join(root, file), "utf8")
const readme = read("README.md")

/** npm prints its `> pkg@1.0.0 contract` banner to stdout unless `--silent` is given. */
const AGENT_COMMAND = "npm run --silent contract -- --json"

describe("the README's marked quick start", () => {
  it("installs the package and tsx, writes the strict tier and explains it", () => {
    const block = extractQuickStart(readme)
    expect(block.kind).toBe("found")
    const commands = (block as { commands: string[] }).commands.map((command) =>
      command.replace(/\s+#.*$/, ""),
    )
    expect(commands).toEqual([
      "npm i -D repo-contract tsx",
      "npx repo-contract init --preset strict",
      "npx repo-contract explain",
    ])
  })

  it("is followed by one install line for every tool init lists as missing for strict", () => {
    const after = readme.slice(readme.indexOf("<!-- quick-start:end -->"))
    const line = /^npm i -D (.+)$/m.exec(after)?.[1]
    const listed = missingTierTools(tierChecks("strict"), { devDependencies: {} }).map(
      (entry: { dependency: string }) => entry.dependency,
    )
    expect(line?.split(" ")).toEqual(listed)
  })

  it("marks tiers and explain as Experimental on the first screen", () => {
    const firstScreen = readme.slice(0, readme.indexOf("\n## "))
    expect(firstScreen).toMatch(/tiers?[^.]*Experimental|Experimental[^.]*tiers?/i)
  })
})

describe("agent JSON output", () => {
  it("is what the generated runner does with --json", () => {
    expect(CONTRACT_RUNNER_TEMPLATE).toContain('process.argv.includes("--json")')
    expect(CONTRACT_RUNNER_TEMPLATE).toContain("serializeRun(run)")
  })

  it.each(["README.md", "GUIDE.md", "docs/skill.json"])(
    "%s names the runner's JSON command with --silent, never the bare npm form",
    (file) => {
      const text = read(file)
      expect(text).toContain(AGENT_COMMAND)
      expect(text).not.toMatch(/npm run contract -- --json/)
    },
  )
})

describe("the landing page's comparison", () => {
  // Danger JS and Qlty judge beyond exit codes, so the contrast names hook runners only.
  const HOOK_RUNNERS = "Hook runners such as pre-commit and lefthook judge by exit code"
  const site = JSON.parse(read("docs/site.json")) as {
    readonly comparison: { readonly rows: readonly (readonly string[])[] }
  }

  it("uses the README's sourced wording for the exit-code contrast", () => {
    expect(readme).toContain(`${HOOK_RUNNERS}.`)
    expect(site.comparison.rows.map(([today]) => today)).toContain(HOOK_RUNNERS)
    expect(JSON.stringify(site.comparison)).not.toContain("Exit codes and CI job state")
  })
})

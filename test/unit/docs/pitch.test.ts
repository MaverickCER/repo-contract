import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * The pitch and the quoted demo output are typed by hand on several first-screen surfaces: the npm
 * description, the README, the landing page source and the agent skill source. These tests make the
 * copies fail together. scripts/run-examples.mjs ties the README's quoted output to a real run.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const read = (file: string): string => readFileSync(path.join(root, file), "utf8")
const json = (file: string): Record<string, unknown> =>
  JSON.parse(read(file)) as Record<string, unknown>

const packageJson = json("package.json") as { readonly description: string }
const site = json("docs/site.json") as {
  readonly description: string
  readonly hero: { readonly heading: string }
  readonly demo: { readonly output: string }
}
const skill = json("docs/skill.json") as { readonly purpose: string }
const readme = read("README.md")

/** The text up to and including the first full stop that ends a sentence. */
function firstSentence(text: string): string {
  const end = text.search(/\.(\s|$)/)
  return end === -1 ? text : text.slice(0, end + 1)
}

/** The non-blank lines of the README `text` fence marked `<!-- example-output: <workspace>/<script> -->`. */
function readmeExcerpt(workspace: string): string[] {
  const marker = new RegExp(
    `<!-- example-output: ${workspace} [^>]*-->\\n+\`\`\`text\\n([\\s\\S]*?)\`\`\``,
  )
  const match = marker.exec(readme)
  if (match?.[1] === undefined)
    throw new Error(`README.md has no example-output fence for ${workspace}`)
  return match[1].split("\n").filter((line) => line.trim() !== "")
}

const pitch = firstSentence(packageJson.description)

describe("the pitch", () => {
  it("is one full sentence in package.json's description", () => {
    expect(pitch.length).toBeGreaterThan(40)
    expect(pitch.endsWith(".")).toBe(true)
  })

  it("is the README's bold pitch line, word for word", () => {
    expect(/^\*\*(.+)\*\*$/m.exec(readme)?.[1]).toBe(pitch)
  })

  it("opens docs/site.json's description and is its hero heading", () => {
    expect(firstSentence(site.description)).toBe(pitch)
    expect(site.hero.heading).toBe(pitch)
  })

  it("opens the agent skill's purpose", () => {
    expect(firstSentence(skill.purpose)).toBe(pitch)
  })
})

describe("the README's quoted demo output", () => {
  const siteLines = site.demo.output.split("\n").filter((line) => line.trim() !== "")

  it("matches the start of the landing page's demo output", () => {
    const demo = readmeExcerpt("demo/demo")
    expect(demo.length).toBeGreaterThan(5)
    expect(siteLines.slice(0, demo.length)).toEqual(demo)
  })

  it("matches the end of the landing page's demo output for the release gate", () => {
    const release = readmeExcerpt("release-gate/demo")
    expect(release[0]).toBe("[FAIL] release")
    expect(siteLines.slice(-release.length)).toEqual(release)
  })
})

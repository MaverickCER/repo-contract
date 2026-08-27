import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { locateTargetFileName } from "../../scripts/changeset-file-locator.js"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "repo-contract-changeset-file-locator-"))
  await mkdir(path.join(root, ".changeset"), { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("locateTargetFileName", () => {
  it("recognizes a file carrying only the api-contract mechanism's marker as machine-touched", async () => {
    await writeFile(
      path.join(root, ".changeset", "from-api-contract.md"),
      '---\n"pkg": minor\n---\n\n### API Contract Impact\n\n<!-- repo-contract:api-contract:start:hash=abc level=minor -->\n\nSomething.\n\n<!-- repo-contract:api-contract:end -->\n',
      "utf8",
    )
    await writeFile(
      path.join(root, ".changeset", "human.md"),
      '---\n"pkg": patch\n---\n\nUnrelated human note.\n',
      "utf8",
    )

    const result = await locateTargetFileName(root)
    expect(result).toBe("from-api-contract.md")
  })

  it("recognizes a file carrying only the changeset-docs mechanism's marker as machine-touched", async () => {
    await writeFile(
      path.join(root, ".changeset", "from-changeset-docs.md"),
      '---\n"pkg": patch\n---\n\n### Changed Files\n\n<!-- repo-contract:changeset-docs:start:hash=abc -->\n\n- **src/foo.ts** (modified): a description\n\n<!-- repo-contract:changeset-docs:end -->\n',
      "utf8",
    )
    await writeFile(
      path.join(root, ".changeset", "human.md"),
      '---\n"pkg": patch\n---\n\nUnrelated human note.\n',
      "utf8",
    )

    const result = await locateTargetFileName(root)
    expect(result).toBe("from-changeset-docs.md")
  })

  it("falls back to the dedicated filename when files from both mechanisms coexist (ambiguous)", async () => {
    await writeFile(
      path.join(root, ".changeset", "from-api-contract.md"),
      '---\n"pkg": minor\n---\n\n<!-- repo-contract:api-contract:start:hash=abc level=minor -->\n\nSomething.\n\n<!-- repo-contract:api-contract:end -->\n',
      "utf8",
    )
    await writeFile(
      path.join(root, ".changeset", "from-changeset-docs.md"),
      '---\n"pkg": patch\n---\n\n<!-- repo-contract:changeset-docs:start:hash=abc -->\n\n- **src/foo.ts** (modified): a description\n\n<!-- repo-contract:changeset-docs:end -->\n',
      "utf8",
    )

    const result = await locateTargetFileName(root)
    expect(result).toBe("repo-contract.md")
  })

  it("falls back to the dedicated filename when no changeset files exist at all", async () => {
    const result = await locateTargetFileName(root)
    expect(result).toBe("repo-contract.md")
  })

  it("treats exactly one un-marked file as the human-authored changeset for this contribution", async () => {
    await writeFile(
      path.join(root, ".changeset", "human.md"),
      '---\n"pkg": patch\n---\n\nUnrelated human note.\n',
      "utf8",
    )

    const result = await locateTargetFileName(root)
    expect(result).toBe("human.md")
  })
})

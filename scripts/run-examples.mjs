// Runs each example's main command (and its `typecheck`) and checks the outcome its README shows:
// the exit code and a few output lines, plus every line the root README quotes from it. Follow-up
// steps a README describes are not run. The examples depend on this repository through `file:`
// links (examples/package.json's workspaces), so a package change that breaks a README's main
// command fails CI's `examples` job.
//
// Usage: node scripts/run-examples.mjs   (after `npm run build` at the root and `npm install` in examples/)
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const examplesRoot = path.join(repoRoot, "examples")

/**
 * The root README and GUIDE quote example output in `text` fences marked
 * `<!-- example-output: <workspace>/<script> ... -->`. Every non-blank line of such a fence joins
 * that command's `expect`, so the quote cannot drift from what the example prints.
 */
function quotedExcerpts(document, excerpts) {
  let key
  let inFence = false
  for (const line of document.split("\n")) {
    const marker = /^<!-- example-output: ([\w-]+\/[\w-]+) /.exec(line)
    if (marker) {
      key = marker[1]
    } else if (key === undefined || line.trim() === "") {
      continue
    } else if (!inFence) {
      // Only a `text` fence right after the marker counts.
      inFence = line === "```text"
      if (!inFence) key = undefined
    } else if (line === "```") {
      inFence = false
      key = undefined
    } else {
      excerpts.set(key, [...(excerpts.get(key) ?? []), line])
    }
  }
}

/**
 * What each example promises in its README. `exit` is the process exit code the README implies.
 * A demo that shows a FAIL verdict exits 1 on purpose. `expect` are substrings of the combined
 * stdout and stderr that the README shows. `env` adds environment variables, here to make the
 * fake AI reviewer replay each of its recorded replies.
 */
const EXAMPLES = [
  {
    workspace: "boilerplate",
    script: "contract",
    exit: 0,
    expect: ["[PASS] Format", "[PASS] Types", "[PASS] Lint"],
  },
  { workspace: "demo", script: "demo", exit: 1, expect: ["[FAIL] format"] },
  { workspace: "demo", script: "ai-review", exit: 1, expect: ["[FAIL] aiReview"] },
  ...[
    ["unsure", "[WARN] aiReview", "1 finding(s) below the blocking bar"],
    ["clean", "[PASS] aiReview", "no warn or error findings (1 info)"],
    ["off-shape", "[WARN] aiReview", "reply.findings[0].severity must be"],
    ["prose", "[WARN] aiReview", "could not be parsed", "[unparsed-output] warn"],
    ["wrapped", "[WARN] aiReview", "read from its first { to its last }", "confidence 0.7"],
  ].map(([reply, ...expect]) => ({
    workspace: "demo",
    script: "ai-review",
    env: { AI_REVIEW_RESPONSE: reply },
    exit: 1,
    expect,
  })),
  {
    workspace: "release-gate",
    script: "demo",
    exit: 1,
    expect: ["[FAIL] release", "Release blocked by format"],
  },
  {
    workspace: "day-one-walkthrough",
    script: "walkthrough",
    exit: 0,
    expect: ["[PASS] Types", "[PASS] CoverageFloor", "[WARN] MutationFloor"],
  },
  { workspace: "day-one-walkthrough", script: "typecheck", exit: 0, expect: [] },
  {
    workspace: "exceptions-walkthrough",
    script: "walkthrough",
    exit: 1,
    expect: ["[FAIL] DependencyAdvisories"],
  },
  { workspace: "exceptions-walkthrough", script: "typecheck", exit: 0, expect: [] },
  {
    workspace: "affected-scope",
    script: "walkthrough",
    exit: 0,
    expect: ["test/both.test.ts", "test/math.test.ts"],
  },
  { workspace: "affected-scope", script: "typecheck", exit: 0, expect: [] },
]

const excerpts = new Map()
for (const document of ["README.md", "GUIDE.md"]) {
  quotedExcerpts(readFileSync(path.join(repoRoot, document), "utf8"), excerpts)
}
const keyOf = (example) =>
  example.env === undefined ? `${example.workspace}/${example.script}` : undefined
for (const key of excerpts.keys()) {
  if (!EXAMPLES.some((example) => keyOf(example) === key)) {
    console.error(`README.md or GUIDE.md quotes output of an unknown example command: ${key}`)
    process.exit(1)
  }
}
for (const example of EXAMPLES) example.expect.push(...(excerpts.get(keyOf(example)) ?? []))

let failures = 0
for (const example of EXAMPLES) {
  const label = `${example.workspace}: npm run ${example.script}${example.env ? ` ${JSON.stringify(example.env)}` : ""}`
  const result = spawnSync("npm", ["run", example.script, "-w", example.workspace], {
    cwd: examplesRoot,
    encoding: "utf8",
    env: { ...process.env, ...example.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  })
  const output = `${result.stdout}\n${result.stderr}`
  const problems = []
  if (result.status !== example.exit)
    problems.push(`exit ${result.status}, README implies ${example.exit}`)
  for (const text of example.expect) {
    if (!output.includes(text)) problems.push(`output lacks ${JSON.stringify(text)}`)
  }
  if (problems.length === 0) {
    console.log(`ok   ${label}`)
  } else {
    failures += 1
    console.error(`FAIL ${label}: ${problems.join("; ")}`)
    console.error(
      output
        .trim()
        .split("\n")
        .slice(-25)
        .map((line) => `     ${line}`)
        .join("\n"),
    )
  }
}
if (failures > 0) {
  console.error(`\n${failures} example(s) no longer do what their README says.`)
  process.exit(1)
}
console.log(`\nAll ${EXAMPLES.length} example commands do what their READMEs say.`)

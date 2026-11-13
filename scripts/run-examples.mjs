// Runs every example in examples/ the way its README tells a reader to, and checks the outcome the
// README promises: the exit code and one line of the output. The examples are real projects that
// depend on this repository through `file:` links (examples/package.json's workspaces), so a change
// to the package that breaks what a README shows fails here, in CI's `examples` job, instead of
// being found by the next reader.
//
// Usage: node scripts/run-examples.mjs   (after `npm run build` at the root and `npm install` in examples/)
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const examplesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "examples")

/**
 * What each example promises in its README. `exit` is the process exit code the README implies
 * (a demo that shows a FAIL verdict exits 1 on purpose); `expect` are substrings of the combined
 * stdout and stderr that the README shows.
 */
const EXAMPLES = [
  {
    workspace: "boilerplate",
    script: "contract",
    exit: 0,
    expect: ["[PASS] Format", "[PASS] Types", "[PASS] Lint"],
  },
  { workspace: "demo", script: "demo", exit: 1, expect: ["[FAIL] format"] },
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

let failures = 0
for (const example of EXAMPLES) {
  const label = `${example.workspace}: npm run ${example.script}`
  const result = spawnSync("npm", ["run", example.script, "-w", example.workspace], {
    cwd: examplesRoot,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
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

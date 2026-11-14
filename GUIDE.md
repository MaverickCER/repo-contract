# repo-contract guide

This guide covers everything past "should I adopt this?": integrating repo-contract properly, defining your own checks, and the full behavior of every moving part. The [README](README.md) covers the pitch and a minimal first contract.

- [The model: evidence, policy, verdict](#the-model)
- [Supplying `spawn` and `env`](#supplying-spawn-and-env)
- [The runner and CI integration](#the-runner-and-ci-integration)
- [Defining checks](#defining-checks)
  - [`run`](#run)
  - [`output`](#output)
  - [Validating parsed output with a schema](#validating-parsed-output-with-a-schema)
  - [`policy`](#policy)
  - [`dependsOn` and `isolated`](#dependson-and-isolated)
- [A fuller example: cross-check policy](#a-fuller-example-cross-check-policy)
- [AI review checks](#ai-review-checks)
- [Presets](#presets)
- [Regression detection](#regression-detection)
- [Errors](#errors)
- [`Evidence` and `Verdict` shapes](#evidence-and-verdict-shapes)
- [Runtime support](#runtime-support)
- [Accessibility](#accessibility)
- [Advanced: governed exceptions (`repo-contract/helpers`)](#advanced-governed-exceptions)

## The model

```text
Engineering standards
        |
        v
   repo-contract
        |
   .----+----.
   v         v
Evidence   Policy
   |         |
   '----+----'
        v
     Verdict
        |
   .----+----.
   v         v
 Local       CI
```

```text
Evidence → What happened?
Policy   → What does our standard require?
Verdict  → Did the contract pass?
Consumer → What should happen next?
```

**Evidence** describes what happened: the command, its exit code, signal, timing, captured stdout/stderr, and, if requested, parsed output. Evidence never decides whether the result was acceptable.

**Policy** is repository-owned. It returns:

```ts
{
  outcome: "pass" | "fail" | "warn"
  rationale: string
}
```

`rationale` is mandatory for every outcome, including `"pass"`. It should contain enough actionable detail (file/line locations, rule IDs, test names, counts) that the result is understandable without rerunning the check.

`"warn"` is non-blocking: the policy's requirements were satisfied, but the evidence is worth surfacing. Whether an observation deserves `"warn"` or a plain `"pass"` is a repository-owned decision. The package gives you the outcome and the mandatory rationale; it doesn't compute "margin" on your behalf.

**Verdict** aggregates every policy result. `passed` is `true` only when every outcome is `"pass"` or `"warn"`; `"fail"` is the only outcome that fails the run.

**The consumer** decides what to do with the verdict. CI can block a merge, a script can set an exit code, and a bot or human can inspect the result. `Verdict` is returned alongside `Evidence`, never merged into it. A consumer therefore has both `evidence.checks[id]` and `verdict.checks[id]` independently. See [Evidence, policy rationale, and consumer judgment](specs/architecture.md#evidence-policy-rationale-and-consumer-judgment) for why these responsibilities stay separate.

## Supplying `spawn` and `env`

`spawn` and `env` are required fields on the config. The package never imports a process-spawning implementation or reads `process.env` internally (see [ADR 0011](specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md)). You supply both as trusted capabilities, which repo-contract calls with a resolved command/argv/options. It does not inspect, wrap, or sanitize them.

**macOS/Linux:** plain `node:child_process` is enough:

```ts
import { spawn } from "node:child_process"

export default defineRepoContract({ spawn, env: process.env, checks: {/* ... */} })
```

**Windows:** install [`cross-spawn`](https://www.npmjs.com/package/cross-spawn) and pass it instead. Most npm-installed CLI tools (`eslint`, `prettier`, `tsc`, …) resolve to `.cmd` shims. Plain `node:child_process.spawn` refuses to run those without `shell: true` (Node's own CVE-2024-27980 mitigation). `cross-spawn` resolves `.cmd`/`.bat` shims and quotes arguments safely for `cmd.exe`, **without** turning on shell metacharacter interpretation:

```ts
import crossSpawn, { sync as crossSpawnSync } from "cross-spawn"

export default defineRepoContract({
  spawn: crossSpawn,
  env: process.env,
  // Optional: lets a timed-out/aborted/Ctrl+C-killed check's full process
  // tree (not just its immediate process) get cleaned up on Windows too.
  killProcessTree: crossSpawnSync,
  checks: {/* ... */},
})
```

**`cross-spawn` does not mean "shell execution."** These are two independent choices:

| `Spawner` choice | `shell` option    | Result                                                                         |
| ---------------- | ----------------- | ------------------------------------------------------------------------------ |
| native `spawn`   | `false` (default) | argv-only, no shell interpretation                                             |
| `cross-spawn`    | `false` (default) | Windows `.cmd`/`.bat` resolution + safe `cmd.exe` quoting, still argv-only     |
| either           | `true`            | shell metacharacters (`&&`, `\|`, …) interpreted; a per-check or global opt-in |

Passing `cross-spawn` fixes Windows command resolution; it does not by itself enable shell metacharacter interpretation. `check.shell` (or the config-level `shell` default) is the separate, explicit opt-in for that. See [SECURITY.md](SECURITY.md) before enabling it. `repo-contract` doesn't ship a ready-made spawner of its own, on purpose (see ADR 0011's Alternatives).

## The runner and CI integration

### Why the CLI only scaffolds

repo-contract is a library, not a repository-wide command. Your repository owns the entry point, the process-spawning capability, and the environment it runs with. That keeps the contract composable, and the package never becomes another opaque layer between you and your tools.

`npx repo-contract init` (see the [README's Quick Start](README.md#install-and-verify)) automates writing the files below. It is a one-time scaffold, not a runtime:

- It detects your `package.json`'s existing devDependencies.
- It generates `repo-contract.config.mts` and `scripts/contract.mjs` from them.
- It adds a `"contract"` entry in `package.json`'s own `scripts`, or leaves an existing one untouched.

It never runs a check itself, never spawns anything, and never becomes a prerequisite for `npm run contract`. Everything it writes is yours from the moment it lands, indistinguishable from writing it by hand. Everything after that is `npm run contract`, exactly as below, whether you got there via `init` or by typing this out yourself.

`runRepoContract()` never calls `process.exit()` itself; your integration decides what to do with the result. That file is the whole integration:

```ts
// scripts/contract.mjs: the entry point, and the whole of it
import { runRepoContract } from "repo-contract"
import config from "../repo-contract.config.mjs"

const { verdict } = await runRepoContract(config)
for (const [id, result] of Object.entries(verdict.checks)) {
  console.log(`[${result.outcome.toUpperCase()}] ${id}: ${result.rationale}`)
}
process.exitCode = verdict.passed ? 0 : 1
```

The config is `repo-contract.config.mts`, not `.ts`. An `.mts` file is always ESM to Node, whether or not your `package.json` has `"type": "module"` set (`npm init`'s default output doesn't). Without that setting, a plain `.ts` config would compile to CommonJS, while this `.mjs` runner (ESM by its own extension) imports it. Node's CJS/ESM default-export interop would then silently hand `runRepoContract` the wrong shape. `config.checks` ends up `undefined`, and the run fails with `InvalidRepoContractConfigError` before anything spawns.

```json
{
  "scripts": {
    "contract": "tsx scripts/contract.mjs"
  }
}
```

`tsx` loads the TypeScript config and runner; add it as a devDependency alongside the CLIs your own checks invoke (repo-contract bundles none of them). The same contract definition then runs locally and in CI:

```sh
npm run contract
```

Point a `precommit`, `prepublishOnly`, or CI job at that command. `spawn`, `env`, and the installed toolchain are consumer-supplied and can differ per environment. What stays identical is the contract definition and the code path, with no hidden state. This repository uses its own `repo-contract.config.ts` to validate itself (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Reporting while a run is going

`runRepoContract(config, options)` takes two optional hooks so a caller can show progress and keep each check's raw output without waiting for the whole run:

- `onEvidence(checkId, evidence)` is called once for each check as soon as its process has ended. That call comes before any policy runs, and possibly before the run's other checks have finished.
- `onVerdict(checkId, result)` is called once for each check as soon as its policy has returned a valid result. Policies run after every check's evidence is assembled (a policy can read any other check's evidence). These calls therefore come once the checks have all finished, in the order the policies settle.

A hook's return value is ignored and a hook that throws is ignored too: reporting never changes what a run does.

`repo-contract/helpers` ships the two hooks most callers want, which keep one log per check:

```ts
import { runRepoContract } from "repo-contract"
import {
  onEvidenceSaveToRepoContractLogs,
  onVerdictPrependRepoContractLogs,
  repoContractLogs,
} from "repo-contract/helpers"

const logs = { cwd: process.cwd() } // directory defaults to reports/contract/logs, mode to "failing"
const run = await runRepoContract(config, {
  onEvidence: onEvidenceSaveToRepoContractLogs(logs), // the raw output, the moment a check's evidence exists
  onVerdict: onVerdictPrependRepoContractLogs(logs), // the verdict, at the top of the same file
})
await repoContractLogs(logs).flush() // writes happen in the background, in order
```

Creating the first hook removes the logs of an earlier run, and a log is overwritten if it exists. With the default `"failing"` mode, the log of a check that passed is removed once its verdict is known. `"all"` keeps every log, and `"off"` writes none. A disk problem is told once through `onProblem` and never thrown.

## Persisting a run and publishing a summary

To keep a record that a dashboard, a reviewer, or the next run can read, store the run. The runner above prints the verdict and forgets it.

`serializeRun` turns the raw result into the two JSON documents that match the published `repo-contract/schema` files. Each carries its own `version` field, so a stored document stays interpretable independently of the package version that wrote it (see [VERSIONING.md](VERSIONING.md#evidence-and-verdict-schema-versioning)).

`renderMarkdownSummary` takes the raw `verdict` and `evidence` from the run, not the serialized JSON. It renders a summary for `$GITHUB_STEP_SUMMARY` or a pull-request comment with:

- failures, with their whole rationale;
- warnings and passes, with a line each;
- the slowest checks.

Neither function touches the filesystem; you decide where the output goes:

```ts
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import { renderMarkdownSummary, runRepoContract, serializeRun } from "repo-contract"
import config from "../repo-contract.config.mjs"

const run = await runRepoContract(config)
const { evidence, verdict } = serializeRun(run)
mkdirSync("reports/contract", { recursive: true })
writeFileSync("reports/contract/evidence.json", evidence)
writeFileSync("reports/contract/verdict.json", verdict)
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderMarkdownSummary(run.verdict, run.evidence))
}
process.exitCode = run.verdict.passed ? 0 : 1
```

The [API reference](https://maverickcer.github.io/repo-contract/api/) is authoritative for both signatures.

## Defining checks

Each check owns its identifier, command, output interpretation, and policy:

```ts
checks: {
  lint: {
    run: ["eslint", ".", "--format", "json"],
    output: { format: "json" },

    policy: ({ result }) => {
      if (!result.output?.success) {
        return { outcome: "fail", rationale: "ESLint output was not valid JSON." }
      }

      const files = result.output.value as { errorCount: number }[]
      const errors = files.reduce((sum, file) => sum + file.errorCount, 0)

      return errors === 0
        ? { outcome: "pass", rationale: "ESLint reported 0 errors." }
        : { outcome: "fail", rationale: `${errors} lint error(s).` }
    },
  },
}
```

### `run`

A `string` is tokenized into an executable and its arguments **without invoking a shell**.

Shell operators such as `;`, `&`, `|`, backticks, `$(...)`, `<`, `>`, and newlines are not interpreted. A string containing one is rejected with a configuration error because it indicates an assumption that shell interpretation is occurring.

Glob characters such as `*`, `?`, `~`, `[`, `]`, `{`, and `}` are not rejected. Many CLI tools expand their own arguments internally. Each argument is passed through as its own, separately-escaped element rather than concatenated into a command line. Those characters therefore do not create shell injection behavior. (On Windows, resolving a `.cmd`/`.bat` shim unavoidably routes through `cmd.exe`; see [SECURITY.md](SECURITY.md).)

A `readonly string[]` bypasses tokenization entirely and is used as argv verbatim. This is the recommended form for arguments containing characters that should never be interpreted.

```ts
run: "eslint . --max-warnings 0"
run: ["eslint", ".", "--max-warnings", "0"]
run: "npm run build && npm test" // throws: run string contains an unquoted "&". Use array form or "shell: true"
```

To opt into real shell execution, including pipes, redirects, and `&&`, set `shell: true`. In that mode `run` must be a string and is passed to the platform shell as-is. See [SECURITY.md](SECURITY.md) before enabling this.

### `output`

By default, check output is not parsed. `result.stdout` and `result.stderr` contain the captured raw text.

Request parsing explicitly:

```ts
output: {
  format: "json"
} // JSON.parse; malformed output produces { success: false, error } and never throws
output: {
  format: "text"
} // trimmed text passthrough; always succeeds
```

`result.output.value` is `unknown` for every format. Because repo-contract has no schema knowledge of what an external tool prints, your policy narrows or casts it according to the tool's actual output.

Format conversion beyond JSON/plain text is deliberately not a core concern of this package. It doesn't carry an optional peer dependency on everyone's behalf for a format most checks never need. A check whose tool emits, say, YAML should prefer one of these:

- Have the tool itself emit `--json` (most tools that support YAML output support a JSON flag too).
- Parse `result.stdout` directly inside its `policy` function, using whatever library it already depends on.

Piping through a separate converter in `run` (`tool | yaml-to-json`) also works, but only with `shell: true` set. See the `run` section above and [SECURITY.md](SECURITY.md) before enabling it.

`result.output` is `undefined` when a check does not request a format. Suppose a policy reads `result.output.value` (or `.success`/`.error`/`.format`) without narrowing first, on a check that never configured `output`. Then `runRepoContract()` rejects with [`PolicyReadUnrequestedOutputError`](docs/api-report/index/README.md). That error names the check and tells you to add `output: { format: "json" }`. It replaces the generic `PolicyThrewError` you'd otherwise have to debug from a bare "Cannot read properties of undefined" stack trace.

The sibling mistake similarly rejects with [`PolicyReadFailedParseValueError`](docs/api-report/index/README.md). That mistake is reading `result.output.value` when the format _was_ requested but the parse failed (`result.output.success === false`). Check `result.output.success` before reading `.value`.

### Validating parsed output with a schema

`output.schema` accepts any object implementing [Standard Schema](https://standardschema.dev); Zod, Valibot, ArkType, and others already do. None of them is installed or depended on: repo-contract hand-vendors the (pure-type, zero-runtime-code) `StandardSchemaV1` interface itself (see [ADR 0012](specs/decisions/0012-hand-vendored-standard-schema-support-for-optional-output-validation.md)). Bring whichever schema library your repo already uses. The smallest possible example, using a hand-written object satisfying the interface directly:

```ts
output: {
  format: "json",
  schema: {
    "~standard": {
      version: 1,
      vendor: "example",
      validate: (value) => {
        const errorCount =
          value !== null && typeof value === "object"
            ? (value as { errorCount?: unknown }).errorCount
            : undefined
        return typeof errorCount === "number"
          ? { value: { errorCount } }
          : { issues: [{ message: "errorCount must be a number", path: ["errorCount"] }] }
      },
    },
  },
}
```

A successful validation _replaces_ `result.output.value` with the schema's own (possibly transformed or coerced) output. A schema can normalize, default, or reshape its input, and the policy receives that result. A failing validation becomes a normal `ParsedOutputFailure`, indistinguishable in shape from a malformed-JSON parse failure. It joins every issue's path and message into `result.output.error`. `result.output.value`'s declared type stays `unknown` regardless.

If `schema["~standard"].validate()` itself throws or rejects (rather than returning a `Result`), the schema is broken, not the check's output. That rejects `runRepoContract()` with `StandardSchemaValidateThrewError` instead of becoming evidence.

### `policy`

```ts
interface PolicyResult {
  outcome: "pass" | "fail" | "warn"
  rationale: string
}

policy: (ctx) => PolicyResult | Promise<PolicyResult>
```

`ctx.result` is the current check's evidence. `ctx.evidence` is the entire run's evidence, including every sibling check. Every configured check completes execution and has its evidence fully assembled before policies run, so policies can reason across checks:

```ts
policy: ({ result, evidence }) => {
  if (evidence.checks.tests?.exitCode !== 0) {
    return { outcome: "fail", rationale: "Mutation policy requires the test suite to pass." }
  }
  const score = Number(result.stdout)
  return score >= 90
    ? { outcome: "pass", rationale: `Mutation score was ${score}%.` }
    : { outcome: "fail", rationale: `Mutation score must be at least 90% (got ${score}%).` }
}
```

`ctx.dependencies` contains this check's declared `dependsOn` evidence, keyed by ID. It is `{}` for a check without dependencies and is never `undefined`. Dependency policy results are not included; they remain available at the top-level `Verdict`.

A policy is always invoked for every check, however its process ended: completed, timed out, killed by a signal, or failed to spawn. What those outcomes mean is for your policy to decide, not repo-contract.

A policy that _throws_ is different: a thrown or rejected policy represents a bug in policy code, not a failed engineering check. `runRepoContract()` rejects with `PolicyThrewError`, or an `AggregateError` when multiple policies throw.

Other execution options: `cwd`, `env`, `inheritEnv` (defaults to `true`; set `false` for a minimal environment), `timeoutMs`.

### `dependsOn` and `isolated`

By default, every check runs independently and in parallel. Name other check IDs in `dependsOn` to establish explicit execution ordering:

```ts
checks: {
  build: {
    run: "npm run build",
    policy: ({ result }) =>
      result.exitCode === 0
        ? { outcome: "pass", rationale: "Build succeeded." }
        : { outcome: "fail", rationale: "Build failed." },
  },

  integration: {
    run: "npm run test:integration",
    dependsOn: ["build"],
    policy: ({ result }) =>
      result.exitCode === 0
        ? { outcome: "pass", rationale: "Integration tests passed." }
        : { outcome: "fail", rationale: "Integration tests failed." },
  },
}
```

A dependency must be declared before the check that names it. Naming a check declared later in the same `checks` record is a configuration error, not a forward reference.

`dependsOn` orders execution and hands the dependent check's policy each dependency's evidence (`ctx.dependencies`). It does not feed one command's output to another; flow artifacts through the filesystem. It also does not decide whether the dependent check runs based on the dependency's policy result. That decision belongs to the dependent check's command or policy.

Every named dependency must exist, a check cannot depend on itself, and the entire dependency graph must be acyclic. These conditions are validated synchronously before anything is spawned. Checks whose tooling needs exclusive access can declare `isolated`.

## A fuller example: cross-check policy

Once a contract grows past "run tests, run mutation," it typically starts reasoning across checks. This example:

- uses one preset as-is and another spread and overridden;
- orders execution with `dependsOn`;
- reads a sibling check's evidence;
- produces a specific, actionable `"warn"` instead of a vague one.

```ts
// repo-contract.config.mts
import { spawn } from "node:child_process"
import { defineRepoContract } from "repo-contract"
import { test, typecheck } from "repo-contract/presets"
import {
  readCoverageSummary,
  weakestFile,
  readSurvivingMutants,
  describeMutant,
} from "./contract/reports.js"

const COVERAGE_FLOOR = 85
const MUTATION_FLOOR = 90

export default defineRepoContract({
  spawn,
  env: process.env,
  checks: {
    // A preset used exactly as published.
    typecheck,

    // The same preset, spread and overridden: published command and output
    // parsing, your timeout.
    tests: { ...test, timeoutMs: 300_000 },

    // Your own check. `output: { format: "json" }` is what makes
    // `result.output.value` available to the policy at all.
    coverage: {
      run: ["npm", "run", "coverage", "--", "--reporter=json-summary"],
      output: { format: "json" },
      policy: ({ result }) => {
        const summary = readCoverageSummary(result.output)
        if (!summary.ok) return summary.failure

        const total = summary.value.total.lines.pct
        const weakest = weakestFile(summary.value)

        if (total < COVERAGE_FLOOR) {
          return {
            outcome: "fail",
            rationale:
              `Line coverage is ${total}%, ${(COVERAGE_FLOOR - total).toFixed(1)} points below the ` +
              `${COVERAGE_FLOOR}% floor. Start with ${weakest.path} (${weakest.pct}%, ` +
              `${weakest.uncoveredLines} uncovered lines): it is the single largest gap.`,
          }
        }

        // Clearing the floor is not the same as being finished.
        return weakest.pct < COVERAGE_FLOOR
          ? {
              outcome: "warn",
              rationale:
                `Line coverage is ${total}%, above the ${COVERAGE_FLOOR}% floor. ` +
                `${weakest.path} is at ${weakest.pct}% and is being carried by the rest of the ` +
                `repository; its ${weakest.uncoveredLines} uncovered lines are the highest-value ` +
                `tests left to write.`,
            }
          : {
              outcome: "pass",
              rationale:
                `Line coverage is ${total}% and every file is at or above the ${COVERAGE_FLOOR}% ` +
                `floor. Closest to it: ${weakest.path} at ${weakest.pct}%.`,
            }
      },
    },

    // `dependsOn` orders execution and hands this policy that check's
    // evidence in `ctx.dependencies`.
    mutation: {
      run: ["npm", "run", "mutation"],
      dependsOn: ["tests"],
      policy: async ({ dependencies }) => {
        if (dependencies.tests?.exitCode !== 0) {
          return {
            outcome: "fail",
            rationale:
              "Mutation score is not meaningful while the suite is red. Fix the failures named " +
              "by the `tests` check, then rerun. No mutation threshold was evaluated.",
          }
        }

        const { score, survivors } = await readSurvivingMutants()

        return survivors.length === 0
          ? {
              outcome: "pass",
              rationale: `Mutation score is ${score}% (floor ${MUTATION_FLOOR}%). 0 mutants survived.`,
            }
          : {
              outcome: "fail",
              rationale: [
                `Mutation score is ${score}% (floor ${MUTATION_FLOOR}%). ${survivors.length} mutants ` +
                  `survived: lines your tests execute but never assert on:`,
                ...survivors.map((mutant) => `- ${describeMutant(mutant)}`),
                "Add an assertion that fails when each replacement is applied, or delete the branch if it is unreachable.",
              ].join("\n"),
            }
      },
    },
  },
})
```

`./contract/reports.js` is your own code, not something repo-contract ships. `readSurvivingMutants()` reads a report file from disk, exactly as `checks/mutation.ts` does in this repository's own contract. The resulting verdict:

```ts
verdict.checks
// {
//   typecheck: { outcome: "pass", rationale: "tsc reported no type errors." },
//   tests:     { outcome: "pass", rationale: "Vitest completed 412 test(s) with 0 failures across 38 suite(s)." },
//   coverage:  { outcome: "warn", rationale:
//     "Line coverage is 91.4%, above the 85% floor. src/http/retry.ts is at 78.2% and is being
//      carried by the rest of the repository; its 12 uncovered lines are the highest-value tests
//      left to write." },
//   mutation:  { outcome: "fail", rationale:
//     "Mutation score is 82% (floor 90%). 3 mutants survived: lines your tests execute but never
//      assert on:
//      - src/auth/session.ts:42:11 - ConditionalExpression: replaced `expiresAt > now` with `true`
//      - src/auth/session.ts:57:3 - BooleanLiteral: replaced `false` with `true`
//      - src/http/retry.ts:19:22 - ArithmeticOperator: replaced `attempt * 2` with `attempt / 2`
//      Add an assertion that fails when each replacement is applied, or delete the branch if it is
//      unreachable." },
// }
```

Two passes, one warning and one failure, and every one names something specific: a metric, a file, a line, a fix.

## AI review checks

An AI check runs a model reviewer as an ordinary check. A model can answer differently on every run, so its policy reads one fixed JSON shape with a confidence score on every finding, never prose. The `aiReview` preset from `repo-contract/presets` builds that check around the agent you name:

```ts
import { aiReview } from "repo-contract/presets"

checks: {
  aiReview: aiReview({
    agent: ["claude", "-p", "{prompt}"],
    credentials: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
    errorThreshold: 0.8,
  }),
}
```

1. **Ask for structured output.** The preset hands `agent` a prompt, at `{prompt}` or as the last argument. The default prompt asks for JSON only, in this shape, with this example:

   ```json
   {
     "findings": [
       {
         "rule": "no-logging-in-library",
         "file": "src/greet.ts",
         "line": 15,
         "severity": "warn",
         "score": 0.7,
         "reason": "greet() logs every name; leave logging to the caller."
       }
     ],
     "summary": { "score": 0.9 }
   }
   ```

   `severity` is `info`, `warn` or `error`. `score` is the model's confidence from 0 to 1. `line` is 0 when a finding has no single line. A `prompt` of your own must ask for the same shape.

2. **Read the reply in three steps.** The preset parses the whole output as JSON. If that fails, it parses the text from the first `{` to the last `}`, which recovers JSON wrapped in prose or a code fence. If that fails too, or the JSON has another shape, the `fallback` review is judged instead and the reason lists every problem.

3. **Gate on the scores.**

   | Reply                                             | Outcome | Reason lists                                                    |
   | ------------------------------------------------- | ------- | --------------------------------------------------------------- |
   | An `error` finding with `score >= errorThreshold` | `fail`  | each blocking finding, then the advisory ones                   |
   | Other `warn` or `error` findings                  | `warn`  | each finding with its confidence                                |
   | Unreadable, judged by the default `fallback`      | `warn`  | the parse or shape problems, then its `unparsed-output` finding |
   | Only `info` findings, or none                     | `pass`  | the number of `info` findings                                   |

Every option except `agent` has a default:

| Option           | Default                                    | What it changes                                                   |
| ---------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `agent`          | required                                   | The command line: the executable, then its arguments              |
| `prompt`         | one that asks for the shape above          | The text sent, or `{ file }` to send a prompt file's path instead |
| `files`          | none                                       | Files listed at the end of a string prompt                        |
| `credentials`    | none                                       | Variables the agent authenticates with, by name and value         |
| `errorThreshold` | `0.8`                                      | The confidence at which an `error` finding fails the check        |
| `fallback`       | one `warn` finding, rule `unparsed-output` | The review judged when the reply cannot be read                   |
| `label`          | `"The AI reviewer"`                        | How each reason names the reviewer                                |
| `timeoutMs`      | `600_000` (10 minutes)                     | When the agent is stopped; the check then fails                   |
| `cwd`            | the runner's                               | The agent's working directory                                     |

Credentials stay out of the record. You pass each value yourself, because repo-contract never reads `process.env`. It reaches the agent through the check's `env`, so it works under a runner that sets `inheritEnv: false`, as this repository's does. A value never enters the command line, and the policy replaces it with `[redacted]` in every reason. The evidence still keeps the agent's own stdout and stderr, so an agent that prints its key leaks it there. A credential with no value turns a `pass` into a `warn`.

Pass a `fallback` with an `error` finding at score 1 when an unusable reply must block a merge. repo-contract runs each check once, so a retry belongs in `agent`, for example a script that asks again when a reply fails to parse.

The demo's [AI review check](examples/demo/README.md#the-ai-review-check), `examples/demo/ai-review.config.ts`, adds `aiReview` on top of a baseline contract. Its `fake-reviewer.mjs` replays recorded replies so CI is repeatable. CI's `examples` job (`scripts/run-examples.mjs`) runs `npm run ai-review` in `examples/demo` with each one and checks its outcome:

| `AI_REVIEW_RESPONSE`                             | Outcome |
| ------------------------------------------------ | ------- |
| `confident` (default): an `error` at 0.92        | `fail`  |
| `unsure`: an `error` at 0.55                     | `warn`  |
| `clean`: one `info`                              | `pass`  |
| `wrapped`: one `warn`, in a code fence and prose | `warn`  |
| `off-shape`: wrong field types                   | `warn`  |
| `prose`: not JSON                                | `warn`  |

The tests prove the parsing and the policy. They do not prove a model's judgement: a confident finding can still be wrong. Keep the deterministic checks as the gates that must hold, and pick the threshold from how often your reviewer's confident `error` findings turn out real. This repository's own contract runs CodeRabbit the same way, as a check whose policy reads the reviewer's structured output (`checks/coderabbitai.ts`).

## Presets

You do not have to hand-write every common check. `repo-contract/presets` ships a curated, growing catalog of ready-made `CheckDefinitionConfig`s. A preset encodes how to execute and interpret a common tool; it does **not** encode your repository's definition of quality.

Import a preset, spread it into your `checks` record, and override whatever you need (most often `policy`):

```ts
import { format, typecheck, license } from "repo-contract/presets"

checks: {
  format,
  typecheck: { ...typecheck, timeoutMs: 60_000 },
  license: { ...license, policy: myStricterLicensePolicy },
}
```

Some presets are factories because they expose options that change what gets executed:

```ts
import { lint, deadCode } from "repo-contract/presets"

checks: {
  lint: lint({ path: "src" }),
  deadCode: deadCode({ exemptUnusedDevDependencies: ["some-cli-only-tool"] }),
}
```

**Preset options are the preferred way to change what a preset executes.** A direct `run` override is an escape hatch. Every execution-affecting option is threaded through the actual command line, so evidence records the exact options used in `evidence.checks.<id>.args`. The one exception is `aiReview`'s `credentials`, which reach the agent through `env` and are never recorded.

Every preset's policy fails with an actionable message if its underlying tool is not installed. The one exception is `securityDeps`, which shells out to `npm` itself. Each preset assumes its CLI is already a devDependency of your repository; repo-contract never installs, bundles, or implicitly depends on these tools. `repo-contract init` adds a preset to the config it writes when the package in the last column is a devDependency. It always adds `securityDeps`, adds `distNoUrls` when package.json publishes a built `dist/`, and never adds `aiReview`, which needs your agent's command.

| Category            | Preset                   | Wraps                                                                                 | Package `init` detects    |
| ------------------- | ------------------------ | ------------------------------------------------------------------------------------- | ------------------------- |
| Testing             | `test`                   | `vitest run --reporter=json --outputFile=reports/vitest/vitest-report.json`           | `vitest`                  |
| Testing             | `e2e`                    | `playwright test --reporter=json`                                                     | `@playwright/test`        |
| Code quality        | `lint(options?)`         | `eslint <path> --format json`                                                         | `eslint`                  |
| Code quality        | `format`                 | `prettier --write .`                                                                  | `prettier`                |
| Code quality        | `typecheck`              | `tsc --noEmit -p tsconfig.json`                                                       | `typescript`              |
| Code quality        | `deadCode(options?)`     | `knip --reporter json --reporter-options <options>`                                   | `knip`                    |
| Code quality        | `duplication(options?)`  | `jscpd <path> --reporters json --output reports/jscpd --silent`                       | `jscpd`                   |
| Code quality        | `stylelint(options?)`    | `stylelint <glob> --formatter json`                                                   | `stylelint`               |
| Docs                | `markdownlint(options?)` | `markdownlint-cli2 <glob>`: requires repository configuration for JSON output         | `markdownlint-cli2`       |
| Docs                | `brokenLinks(options?)`  | `linkinator <start> --recurse --format json --skip node_modules`                      | `linkinator`              |
| Security/governance | `securityDeps`           | `npm audit --omit=dev --json`                                                         | none (`npm`)              |
| Security/governance | `securitySecrets`        | `secretlint --format json --output reports/secretlint.json **/*`                      | `secretlint`              |
| Publishing          | `distNoUrls(options?)`   | `node -e <scanner> <dir>`: fails on any URL in the build output; no external tool     | none (a built `dist/`)    |
| Security/governance | `license`                | `licensee --production --errors-only --ndjson`, plus `--osi` without `.licensee.json` | `licensee`                |
| Security/governance | `commitlint(options?)`   | `commitlint --from <from> --to <to>`                                                  | `@commitlint/cli`         |
| Publishing          | `publint`                | `publint run`                                                                         | `publint`                 |
| Publishing          | `arethetypeswrong`       | `attw --pack . --format json`                                                         | `@arethetypeswrong/cli`   |
| Code review         | `aiReview(options)`      | `<agent> <prompt>`: the agent you name; the prompt goes at `{prompt}` or last         | none (the agent you name) |

Not every test runner has a preset. Jest, Cypress, and Mocha have different reporter formats and may need bespoke presets. The pattern is the same: execute the tool, capture evidence, interpret its output, apply your policy.

Unlike its neighbors, `format` auto-fixes (`--write`) and therefore cannot itself fail on unformatted input. For a hard gate on formatting, run `prettier --check .` directly instead of this preset. That is exactly the substitution the [demo](README.md#see-it-run) makes.

## Running less: affected scope, cache and speed

Everything here is opt-in and lives in `repo-contract/affected`, `repo-contract/metrics` and the `bin` commands. With none of it, a run reports every problem and runs everything. Each command below takes `-C <dir>` to run as if started in `<dir>`, and `--help` lists all of its options.

### See what a change affects

```sh
npx repo-contract affected --base origin/main            # what changed, and which tests can be affected
npx repo-contract affected --base origin/main --explain  # ...and why each test is on the list
npx repo-contract affected --tests | xargs vitest run    # pipe the test files to a runner
npx repo-contract affected --json                        # machine-readable, versioned (schemaVersion 1)
```

It compares your working tree (staged, unstaged and untracked files included) with the merge base of `--base`. The default base is the upstream branch, then `origin/main`, then `origin/master`. It works out which exports changed and follows them through your imports to the tests that use them. `--sources` and `--mutate` print the affected source files and the mutation targets instead of the tests.

It needs the project's own `typescript` with a compiler API, which `affected`'s types need as much as its runtime. [Runtime support](#runtime-support) lists the versions that have one. Only `affected` needs it: every other entry point has no TypeScript dependency and type-checks under 5, 6 and 7, which is why `typescript` is an optional peer. Output goes to stdout and diagnostics to stderr. The exit status is `0` on success, `1` if it could not run and `2` for a usage error.

It narrows only when it can be sure. Any of these makes it report **everything** (still exit `0`, with the reason on stderr):

- a lockfile, a tool config or CI file;
- a file it cannot place;
- a module that does not parse;
- a dynamic `import()` or `require()` it cannot read;
- git failing.

Declare a coupling it cannot see in `package.json`, such as a test that reads a fixture without importing it. An undeclared one is treated as unplaced (so: everything):

```json
{
  "repo-contract": {
    "affected": {
      "ignore": ["docs/**"],
      "links": [{ "when": "test/fixtures/**", "run": ["test/golden/**"] }]
    }
  }
}
```

`ignore`, `triggers`, `tests` and `notMutated` take globs; an unknown key is an error, so a typo cannot silently drop a link. Path aliases (`paths` in `tsconfig.json`, including through `extends`) are honoured. A tsconfig it cannot read, or one that uses project references, makes it report everything. To avoid that, point `--tsconfig` at the config that holds the paths. Why it works this way: [ADR 0021](specs/decisions/0021-affected-scope-is-a-pure-analysis-that-only-ever-widens.md). Release runs should always run everything.

### Choose a run's scope and reuse results

`repo-contract/affected` also has the two pieces a contract script needs to act on the answer. Both are pure: the environment and the store are passed in, so nothing reads `process.env` or the disk on your behalf.

```ts
import {
  computeAffectedFromGit,
  createCache,
  parseScopeArgs,
  resolveScope,
  resolveCacheMode,
} from "repo-contract/affected"
import { createFileCacheStore } from "repo-contract/helpers"

const args = parseScopeArgs(process.argv.slice(2)) // --scope auto|affected|full, --base <ref>
if (!args.ok) throw new Error(args.error)
const { scope, reason } = resolveScope({ requested: args.scope, env: process.env })
const { mode } = resolveCacheMode({ scope, env: process.env })
const cache = createCache({ store: createFileCacheStore(".repo-contract/cache"), mode })
```

- **Scope.** `auto` (the default) validates the affected part of the tree for a pull request or a local run. It validates all of it for any other CI event and for a CI system it does not recognise. A release (the `release` event or a `refs/tags/` ref) is always validated in full, whatever `--scope` says. `CI_FULL=1` forces a full run over everything else; `REPO_CONTRACT_SCOPE` sets a default below the flag. The reason is returned so a run can print it.
- **Cache.** A result is stored under a digest of the check, every input's name and content digest, the tool versions and the cache format. It is therefore only ever replayed for exactly the same inputs. An unreadable or inconsistent entry is a miss, never a replay. A **full run is always cold**: the cache is neither read nor written, so a release cannot be satisfied by an earlier result. `REPO_CONTRACT_CACHE=off|ro|rw` and a flag change the mode for other runs. `cache.why(check, inputs)` says which inputs differ from the check's latest entry.
- **Housekeeping.** `repo-contract cache stats`, `clear` and `prune --max-age 7d --max-entries 200` work on `.repo-contract/cache` (`--cache-dir`, `-C`, `--json`). Keep the directory out of git.

The caller decides what the cache is keyed on. Anything that can change a result and is left out of the inputs can make a stale result replay. That is why a check that uses the cache should hash its declared inputs and tool versions, and why releases bypass the cache. This repository's own contract runs every check cold on every run (its checks declare no cache inputs yet). It uses the cache only in tests. The reasoning is in [ADR 0022](specs/decisions/0022-a-full-run-is-cold-and-a-cache-replays-only-identical-inputs.md).

### Speed features and their proof

The commands below are exercised end to end by `test/integration/affected/workflow.test.ts`, so their output is tested, not illustrative. The library functions they mention (`resolveFailFast`, `findEscapes`, `maturityLevel`, `buildEvidenceManifest`) are covered by their own unit tests instead. Each feature is opt-in; with none of them, a run reports every problem and runs everything.

**Run less on a pull request.** `repo-contract affected --tests` lists only the tests a change can reach; `--explain` says why (`src/math.ts#double changed -> ...`). Give a CI checkout `fetch-depth: 0` or it cannot see the base commit and runs everything.

**Split mutation testing across CI jobs.** Plan the matrix, then give each job its share. The shards together are exactly the mutation targets, with no overlap:

```sh
npx repo-contract affected --plan-shards --target-minutes 10 --max-shards 8 --timings timings.json
# {"count": 3, "include": [{"shard": 1, "total": 3, "spec": "1/3"}, ...]}  -> strategy.matrix: ${{ fromJSON(...) }}
npx repo-contract affected --mutate --shard 2/3 --timings timings.json     # this job's files
```

`--shards <n>` sets the shard count instead of `--target-minutes`. `--timings` is a JSON object of file to milliseconds from a previous run; without it every file weighs the same. Combine the shards' Stryker reports with `repo-contract merge-mutation --total 3 --out reports/mutation.json 1=s1.json 2=s2.json 3=s3.json` (or `mergeMutationReports` from `repo-contract/affected`). It exits `1` and writes nothing if a shard is missing, repeated or unreadable, or if two shards mutated the same file. A lost shard can therefore never look like a better score.

**Stop early, if you want to.** Mark slow checks `expensive: true` and pass `failFast: true` (or `--fail-fast`, `REPO_CONTRACT_FAIL_FAST=1` through `resolveFailFast`). Once a cheap check fails, expensive ones that have not started are recorded as `status: "aborted"` with `skipReason: "fail-fast"` and fail their policy. A release never fails fast. Declare the expensive check after (or `dependsOn`) the cheap ones to make the skip certain.

**Find what is slowing you down.** `repo-contract doctor` reports:

- a cache directory that is not ignored;
- a coverage config without the `json` reporter;
- a shallow CI checkout;
- missing hooks;
- `export *` barrels, which widen a change to everything behind them.

`doctor --fix` applies only the safe fix (the `.gitignore` line) and shows it first. `repo-contract cache why tests --inputs inputs.json` names the inputs that changed since a check's last cached result.

**Prove the narrow scope is sound.** After a merge, run everything once and call `findEscapes({ affectedTests, allTests, failedInFullRun })` (`repo-contract/affected`). Any test that failed in the full run but was left out of the affected set is an escape. `clean: false` means the analysis needs a wider rule.

**Measure it.** After each run, append `serializeRunRecord(createRunRecord({...}))` from `repo-contract/metrics` to `.repo-contract/metrics/runs.jsonl`. `repo-contract metrics` (or `--json`) then shows:

- pass rate;
- cache hit ratio;
- how much of the suite affected runs needed;
- estimated minutes saved;
- first-pass rate;
- the mutation trend.

`--log <file>`, `--since <when>` and `--actor human|agent` choose which runs it reads.

`maturityLevel` turns the facts into a level from 0 to 4 and says what the next one needs. `buildEvidenceManifest` records a release's full, cache-free run of a named commit with a SHA-256 of each check's evidence. This repository's `scripts/run-contract.mjs` writes one to `reports/evidence-manifest.json` after a passing full run on a clean working tree. The caller states the scope and cache mode, and it refuses anything else. The digest catches an accidental edit but is not a signature. To make tampering detectable, attest the manifest, for example with GitHub's `actions/attest`. Nothing leaves your machine. Why these are opt-in and how skips stay visible: [ADR 0023](specs/decisions/0023-speed-features-are-opt-in-and-every-skip-is-visible.md).

## Regression detection

repo-contract has no built-in baseline system. The core engine does not read or write files on its own initiative. Beyond spawning the commands you configure, it only parses that command's own captured stdout when you set `output: { format: "json" | "text" }`.

A handful of published presets (`securitySecrets`, `duplication`, `markdownlint`) additionally read back a fixed report file their own `run` command was told to write. That is always the preset's own single, hardcoded path, never a scan of arbitrary files.

The opt-in pieces added in 0.12.0 write only where you point them:

- `createFileCacheStore` (`repo-contract/helpers`) keeps the result cache in the directory you name.
- `repo-contract/metrics` builds the run records that the caller (here `scripts/run-contract.mjs`) appends to a log file.

If your repository wants regression detection, persist the evidence or relevant measurements yourself and compare them in your policy:

```ts
import baseline from "./baseline.json"

policy: ({ result }) => {
  const current = (result.output?.value as { score: number }).score
  return current >= baseline.mutation.score
    ? { outcome: "pass", rationale: `Mutation score was ${current}.` }
    : {
        outcome: "fail",
        rationale: `Mutation score regressed from ${baseline.mutation.score} to ${current}.`,
      }
}
```

## Errors

repo-contract distinguishes several failure categories and does not conflate them. See the generated [API report](docs/api-report/index/README.md) for each error class's exact shape and `code` string.

- **Configuration errors** (`InvalidRepoContractConfigError`, `InvalidCheckConfigError`): structurally invalid configuration, thrown synchronously before anything spawns.
- **Execution outcomes**: missing binaries, timeouts, non-zero exits, signals, aborted processes. Recorded as evidence rather than thrown, so repository policies can decide what they mean.
- **Parser errors**: requested output that cannot be parsed. Recorded as `{ success: false, error }` on `result.output`, while raw stdout remains available.
- **Policy failures**: your policy returns `{ outcome: "fail", rationale }`. Not an error in repo-contract; the contract working correctly.
- **Policy throwing**: a synchronous throw or rejected promise from policy code. `runRepoContract()` rejects with `PolicyThrewError` (or an `AggregateError`). Two specific mistakes get their own error naming the check. `PolicyReadUnrequestedOutputError` covers reading `result.output` on a check that never configured `output`. `PolicyReadFailedParseValueError` covers reading `.value` on a check whose parse failed.
- **Schema throwing**: `output.schema["~standard"].validate()` itself throwing rejects with `StandardSchemaValidateThrewError`. A schema _returning_ failure `issues`, by contrast, is an ordinary parser-error-shaped `result.output`.

## Troubleshooting

Find the symptom, then follow the cause to the fix. The [Errors](#errors) section explains the failure categories behind these.

| Symptom                                                                                        | Cause                                                                                                                                                                                                                   | What to do                                                                                                                                               |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A preset check fails with "`<tool>` is required by this preset but was not found"              | The tool could not be started (`status: "spawn_error"`, code `ENOENT`).                                                                                                                                                 | Install it as a development dependency, and run the contract through an npm script such as `npm run contract` so npm puts `node_modules/.bin` on `PATH`. |
| `init` left out a check you expected                                                           | `init` only wires up tools it finds in your `devDependencies`, and it does not create the tools' own configuration.                                                                                                     | Install the tool, then add its [preset](#presets) to your config.                                                                                        |
| A tool behaves differently than in your shell, or cannot find `PATH`, `HOME` or a token        | You supply `env`; repo-contract never reads `process.env` itself ([ADR 0011](specs/decisions/0011-process-spawning-and-ambient-environment-access-are-consumer-supplied-capabilities-not-package-owned.md)).            | Pass `env: process.env`, or the variables the tool needs, to `defineRepoContract`. See [Supplying `spawn` and `env`](#supplying-spawn-and-env).          |
| On Windows, checks for npm-installed tools fail to start                                       | Node refuses to run `.cmd` shims through plain `node:child_process.spawn` without `shell: true` (its CVE-2024-27980 mitigation).                                                                                        | Supply `cross-spawn` as `spawn`, which resolves the shims safely, or set `shell: true`. See [Supplying `spawn` and `env`](#supplying-spawn-and-env).     |
| Config throws `run string contains an unquoted "&"`                                            | A string `run` is split into arguments without a shell, so `&&`, pipes and redirects are not available.                                                                                                                 | Use the array form, or set `shell: true` (then `run` must be a string). See [`run`](#run).                                                               |
| `runRepoContract()` rejects with `PolicyThrewError` after a policy returned "see output above" | repo-contract rejects rationales that only point back at raw output, such as "see output above" or "check the report for details" ([ADR 0016](specs/decisions/0016-vague-rationale-is-a-structural-policy-failure.md)). | Say what happened and what to do next in the rationale: the count, the file, the threshold.                                                              |
| `PolicyReadUnrequestedOutputError` or `PolicyReadFailedParseValueError`                        | A policy read `result.output` on a check with no `output`, or `.value` on a check whose parse failed.                                                                                                                   | Add `output` to the check, or test `result.output.success` before reading `.value`. See [Errors](#errors).                                               |
| A check ends with `status: "timed_out"`                                                        | It ran longer than its `timeoutMs`.                                                                                                                                                                                     | Raise `timeoutMs` on that check, or fix the slow tool.                                                                                                   |

Still stuck? [SUPPORT.md](SUPPORT.md) says what to include in an issue.

## `Evidence` and `Verdict` shapes

Browse the generated [HTML API reference](https://maverickcer.github.io/repo-contract/api/) for the full field-by-field shape of `Evidence`, `CheckEvidence`, `Verdict`, and every error class. This repository's own `api-docs-report` check regenerates the underlying [markdown reports](docs/api-report/index/README.md) on every commit and byte-compares them against the source. The reference therefore can never drift from what the package actually exports.

```ts
interface Evidence {
  version: 1
  startedAt: string
  completedAt: string
  durationMs: number
  checks: Record<
    string,
    {
      command: string
      args: readonly string[]
      startedAt: string
      completedAt: string
      durationMs: number
      exitCode: number | null
      signal: NodeJS.Signals | null
      stdout: string
      stderr: string
      status: "completed" | "timed_out" | "signaled" | "host_terminated" | "spawn_error" | "aborted"
      spawnError?: string
      output?:
        | { format: string; success: true; value: unknown }
        | { format: string; success: false; error: string }
    }
  >
}

interface Verdict {
  version: 2
  passed: boolean
  checks: Record<string, { outcome: "pass" | "fail" | "warn"; rationale: string }>
}
```

`status` distinguishes **why** a process ended in its terminal state, independently of whether the policy considered that result acceptable. A non-zero exit code is `status: "completed"`, not an execution error.

## Runtime support

The version ranges, generated from `package.json`. The optional `typescript` peer serves `repo-contract/affected` only, which needs version 5 or 6 (TypeScript 7 ships no compiler API). CI's `typescript-compat` job checks the newest release of 5, 6 and 7: importing `repo-contract/affected` fails under 7, and every other entry point type-checks under all three. Older 5.x releases, down to the peer's `5.0.0` floor, are not tested.

<!-- ipc:begin supported-versions -->

| Requirement  | Range      | Needed   |
| ------------ | ---------- | -------- |
| Node.js      | `>=22.0.0` | always   |
| `typescript` | `>=5.0.0`  | optional |

<!-- ipc:end supported-versions -->

| Environment                                | Supported                                                                                                                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js `>=22.0.0` (macOS, Linux, Windows) | Yes                                                                                                                                                                                                         |
| Bun (latest release)                       | Yes. Tested in CI against the real published package shape. No non-default permissions needed.                                                                                                              |
| Deno (latest release)                      | Yes. Tested in CI against the real published package shape. Requires `--allow-read --allow-run --allow-env` (see [ADR 0003](specs/decisions/0003-cross-platform-command-execution-and-process-cleanup.md)). |
| Browser                                    | No: this package executes local processes                                                                                                                                                                   |

repo-contract's checks run as spawned processes and read the ambient environment, but the package itself never imports a process-spawning implementation or reads `process.env`. It is server/CLI-only by design regardless, since the capability a consumer supplies is itself always a real Node-only spawning mechanism. See [ADR 0003](specs/decisions/0003-cross-platform-command-execution-and-process-cleanup.md) for what "tested" covers.

### Package managers

npm is the supported and fully tested package manager: every CI job installs with it. CI's `package-managers` job (`scripts/package-managers-smoke.mjs`) tests one thing for pnpm, Yarn 1 and Yarn Berry with the `node-modules` linker. The packed tarball installs, and every entry point imports, as ESM and as CommonJS. Nothing wider is claimed for them. Yarn Plug'n'Play and pnpm without `node-modules` hoisting are unsupported.

## Accessibility

repo-contract has no user interface. It produces machine-readable `Evidence`/`Verdict` objects and typed errors. Any rendering (a terminal summary, a CI annotation, a dashboard) is the consumer's surface, and WCAG / accessibility conformance applies there.

## Advanced: governed exceptions

**Stable** since [ADR 0019](specs/decisions/0019-helpers-promoted-presets-stay-experimental.md) (see [VERSIONING.md](VERSIONING.md)): a changed signature or behavior is a breaking change. Only the `exceptions-walkthrough` example is still Experimental, and `repoContractLogs` with its two hooks is listed as beta in `docs/surface.json`.

`repo-contract/helpers` lets a check permit a specific, named, justified exception to an otherwise-blocking finding. Examples include "this dependency's advisory is a known false positive" and "this network capability is reviewed and accepted". It is the matching, precedence, and field-completeness logic you would otherwise hand-roll, extracted and generalized. It's the same mechanism this repository's own `suppression-governance` check uses to gate `disable-comments.json`.

It decides nothing and matches nothing on its own. You supply a classification (`{ group, category }`), a policy configuration, and a way to read a field's current value off your own record shape. It resolves the strictest applicable policy and tells you which required fields (if any) are still empty:

```ts
import { evaluateExceptionRecord } from "repo-contract/helpers"
import type { ExceptionPolicyConfig } from "repo-contract/helpers"

const policy: ExceptionPolicyConfig = {
  socket: {
    rules: {
      critical: { mode: "forbidden" },
      high: { mode: "forbidden" },
      medium: { mode: "exception", requirements: ["justification", "alternatives"] },
    },
  },
}

const determinant = evaluateExceptionRecord({
  record: myFinding,
  classifications: [{ group: "socket", category: myFinding.severity }],
  config: policy,
  globalDefault: { mode: "forbidden" },
  fieldValue: (record, field) => (record as Record<string, string>)[field] ?? "",
})

// determinant.verdict: "forbidden" | "insufficient" | "permitted"
// determinant.missing: which required fields (if any) are still empty
```

`resolveExceptionPolicy` alone answers "what policy applies to this classification". It tries an exact match, then a glob (via the package's own dependency-free `globMatch`, [ADR 0017](specs/decisions/0017-own-glob-matcher-replaces-minimatch.md)), then the group's own default, then your global default.

`loadExceptionRegistry` reads and validates one exception-registry file's envelope (`{ "exceptions": [...] }`) from disk against a [Standard Schema](https://standardschema.dev) you supply. A missing file is a normal, empty-registry state, never an error.

`hashRequirementFields` produces a deterministic digest of a set of fields' current values, useful for binding a sign-off to the exact prose it approved.

This package deliberately does **not**:

- decide what a "finding" is;
- match a finding to a registry record;
- derive a canonical identity for either one.

Those stay entirely up to you.

[`examples/exceptions-walkthrough/`](examples/exceptions-walkthrough/README.md) is a runnable end-to-end use of every helper.

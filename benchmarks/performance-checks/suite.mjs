// repo-contract benchmark suite 1 of 3: running checks (`runChecks`, the scheduler and process
// orchestration). How to read and write one: ../READING-BENCHMARKS.md and ../WRITING-BENCHMARKS.md.
//
// This benchmarks the package's OWN source (`src/`) through tsx, the same way a unit test reaches into
// its repository -- it is not a model for how an external consumer imports repo-contract.

import { spawn } from "node:child_process"
import { defineSuite } from "internal-package-contract/benchmark"
import { runChecks } from "../../src/execution/run-checks.ts"
import { runRepoContract } from "../../src/run-repo-contract.ts"
import { generateCheckGraph } from "./fixtures.mjs"

const CONCURRENCY = 8
// Every check really spawns a process, so one sample of the larger sizes takes seconds to minutes;
// a handful of samples is the honest budget.
const SPAWN_BOUND = { warmupIterations: 0, minIterations: 3, maxIterations: 3, targetDurationMs: 0 }
const execution = () => ({ spawn, env: process.env, shell: false })

/** The bare minimum without repo-contract: spawn the same trivial process `n` times, `CONCURRENCY` at a time. */
async function bareSpawns(n) {
  let next = 0
  const worker = async () => {
    while (next < n) {
      next += 1
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" })
        child.on("exit", resolve)
        child.on("error", reject)
      })
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return n
}

const CHECKS = {
  name: "configured checks",
  how: "swept",
  description:
    "The tier axis: how many checks a repository configures and runs in one contract run.",
}
const PROCESS = {
  name: "work per check",
  how: "fixed",
  value: 'the fastest real process (node -e "")',
  description:
    "Every check spawns a real process that does nothing, so the cost measured is repo-contract's scheduling, not the tool a real check would run.",
}
const CONCURRENCY_VARIABLE = {
  name: "concurrency",
  how: "fixed",
  value: CONCURRENCY,
  description: "Eight checks run at a time; more cores allow more, fewer allow less.",
}
const RUNTIME = {
  name: "runtime",
  how: "fixed",
  value: "Node (V8)",
  description: "Measured on Node only.",
}

export default defineSuite({
  package: { name: "repo-contract", bundleFiles: ["dist/index.js", "dist/presets.js"] },
  tiers: [20, 40, 80, 160, 320, 640, 1280, 2560],

  workload: {
    unit: "check",
    description:
      "One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.",
    typicalN: 80,
  },

  endToEnd: {
    purpose:
      "Shows what a repository pays, per contract run, for having repo-contract orchestrate its checks instead of spawning the same processes itself. Both sides spawn exactly the same trivial processes at the same concurrency; the difference is repo-contract's dependency scheduling, evidence capture, output handling and policy evaluation. This is CI and pre-push time, paid on every run: the floor under whatever the real tools cost.",
    baseline: {
      description: "Spawn n trivial processes directly, eight at a time, with no repo-contract.",
      sampling: SPAWN_BOUND,
      setup: (n) => n,
      run: (n) => bareSpawns(n),
    },
    withPackage: {
      description:
        "`runChecks` runs n trivial checks (every fifth depends on the one before it) through the real scheduler, spawning the same processes at the same concurrency.",
      sampling: SPAWN_BOUND,
      setup: (n) => generateCheckGraph(n).checks,
      run: (checks) => runChecks(checks, CONCURRENCY, execution()),
    },
    variables: [
      CHECKS,
      PROCESS,
      CONCURRENCY_VARIABLE,
      RUNTIME,
      {
        name: "dependency shape",
        how: "fixed",
        value: "every fifth check depends on its predecessor",
        description:
          "Real contracts have a few dependency edges; chains and barriers are measured as variants of runChecks below.",
      },
    ],
  },

  notBenchmarked: {
    commitlint:
      "It only assembles one check definition from two short strings, a constant amount of work done once; the commit-message tool it runs is a process the contract itself spawns and times.",
    distNoUrls:
      "It only assembles one check definition from two short options, a constant amount of work done once; the scan the check performs is a process the contract itself spawns and times.",
    onEvidenceSaveToRepoContractLogs:
      "A thin wrapper that returns the `saveEvidence` hook of `repoContractLogs`, which `save-evidence-to-logs` in the policy-evidence suite benchmarks with every one of its options accounted for.",
    onVerdictPrependRepoContractLogs:
      "A thin wrapper that returns the `prependVerdict` hook of `repoContractLogs`, which `prepend-verdict-to-logs` in the policy-evidence suite benchmarks with every one of its options accounted for.",
  },

  functions: [
    {
      id: "run-checks",
      name: "runChecks (scheduler and process orchestration)",
      why: "It is the engine of every contract run: every check in every repository passes through it. Its overhead is paid on every pre-push, every pull request and every CI job.",
      poorPerformanceMeans:
        "Slower pre-push hooks and CI jobs in direct proportion to how many checks a repository configures; developers start skipping hooks that feel slow, and a super-linear scheduler would punish exactly the repositories that adopt the most checks.",
      expectedComplexity: "linear",
      complexityReason:
        "Each check is scheduled once, spawned once and its output captured once, with a bounded number running at a time; dependency edges are looked up in a map. So total time is proportional to the number of checks (divided by the concurrency).",
      variables: [
        CHECKS,
        PROCESS,
        CONCURRENCY_VARIABLE,
        {
          name: "dependency structure",
          how: "variant",
          description:
            "No dependencies, a few dependency edges, or frequent isolated barriers that serialize the run.",
        },
        {
          name: "output volume",
          how: "fixed",
          value: "none",
          description:
            "The processes print nothing; large outputs are measured in the policy-evidence suite.",
        },
        RUNTIME,
      ],
      variants: [
        {
          name: "no-dependencies",
          description:
            "Every check is independent, so the scheduler can always keep eight running.",
          options: { dependencies: false, isolatedEvery: 0 },
        },
        {
          name: "few-dependencies",
          description:
            "Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.",
          options: { dependencies: true },
        },
        {
          name: "frequent-barriers",
          description:
            "Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.",
          options: { dependencies: true, isolatedEvery: 20 },
        },
        {
          name: "with-reporting-hook",
          description:
            "The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.",
          options: { dependencies: true, hook: true },
        },
      ],
      notCovered: [
        {
          name: "long dependency chains",
          reason:
            "A chain through every check serializes the whole run and measures process latency, not scheduling; real contracts do not do this.",
        },
        {
          name: "check timeouts and aborts",
          reason: "They are failure paths; the steady-state cost is the successful run.",
        },
      ],
      inEndToEnd: {
        callsPerOperation: 1,
        variant: "few-dependencies",
        description: "This is the end-to-end operation itself.",
      },
      sampling: SPAWN_BOUND,
      setup: (n, options) => ({
        checks: generateCheckGraph(n, options ?? {}).checks,
        hook: options?.hook === true,
      }),
      run: ({ checks, hook }) =>
        runChecks(
          checks,
          CONCURRENCY,
          execution(),
          hook ? { onEvidence: (_id, evidence) => evidence.durationMs } : undefined,
        ),
    },
    {
      id: "run-repo-contract",
      name: "runRepoContract",
      why: "It is the public entry point of every contract run: it validates the configuration, schedules and spawns the checks, assembles the evidence and judges it, so it is what every pre-push and every CI job calls.",
      poorPerformanceMeans:
        "Slower pre-push hooks and CI jobs in proportion to how many checks a repository configures, and a concurrency setting that no longer shortens a run would waste every extra core.",
      expectedComplexity: "linear",
      complexityReason:
        "Each check is scheduled, spawned and judged once, with a bounded number running at a time, so total time is proportional to the number of checks.",
      variables: [
        CHECKS,
        PROCESS,
        {
          name: "concurrency",
          how: "swept",
          description: "How many checks run at a time.",
        },
        {
          name: "hooks",
          how: "variant",
          description: "Whether the run reports progress through `onEvidence` and `onVerdict`.",
        },
        RUNTIME,
      ],
      variants: [
        {
          name: "plain",
          description: "No hooks: the shape of a run that only wants its verdict.",
          options: { hooks: false },
        },
        {
          name: "with-hooks",
          description:
            "Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.",
          options: { hooks: true },
        },
      ],
      sweeps: [
        {
          variable: "concurrency",
          description: "How many checks run at a time.",
          baseValue: CONCURRENCY,
          primaryValue: 80,
          tiers: [1, 2, 4, 8, 16],
          expectedComplexity: "constant",
          complexityReason:
            "More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.",
        },
      ],
      tiers: [20, 40, 80, 160],
      tiersReason:
        "Every check spawns a real process and the whole run is measured, so sizes beyond a few hundred take minutes per sample; `run-checks` already measures the scheduler to 2,560.",
      covers: {
        runRepoContract: {
          "config.checks": "swept",
          "config.concurrency": "sweep:concurrency",
          "config.env":
            "fixed: `process.env`, passed by reference as the contract's own config does",
          "config.killProcessTree":
            "not covered: only used on Windows to end a check's process tree after a timeout or an abort",
          "config.shell": "fixed: `false`, the argv-only default every check here uses",
          "config.spawn":
            "fixed: node's `child_process.spawn`, as the contract's own config passes it",
          "options.checks":
            "fixed: every check selected, which is what a full contract run does; selecting fewer is the same work on fewer checks",
          "options.onEvidence": "variant:with-hooks",
          "options.onVerdict": "variant:with-hooks",
          "options.signal":
            "not covered: an abort is a failure path; the steady-state cost is the successful run",
        },
      },
      inEndToEnd: {
        callsPerOperation: 0,
        description:
          "Not part of the end-to-end operation, which measures the scheduler on its own (`run-checks`).",
      },
      sampling: SPAWN_BOUND,
      setup: (_n, options, context) => ({
        checks: generateCheckGraph(context.values.check, { dependencies: true }).checks,
        concurrency: context.values.concurrency,
        hooks: options?.hooks === true,
      }),
      run: ({ checks, concurrency, hooks }) =>
        runRepoContract(
          { checks, concurrency, spawn, env: process.env },
          hooks
            ? {
                onEvidence: (_id, evidence) => evidence.durationMs,
                onVerdict: (_id, result) => result.outcome,
              }
            : undefined,
        ),
    },
  ],
})

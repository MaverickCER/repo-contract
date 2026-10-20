// repo-contract benchmark suite 2 of 3: turning check results into evidence and verdicts
// (`buildEvidence`, `runPolicies`) -- pure, in-memory work with no process spawned, so it is isolated
// from the spawn noise of suite 1. How to read and write one: ../READING-BENCHMARKS.md and
// ../WRITING-BENCHMARKS.md. Benchmarks the package's own source (`src/`) through tsx.

import { defineSuite } from "internal-package-contract/benchmark"
import { buildEvidence } from "../../src/evidence/build-evidence.ts"
import { runPolicies } from "../../src/policy/run-policies.ts"
import { repoContractLogs } from "../../src/helpers/contract-logs.ts"
import { renderMarkdownSummary, serializeRun } from "../../src/report/render-summary.ts"
import { generateEvidenceFixture } from "./fixtures.mjs"

const SMALL = 500
const LARGE = 10_000

const CHECKS = {
  name: "checks evaluated",
  how: "swept",
  description: "The tier axis: how many check results are turned into evidence and judged.",
}
const PAYLOAD = {
  name: "output per check",
  how: "variant",
  description:
    "How many bytes of parsed JSON output each check produced: a quiet tool (500 B) versus a chatty linter (10 KB).",
}
const POLICY = {
  name: "policy work",
  how: "fixed",
  value: "reads its own parsed output and its dependencies' evidence",
  description:
    "A real, non-trivial policy; an application's own policy logic adds its own cost on top.",
}
const DEPENDENCIES = {
  name: "dependency lookups",
  how: "fixed",
  value: "about 15% of checks depend on an earlier check",
  description: "Exercises the per-check dependency-evidence gathering loop.",
}
const RUNTIME = {
  name: "runtime",
  how: "fixed",
  value: "Node (V8)",
  description: "Measured on Node only.",
}

/** Files kept in a map, so the benchmark measures the package's own work and not the disk. */
const memoryFileSystem = (files) => ({
  mkdir: () => Promise.resolve(),
  readdir: () => Promise.resolve([...files.keys()].map((file) => file.split("/").pop())),
  readFile: (file) => Promise.resolve(files.get(file) ?? ""),
  rm: (file) => {
    files.delete(file)
    return Promise.resolve()
  },
  writeFile: (file, text) => {
    files.set(file, text)
    return Promise.resolve()
  },
})

const fixture = (n, bytes) => generateEvidenceFixture(n, bytes).entries
const variants = [
  {
    name: "quiet-output",
    description: "Each check printed about 500 bytes of JSON.",
    options: { bytes: SMALL },
  },
  {
    name: "chatty-output",
    description: "Each check printed about 10 KB of JSON (a linter with many findings).",
    options: { bytes: LARGE },
  },
]

export default defineSuite({
  package: { name: "repo-contract", bundleFiles: ["dist/index.js", "dist/presets.js"] },

  workload: {
    unit: "check",
    description:
      "One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.",
    typicalN: 80,
  },

  endToEnd: {
    purpose:
      "Shows what a contract run pays, after the checks have finished, for turning their raw results into structured evidence and a verdict, compared with the bare minimum of parsing each check's output and counting its findings. Neither side runs a process; this is pure CPU on data already in memory, paid once per contract run.",
    baseline: {
      description:
        "Parse each check's JSON output and count its findings by hand -- the least anyone would do to know what the checks said.",
      setup: (n) => fixture(n, SMALL),
      run: (entries) => {
        let findings = 0
        for (const [, , evidence] of entries) findings += JSON.parse(evidence.stdout).findingCount
        return findings
      },
    },
    withPackage: {
      description:
        "`buildEvidence` assembles the run's evidence record and `runPolicies` evaluates every check's policy against it, with dependency lookups.",
      setup: (n) => fixture(n, SMALL),
      run: async (entries) => {
        const { evidence, entries: built } = await buildEvidence(entries, new Date(0), new Date(1))
        return runPolicies(built, evidence)
      },
    },
    variables: [
      CHECKS,
      {
        name: "output per check",
        how: "fixed",
        value: "about 500 bytes",
        description: "Output volume is measured as a variant in each function below.",
      },
      POLICY,
      DEPENDENCIES,
      RUNTIME,
    ],
  },

  functions: [
    {
      id: "build-evidence",
      name: "buildEvidence",
      why: "Every contract run assembles one evidence record from all its checks' results; it is the structured, shareable artifact the run produces.",
      poorPerformanceMeans:
        "Slower contract runs after the tools have already finished, growing with the number of checks and with how much each prints; a super-linear regression would show first in repositories with chatty linters.",
      expectedComplexity: "linear",
      complexityReason:
        "It processes each check's result once -- parsing its configured output format and recording one evidence entry -- so cost is proportional to the number of checks and the bytes of output they carry.",
      variables: [
        CHECKS,
        PAYLOAD,
        {
          name: "output format",
          how: "fixed",
          value: "json",
          description: "Text and YAML outputs take other parsers and are not covered.",
        },
        RUNTIME,
      ],
      variants,
      inEndToEnd: {
        callsPerOperation: 1,
        variant: "quiet-output",
        description: "Once per contract run, before policies are evaluated.",
      },
      setup: (n, options) => fixture(n, options?.bytes ?? SMALL),
      run: (entries) => buildEvidence(entries, new Date(0), new Date(1)),
    },
    {
      id: "run-policies",
      name: "runPolicies",
      why: "It turns evidence into the verdict a contract run reports and exits with; it evaluates every check's policy, which is where a repository's own rules run.",
      poorPerformanceMeans:
        "Slower verdicts in proportion to the number of checks, and a super-linear dependency lookup would make the largest contracts the slowest to judge.",
      expectedComplexity: "linear",
      complexityReason:
        "Each check's policy runs once with a context built from its own result and its dependencies' evidence (looked up in a map), so cost is proportional to the number of checks.",
      variables: [CHECKS, PAYLOAD, POLICY, DEPENDENCIES, RUNTIME],
      variants,
      inEndToEnd: {
        callsPerOperation: 1,
        variant: "quiet-output",
        description: "Once per contract run, after evidence is built.",
      },
      setup: async (n, options) => {
        const entries = fixture(n, options?.bytes ?? SMALL)
        const built = await buildEvidence(entries, new Date(0), new Date(1))
        return built
      },
      run: ({ evidence, entries }) => runPolicies(entries, evidence),
    },
    {
      id: "run-policies-with-verdict-hook",
      name: "runPolicies with an onVerdict hook",
      why: "Every contract run that reports verdicts as they arrive (the CLI and any editor integration) passes this hook; its cost must stay negligible next to the policies themselves.",
      poorPerformanceMeans:
        "Progress reporting would slow the verdict it reports on, and a hook that costs more than the policy would make reporting something people switch off.",
      expectedComplexity: "linear",
      complexityReason:
        "The hook is called once per check with its own result, so it adds a constant per check to the linear policy pass.",
      variables: [CHECKS, PAYLOAD, POLICY, DEPENDENCIES, RUNTIME],
      variants,
      inEndToEnd: {
        callsPerOperation: 0,
        description:
          "Not part of the end-to-end operation, which passes no hook; measured to show what the hook adds.",
      },
      setup: async (n, options) => {
        const entries = fixture(n, options?.bytes ?? SMALL)
        return buildEvidence(entries, new Date(0), new Date(1))
      },
      run: ({ evidence, entries }) =>
        runPolicies(entries, evidence, (_id, result) => result.outcome),
    },
    {
      id: "render-markdown-summary",
      name: "renderMarkdownSummary",
      why: "Every contract run that reports to a pull request or a job summary renders its verdict as Markdown once, from all of its checks.",
      poorPerformanceMeans:
        "A slower report at the end of every run, growing with the number of checks and with the length of each failure's rationale.",
      expectedComplexity: "linearithmic",
      complexityReason:
        "Each check is counted and listed once, and the checks are sorted by duration to find the slowest, so cost grows a little faster than the number of checks.",
      variables: [
        CHECKS,
        {
          name: "slowest",
          how: "swept",
          description: "How many of the slowest checks the summary lists.",
        },
        {
          name: "outcomes",
          how: "fixed",
          value: "every tenth check fails and every fifth warns",
          description:
            "Failures print their whole rationale in a fenced block, so more of them cost more.",
        },
        RUNTIME,
      ],
      sweeps: [
        {
          variable: "slowest",
          description: "How many of the slowest checks the summary lists.",
          baseValue: 5,
          primaryValue: 640,
          expectedComplexity: "constant",
          complexityReason:
            "Each listed check adds one table row, so cost rises with this value until it reaches the 640 checks held during the sweep, then stops: the list never outgrows the checks it ranks. Sorting all 640 costs the same throughout, which keeps the rise to about half.",
        },
      ],
      covers: {
        renderMarkdownSummary: {
          "verdict.checks": "swept",
          "verdict.passed": "fixed: derived from the outcomes, one boolean",
          "verdict.version": "fixed: the schema version, one number",
          "evidence.checks": "swept",
          "evidence.completedAt": "fixed: one timestamp, not read by the summary",
          "evidence.durationMs": "fixed: one number, not read by the summary",
          "evidence.startedAt": "fixed: one timestamp, not read by the summary",
          "evidence.version": "fixed: the schema version, one number",
          "options.slowest": "sweep:slowest",
          "options.title": "fixed: one short heading, whose length does not change the work",
        },
      },
      inEndToEnd: {
        callsPerOperation: 0,
        description: "Not part of the end-to-end operation, which ends at the verdict.",
      },
      setup: async (_n, _options, context) => {
        const entries = fixture(context.values.check, SMALL)
        const built = await buildEvidence(entries, new Date(0), new Date(1))
        return {
          ...built,
          verdict: await runPolicies(built.entries, built.evidence),
          slowest: context.values.slowest,
        }
      },
      run: ({ verdict, evidence, slowest }) =>
        renderMarkdownSummary(verdict, evidence, { slowest }),
    },
    {
      id: "serialize-run",
      name: "serializeRun",
      why: "A contract run that keeps its result as files serializes its evidence and verdict once.",
      poorPerformanceMeans:
        "A slower end to every run that persists its result, growing with the number of checks and with how much each printed.",
      expectedComplexity: "linear",
      complexityReason:
        "Both documents are walked once by the JSON serializer, so cost is proportional to the number of checks and the text they hold.",
      variables: [CHECKS, PAYLOAD, RUNTIME],
      variants,
      covers: {
        serializeRun: {
          "run.evidence": "swept",
          "run.verdict": "swept",
        },
      },
      inEndToEnd: {
        callsPerOperation: 0,
        description: "Not part of the end-to-end operation, which ends at the verdict.",
      },
      setup: async (n, options) => {
        const entries = fixture(n, options?.bytes ?? SMALL)
        const built = await buildEvidence(entries, new Date(0), new Date(1))
        return {
          evidence: built.evidence,
          verdict: await runPolicies(built.entries, built.evidence),
        }
      },
      run: (run) => serializeRun(run),
    },
    {
      id: "save-evidence-to-logs",
      name: "repoContractLogs saveEvidence",
      why: "Runs once per check in every contract run that keeps logs (the default), so its cost is paid by every developer and every CI job.",
      poorPerformanceMeans:
        "Keeping logs would slow every run in proportion to how much the tools print, and a pre-push hook that feels slower is a hook people skip.",
      expectedComplexity: "linear",
      complexityReason:
        "Each check's evidence is rendered once and handed to one write, in order, so the cost is proportional to the number of checks and the text they printed.",
      variables: [
        CHECKS,
        PAYLOAD,
        {
          name: "filesystem",
          how: "fixed",
          value: "an in-memory stand-in",
          description:
            "The real disk adds its own latency per file; the benchmark isolates the package's own rendering and queueing, as the standard asks (no real I/O).",
        },
        RUNTIME,
      ],
      variants,
      covers: {
        repoContractLogs: {
          "options.cwd": "fixed: the root of the in-memory filesystem",
          "options.directory": "fixed: the default log folder",
          "options.fs": "fixed: an in-memory stand-in, as the standard asks (no real I/O)",
          "options.mode": "fixed: the default, which keeps the logs of checks that did not pass",
          "options.onProblem":
            "not covered: only called when a write fails, which the in-memory stand-in never does",
        },
      },
      inEndToEnd: {
        callsPerOperation: 0,
        description: "Not part of the end-to-end operation; logs are an opt-in hook.",
      },
      setup: (n, options) => ({
        entries: fixture(n, options?.bytes ?? SMALL),
        files: new Map(),
      }),
      run: async ({ entries, files }) => {
        const logs = repoContractLogs({ cwd: "/", fs: memoryFileSystem(files) })
        for (const [id, , evidence] of entries) logs.saveEvidence(id, evidence)
        await logs.flush()
        return files.size
      },
    },
    {
      id: "prepend-verdict-to-logs",
      name: "repoContractLogs prependVerdict",
      why: "Runs once per check at the end of every contract run that keeps logs, rewriting the file each one already has.",
      poorPerformanceMeans:
        "The end of every run would wait on rewriting every log, in proportion to how much each tool printed.",
      expectedComplexity: "linear",
      complexityReason:
        "Each log is read once and written once with the verdict on top, so the cost is proportional to the number of checks and the text each holds.",
      variables: [
        CHECKS,
        PAYLOAD,
        {
          name: "filesystem",
          how: "fixed",
          value: "an in-memory stand-in",
          description: "The real disk adds its own latency per file; not covered.",
        },
        RUNTIME,
      ],
      variants,
      covers: {
        repoContractLogs: {
          "options.cwd": "fixed: the root of the in-memory filesystem",
          "options.directory": "fixed: the default log folder",
          "options.fs": "fixed: an in-memory stand-in, as the standard asks (no real I/O)",
          "options.mode": "fixed: `all`, so every check has a log to rewrite",
          "options.onProblem":
            "not covered: only called when a write fails, which the in-memory stand-in never does",
        },
      },
      inEndToEnd: {
        callsPerOperation: 0,
        description: "Not part of the end-to-end operation; logs are an opt-in hook.",
      },
      fresh: true,
      setup: async (n, options) => {
        const entries = fixture(n, options?.bytes ?? SMALL)
        const files = new Map()
        const logs = repoContractLogs({ cwd: "/", mode: "all", fs: memoryFileSystem(files) })
        for (const [id, , evidence] of entries) logs.saveEvidence(id, evidence)
        await logs.flush()
        return { logs, ids: entries.map(([id]) => id) }
      },
      run: async ({ logs, ids }) => {
        for (const id of ids) logs.prependVerdict(id, "FAIL", "the reason", false)
        await logs.flush()
        return logs.count()
      },
    },
  ],
})

// repo-contract benchmark suite 2 of 3: turning check results into evidence and verdicts
// (`buildEvidence`, `runPolicies`) -- pure, in-memory work with no process spawned, so it is isolated
// from the spawn noise of suite 1. How to read and write one: ../READING-BENCHMARKS.md and
// ../WRITING-BENCHMARKS.md. Benchmarks the package's own source (`src/`) through tsx.

import { defineSuite } from "internal-package-contract/benchmark"
import { buildEvidence } from "../../src/evidence/build-evidence.ts"
import { runPolicies } from "../../src/policy/run-policies.ts"
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
  ],
})

// repo-contract benchmark suite 4 of 4: the exception-registry and exception-policy helpers a package's own
// checks are built from (`repo-contract/helpers`): reading and writing a registry, reconciling it with what a
// check found, and deciding whether a record satisfies the policy. All pure, in-memory work. How to read and
// write one: ../READING-BENCHMARKS.md and ../WRITING-BENCHMARKS.md. Benchmarks the package's own source
// (`src/`) through tsx.
//
// Every helper here takes more than one input that can grow, so each one lists what it does with every
// parameter and key under `covers`, and sweeps the second variable that scales (see WRITING-BENCHMARKS.md).

import { defineSuite } from "internal-package-contract/benchmark"
import {
  evaluateExceptionRecord,
  hashRequirementFields,
  resolveExceptionPolicy,
  validateExceptionPolicyConfig,
} from "../../src/helpers/exception-policy.ts"
import { loadExceptionRegistry } from "../../src/helpers/load-exception-registry.ts"
import { reconcileExceptions } from "../../src/helpers/reconcile-exceptions.ts"
import { writeExceptionRegistry } from "../../src/helpers/write-exception-registry.ts"

const ENTRIES = {
  name: "entries",
  how: "swept",
  description:
    "The tier axis: how many entries the main input holds (records, findings, rules, fields or classifications, as each function says).",
}
const RUNTIME = {
  name: "runtime",
  how: "fixed",
  value: "Node (V8)",
  description: "Measured on Node only.",
}
const MEMORY = {
  name: "filesystem",
  how: "fixed",
  value: "an in-memory stand-in",
  description:
    "A real disk adds its own latency; the benchmark isolates the package's own work, as the standard asks (no real I/O).",
}

const record = (index) => ({
  id: `rule:${String(index).padStart(6, "0")}`,
  version: 2,
  justification: `Reviewed the finding at position ${String(index)} and accepted it.`,
  ruleBroken: "A rule",
  attempted: "Several fixes",
  constraint: "A constraint",
  whyPreferable: "A reason",
  residualRisk: "A risk",
  revisitWhen: "A condition",
})
const finding = (index) => ({ index })
const idOf = (finding) => `rule:${String(finding.index).padStart(6, "0")}`
const records = (count) => Array.from({ length: count }, (_, index) => record(index))

/** The fields a policy can require of a record, in the order they are listed, `justification` last. */
const requirementNames = (count) =>
  Array.from({ length: count }, (_, index) =>
    index === count - 1 ? "justification" : `field-${String(index)}`,
  )
/** A policy config with one group of `count` glob rules, half of them requiring `required` fields. */
const policyConfig = (count, required = 1) => ({
  group: {
    default: { mode: "allowed" },
    rules: Object.fromEntries(
      Array.from({ length: count }, (_, index) => [
        `category-${String(index)}/*`,
        index % 2 === 0
          ? { mode: "exception", requirements: requirementNames(required) }
          : { mode: "allowed" },
      ]),
    ),
  },
})
const GLOBAL_DEFAULT = { mode: "forbidden" }
const fieldValue = (record, requirement) => String(record[requirement] ?? "")

/** A valid Standard Schema that accepts every array, so the benchmark measures the reader, not a validator. */
const acceptAll = {
  "~standard": { version: 1, vendor: "benchmark", validate: (value) => ({ value }) },
}

export default defineSuite({
  package: { name: "repo-contract", bundleFiles: ["dist/helpers.js"] },
  tiers: [20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240],

  workload: {
    unit: "entry",
    description:
      "One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.",
    typicalN: 640,
  },

  endToEnd: {
    purpose:
      "Shows what a check pays, once per run, to read an exception registry, reconcile it with what the check found and write it back, compared with the bare minimum of parsing the file and matching ids by hand. It is pure in-memory work, paid by every check that keeps a registry.",
    baseline: {
      description:
        "Parse the registry JSON and match each finding to a record by id with a Map -- the least anyone would do.",
      setup: (n) => ({ text: JSON.stringify({ exceptions: records(n) }), findings: records(n) }),
      run: ({ text, findings }) => {
        const existing = new Map(JSON.parse(text).exceptions.map((entry) => [entry.id, entry]))
        let matched = 0
        for (const found of findings) if (existing.has(found.id)) matched += 1
        return matched
      },
    },
    withPackage: {
      description:
        "`loadExceptionRegistry` reads the registry, `reconcileExceptions` matches the findings and `writeExceptionRegistry` serializes it back.",
      setup: (n) => ({ text: JSON.stringify({ exceptions: records(n) }), findings: records(n) }),
      run: async ({ text, findings }) => {
        const loaded = await loadExceptionRegistry({
          path: "registry.json",
          schema: acceptAll,
          readFile: () => Promise.resolve(text),
        })
        const reconciled = reconcileExceptions({
          existing: loaded.records,
          findings,
          deriveId: (found) => found.id,
          createStub: (found) => found,
        })
        return writeExceptionRegistry({
          path: "registry.json",
          records: reconciled.reconciliation.activeRecords,
          readFile: () => Promise.resolve(text),
          writeFile: () => Promise.resolve(),
          rename: () => Promise.resolve(),
          isSymlink: () => Promise.resolve(false),
        })
      },
    },
    variables: [
      ENTRIES,
      MEMORY,
      RUNTIME,
      {
        name: "match rate",
        how: "fixed",
        value: "every finding matches a record",
        description: "A registry with stale or new entries does a little more work.",
      },
    ],
  },

  functions: [
    {
      id: "reconcile-exceptions",
      name: "reconcileExceptions",
      why: "Every check that keeps an exception registry reconciles it with what it found on every run, so its cost is paid by every contract run that has exceptions.",
      poorPerformanceMeans:
        "Slower runs in proportion to the registry and the findings, and a quadratic match would punish the repositories with the most exceptions.",
      expectedComplexity: "linear",
      complexityReason:
        "It indexes the existing records by id in a Map and looks each finding up once, so cost is proportional to the findings plus the records.",
      variables: [
        { ...ENTRIES, name: "findings", description: "The tier axis: findings to match." },
        {
          name: "existing-records",
          how: "swept",
          description: "How many records the registry already holds.",
        },
        {
          name: "match rate",
          how: "fixed",
          value:
            "findings carry the even ids 0, 2, 4 ...; each one below the registry's size matches a record",
          description:
            "Matched findings reuse a record; the rest create a stub. With the registry at its base size of 640 records at most 320 findings match (half of them at 640 findings); on the registry sweep, every finding matches once the registry holds twice as many records.",
        },
        RUNTIME,
      ],
      sweeps: [
        {
          variable: "existing-records",
          description: "How many records the registry already holds.",
          baseValue: 640,
          primaryValue: 20,
          expectedComplexity: "linear",
          complexityReason: "Each existing record is indexed once and checked for staleness once.",
        },
      ],
      covers: {
        reconcileExceptions: {
          "input.findings": "swept",
          "input.existing": "sweep:existing-records",
          "input.deriveId": "fixed: reads one field of the finding, the cheapest honest derivation",
          "input.createStub":
            "fixed: returns the finding as the record, the cheapest honest stub, so the benchmark measures the reconciliation and not a caller's stub builder",
        },
      },
      inEndToEnd: {
        callsPerOperation: 1,
        description: "Once per run, between reading and writing the registry.",
      },
      setup: (n, _options, context) => {
        const findingCount = context.values.entry
        const existingCount = context.values["existing-records"]
        return {
          existing: records(existingCount),
          findings: Array.from({ length: findingCount }, (_, index) => finding(index * 2)),
        }
      },
      run: ({ existing, findings }) =>
        reconcileExceptions({
          existing,
          findings,
          deriveId: idOf,
          createStub: (found, id) => ({ ...record(found.index), id }),
        }),
    },
    {
      id: "load-exception-registry",
      name: "loadExceptionRegistry",
      why: "Every check that keeps a registry reads it at the start of every run.",
      poorPerformanceMeans:
        "Slower starts for every check in proportion to the registry, which is the part of a contract run that cannot be skipped.",
      expectedComplexity: "linear",
      complexityReason:
        "The file is parsed once and its array is handed to the schema once, so cost is proportional to the size of the registry.",
      variables: [
        { ...ENTRIES, name: "records", description: "The tier axis: records in the registry." },
        MEMORY,
        {
          name: "schema",
          how: "fixed",
          value: "accepts every array",
          description: "A caller's own schema adds its own validation cost on top.",
        },
        RUNTIME,
      ],
      covers: {
        loadExceptionRegistry: {
          "input.path":
            "fixed: a short relative path, because a path's length does not change the work",
          "input.schema":
            "fixed: a schema that accepts every array, so the benchmark measures the reader and not a validator",
          "input.readFile": "fixed: an in-memory stand-in, as the standard asks (no real I/O)",
        },
      },
      inEndToEnd: {
        callsPerOperation: 1,
        description: "Once per run, before reconciling.",
      },
      setup: (n) => JSON.stringify({ exceptions: records(n) }),
      run: (text) =>
        loadExceptionRegistry({
          path: "registry.json",
          schema: acceptAll,
          readFile: () => Promise.resolve(text),
        }),
    },
    {
      id: "write-exception-registry",
      name: "writeExceptionRegistry",
      why: "Every check that reconciles a registry writes it back when it changed.",
      poorPerformanceMeans: "Slower runs whenever a registry changes, in proportion to its size.",
      expectedComplexity: "linearithmic",
      complexityReason:
        "Each record's keys are put in canonical order and the whole registry is serialized once, so cost grows a little faster than the number of records.",
      variables: [
        { ...ENTRIES, name: "records", description: "The tier axis: records written." },
        MEMORY,
        RUNTIME,
      ],
      covers: {
        writeExceptionRegistry: {
          "input.path":
            "fixed: a short relative path, because a path's length does not change the work",
          "input.records": "swept",
          "input.readFile":
            "fixed: an in-memory stand-in that returns the old text, so every run rewrites",
          "input.writeFile": "fixed: an in-memory stand-in, as the standard asks (no real I/O)",
          "input.rename": "fixed: an in-memory stand-in, as the standard asks (no real I/O)",
          "input.isSymlink": "fixed: an in-memory stand-in that says the path is a regular file",
        },
      },
      inEndToEnd: {
        callsPerOperation: 1,
        description: "Once per run, after reconciling, when the registry changed.",
      },
      setup: (n) => records(n),
      run: (list) =>
        writeExceptionRegistry({
          path: "registry.json",
          records: list,
          readFile: () => Promise.resolve("{}"),
          writeFile: () => Promise.resolve(),
          rename: () => Promise.resolve(),
          isSymlink: () => Promise.resolve(false),
        }),
    },
    {
      id: "resolve-exception-policy",
      name: "resolveExceptionPolicy",
      why: "It decides, for each exception record, which policy applies, and runs once per classification of every record.",
      poorPerformanceMeans:
        "Slower judgement of every record in proportion to how many rules a policy has.",
      expectedComplexity: "linear",
      complexityReason:
        "It scans the group's rules for an exact match and then for glob matches, so cost is proportional to the number of rules.",
      tiers: [20, 40, 80, 160, 320, 640, 1280],
      tiersReason:
        "Every call builds a regular expression for each rule it tests, so sizes beyond a few thousand rules take minutes per sample; no real policy has that many.",
      variables: [
        { ...ENTRIES, name: "rules", description: "The tier axis: rules in the group." },
        {
          name: "category",
          how: "variant",
          description: "An exact rule, a category matched by a glob, or every category at once.",
        },
        RUNTIME,
      ],
      variants: [
        {
          name: "glob-match",
          description: "The category matches one glob rule.",
          options: { category: "category-0/a" },
        },
        {
          name: "every-category",
          description: "The category is `*`: every rule is combined with the stricter-of rule.",
          options: { category: "*" },
        },
      ],
      covers: {
        resolveExceptionPolicy: {
          // Both variants change the category: `glob-match` to one a rule's pattern matches, `every-category` to `*`.
          // An entry names one variant; the report lists both.
          "classification.category": "variant:glob-match",
          "classification.group":
            "fixed: one group, because a config's groups are looked up by name",
          config: "swept",
          "globalDefault.mode": "fixed: forbidden, the strictest default",
          "globalDefault.requirements":
            "not covered: only an `exception` default carries requirements, and the benchmark's default is `forbidden`",
        },
      },
      inEndToEnd: {
        callsPerOperation: 0,
        description: "Not part of the end-to-end operation, which reads and writes a registry.",
      },
      setup: (n, options) => ({
        config: policyConfig(n),
        classification: { group: "group", category: options?.category ?? "category-0/a" },
      }),
      run: ({ config, classification }) =>
        resolveExceptionPolicy(classification, config, GLOBAL_DEFAULT),
    },
    {
      id: "evaluate-exception-record",
      name: "evaluateExceptionRecord",
      why: "It decides whether one record is permitted, and runs for every record of a registry.",
      poorPerformanceMeans:
        "Slower judgement of a whole registry, multiplied by the number of classifications each record carries and the rules each policy has.",
      expectedComplexity: "linear",
      complexityReason:
        "Each classification is resolved once, so cost is proportional to the number of classifications.",
      tiers: [20, 40, 80, 160, 320, 640, 1280],
      tiersReason:
        "Every call builds a regular expression for each rule it tests, so sizes beyond a few thousand rules take minutes per sample; no real policy has that many.",
      variables: [
        {
          ...ENTRIES,
          name: "classifications",
          description: "The tier axis: classifications the record is judged under.",
        },
        { name: "rules", how: "swept", description: "How many rules the policy group has." },
        {
          name: "requirements",
          how: "fixed",
          value: 4,
          description:
            "How many fields the policy's matching rule requires. Each costs one field read and one trim, which is too small next to resolving the rules to measure a growth rate of its own.",
        },
        RUNTIME,
      ],
      sweeps: [
        {
          variable: "rules",
          description: "How many rules the policy group has.",
          baseValue: 2,
          primaryValue: 1,
          tiers: [20, 40, 80, 160, 320, 640, 1280],
          expectedComplexity: "linear",
          complexityReason: "Each classification scans the group's rules once.",
        },
      ],
      covers: {
        evaluateExceptionRecord: {
          "input.classifications": "swept",
          "input.config": "sweep:rules",
          "input.fieldValue": "fixed: reads one field of the record",
          "input.globalDefault":
            "fixed: `forbidden`, which only applies to a group the config does not name, and the benchmark's group is named",
          "input.record":
            "fixed: one record with every field filled, so every requirement is checked",
        },
      },
      inEndToEnd: {
        callsPerOperation: 0,
        description: "Not part of the end-to-end operation, which reads and writes a registry.",
      },
      setup: (_n, _options, context) => {
        const required = requirementNames(4)
        return {
          record: { ...record(0), ...Object.fromEntries(required.map((name) => [name, "filled"])) },
          classifications: Array.from({ length: context.values.entry }, () => ({
            group: "group",
            category: "category-0/a",
          })),
          config: policyConfig(context.values.rules, 4),
          globalDefault: GLOBAL_DEFAULT,
          fieldValue,
        }
      },
      run: (input) => evaluateExceptionRecord(input),
    },
    {
      id: "validate-exception-policy-config",
      name: "validateExceptionPolicyConfig",
      why: "A check validates its policy config before it judges a single record, once per run.",
      poorPerformanceMeans:
        "Slower starts for every check in proportion to how large its policy is.",
      expectedComplexity: "linear",
      complexityReason:
        "Each rule is validated once, and each required field is looked up in the list of valid ones.",
      tiers: [20, 40, 80, 160, 320, 640, 1280],
      tiersReason:
        "Every call builds a regular expression for each rule it tests, so sizes beyond a few thousand rules take minutes per sample; no real policy has that many.",
      variables: [
        { ...ENTRIES, name: "rules", description: "The tier axis: rules in the config." },
        {
          name: "valid-requirements",
          how: "swept",
          description: "How many requirement names are valid.",
        },
        RUNTIME,
      ],
      sweeps: [
        {
          variable: "valid-requirements",
          description: "How many requirement names are valid.",
          baseValue: 20,
          primaryValue: 20,
          expectedComplexity: "linear",
          complexityReason: "Each requirement is looked up by scanning the list of valid names.",
        },
      ],
      covers: {
        validateExceptionPolicyConfig: {
          config: "swept",
          validRequirements: "sweep:valid-requirements",
        },
      },
      inEndToEnd: {
        callsPerOperation: 0,
        description: "Not part of the end-to-end operation, which reads and writes a registry.",
      },
      setup: (_n, _options, context) => ({
        config: policyConfig(context.values.entry),
        valid: requirementNames(context.values["valid-requirements"]),
      }),
      run: ({ config, valid }) => validateExceptionPolicyConfig(config, valid),
    },
    {
      id: "hash-requirement-fields",
      name: "hashRequirementFields",
      why: "It fingerprints the fields of a record that a policy requires, so a record that changed after review can be told from one that did not.",
      poorPerformanceMeans:
        "Slower review checks for every record in proportion to how many fields a policy requires.",
      expectedComplexity: "linear",
      complexityReason:
        "Each field's value is read once and the whole list is hashed once, so cost is proportional to the number of fields.",
      variables: [
        { ...ENTRIES, name: "fields", description: "The tier axis: fields hashed." },
        RUNTIME,
      ],
      covers: {
        hashRequirementFields: {
          record: "fixed: one record with every field filled",
          fields: "swept",
          fieldValue: "fixed: reads one field of the record",
        },
      },
      inEndToEnd: {
        callsPerOperation: 0,
        description: "Not part of the end-to-end operation, which reads and writes a registry.",
      },
      setup: (n) => ({
        record: record(0),
        fields: Array.from({ length: n }, (_, index) =>
          index % 2 === 0 ? "justification" : "ruleBroken",
        ),
      }),
      run: ({ record: target, fields }) => hashRequirementFields(target, fields, fieldValue),
    },
  ],
})

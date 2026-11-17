/**
 * Every exception record in use must still load under the published v2 record. This reads
 * repo-contract's own registries, and env-cap's and data-cap's when their checkouts sit beside
 * this one (or `CONSUMER_EXCEPTION_DIRS` lists them, separated like `PATH`). It only reads.
 *
 * The consumer registries belong to internal-package-contract's checks, so their shapes are
 * restated here from those checks' schemas: namespace, own keys, and whether a record carries the
 * security fields. A registry file with no known shape fails, so a new registry is never skipped.
 */
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { DOCS_LINK_EXCEPTION_SCHEMA } from "../../../checks/docs.js"
import { CODERABBIT_EXCEPTION_SCHEMA } from "../../../scripts/coderabbitai/registry.js"
import { DEAD_CODE_EXCEPTION_SCHEMA } from "../../../scripts/dead-code/registry.js"
import { PRESET_COMMAND_EXCEPTION_SCHEMA } from "../../../scripts/preset-commands/registry.js"
import { NETWORK_EXCEPTION_SCHEMA } from "../../../scripts/security-network/registry.js"
import { SOCKET_EXCEPTION_SCHEMA } from "../../../scripts/security-socket/registry.js"
import { SUPPRESSION_EXCEPTION_SCHEMA } from "../../../scripts/suppression-governance/evidence-types.js"
import {
  EXCEPTION_TYPES,
  exceptionRegistryStandardSchema,
  loadExceptionRegistry,
  validateSecurityExceptionFields,
} from "../../../src/helpers/index.js"
import type { ExceptionRegistrySchema } from "../../../src/helpers/index.js"
import { SECURITY_DEPS_EXCEPTION_SCHEMA } from "../../../src/presets/rules/security-deps-registry.js"

type AnySchema = ExceptionRegistrySchema<{ readonly id: string }>

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const REGISTRY_DIRECTORY = ".repo-contract/exceptions"

/**
 * @param namespace - the id prefix.
 * @param ownKeys - the registry's keys beyond the core and the security fields.
 * @param security - whether a record carries the four security fields.
 * @returns a schema that checks the shared layers and keeps the registry's own keys as they are.
 */
function consumerShape(namespace: string, ownKeys: readonly string[], security = false): AnySchema {
  const securityKeys = security ? ["alternatives", "remediation", "method", "exceptionType"] : []
  return {
    namespace,
    metadataKeys: [...securityKeys, ...ownKeys],
    validateRecord: (core, raw, index, errors) => {
      if (security && !validateSecurityExceptionFields(raw, index, EXCEPTION_TYPES, errors)) {
        return undefined
      }
      return { ...raw, id: core.id }
    },
  }
}

const RC_SCHEMAS: Readonly<Record<string, AnySchema>> = {
  coderabbit: CODERABBIT_EXCEPTION_SCHEMA,
  "dead-code": DEAD_CODE_EXCEPTION_SCHEMA,
  "disable-comments": SUPPRESSION_EXCEPTION_SCHEMA,
  "docs-links": DOCS_LINK_EXCEPTION_SCHEMA,
  "preset-commands": PRESET_COMMAND_EXCEPTION_SCHEMA,
  "security-deps": SECURITY_DEPS_EXCEPTION_SCHEMA,
  "security-network": NETWORK_EXCEPTION_SCHEMA,
  socket: SOCKET_EXCEPTION_SCHEMA,
  // repo-contract keeps the file for internal-package-contract's CodeScanning check.
  "code-scanning": consumerShape("code-scanning:", ["rule", "path"], true),
}

const CONSUMER_SCHEMAS: Readonly<Record<string, AnySchema>> = {
  "benchmark-complexity": consumerShape("benchmark-complexity:", ["suite", "group", "to"]),
  "code-scanning": consumerShape("code-scanning:", ["rule", "path"], true),
  coderabbit: consumerShape("coderabbit:", ["file", "severity", "summary"], true),
  "dist-urls": consumerShape("dist-url:", ["url"], true),
  environment: consumerShape("environment:", ["check", "code"]),
  "managed-files": consumerShape("managed-file:", ["path"]),
  mutation: consumerShape("mutation:", ["file", "mutator", "original", "replacement"]),
  "security-deps": SECURITY_DEPS_EXCEPTION_SCHEMA,
  "skipped-tests": consumerShape("skipped-test:", ["file"]),
  socket: consumerShape("socket:", ["package", "packageVersion", "type", "severity"], true),
  suppressions: consumerShape("suppression:", ["domain", "rule", "file", "anchor"]),
}

const consumerDirectories = (
  process.env.CONSUMER_EXCEPTION_DIRS?.split(path.delimiter) ?? [
    path.join(repoRoot, "..", "env-cap", REGISTRY_DIRECTORY),
    path.join(repoRoot, "..", "data-cap", REGISTRY_DIRECTORY),
  ]
).filter((directory) => directory !== "")

/**
 * @param directory - a registry directory.
 * @returns its registry names.
 */
function registryNames(directory: string): string[] {
  // `describe.runIf(false)` still runs its body to collect tests, so a missing checkout reaches here.
  if (!existsSync(directory)) return []
  return readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .sort()
}

/**
 * @param directory - a registry directory.
 * @param schemas - the shape of each registry it may hold.
 */
function expectEveryRegistryLoads(
  directory: string,
  schemas: Readonly<Record<string, AnySchema>>,
): void {
  const names = registryNames(directory)

  it("knows the shape of every registry", () => {
    expect(names.filter((name) => schemas[name] === undefined)).toEqual([])
  })

  it.each(names.filter((name) => schemas[name] !== undefined))("loads %s.json", async (name) => {
    const schema = schemas[name]!
    const loaded = await loadExceptionRegistry({
      path: path.join(directory, `${name}.json`),
      schema: exceptionRegistryStandardSchema(schema),
    })
    expect(loaded.ok ? [] : loaded.errors).toEqual([])
  })
}

describe("repo-contract's own registries", () => {
  const directory = path.join(repoRoot, REGISTRY_DIRECTORY)
  expectEveryRegistryLoads(directory, RC_SCHEMAS)

  it("holds the 84 records the redesign counted", async () => {
    let total = 0
    for (const name of registryNames(directory)) {
      const loaded = await loadExceptionRegistry({
        path: path.join(directory, `${name}.json`),
        schema: exceptionRegistryStandardSchema(RC_SCHEMAS[name]!),
      })
      total += loaded.ok ? loaded.records.length : 0
    }
    expect(total).toBeGreaterThanOrEqual(84)
  })
})

for (const directory of consumerDirectories) {
  describe.runIf(existsSync(directory))(`the registries in ${directory}`, () => {
    expectEveryRegistryLoads(directory, CONSUMER_SCHEMAS)
  })
}

// CI's `typescript-compat` job runs this with `node scripts/typescript-compat.mjs <artifacts-dir>`
// against the same packed tarball `published-floor` smoke-tests -- but instead of Node-floor
// runtime behavior, this proves the shipped `.d.ts` files actually compile under a real consumer's
// own toolchain, including a TypeScript release newer than anything this repo's own build ever
// runs against (this repo's own tsconfig uses `moduleResolution: "Bundler"` and a pinned
// `typescript` devDependency -- neither exercises `nodenext` resolution or a future major, so a
// declaration-emission regression there would otherwise go unnoticed until a real consumer hit it).
//
// Fresh `npm install` inside a scratch project, exactly like `published-floor`'s
// scripts/smoke-consumer.mjs -- unlike that script, this one CAN install `typescript@<major>`
// (a real devDependency of the scratch project, not of this repository), since this job doesn't
// share the Node-floor / no-toolchain constraint `published-floor` has.
//
// Exits 0 only if the packed tarball's declarations compile cleanly, with `moduleResolution:
// "nodenext"` and `strict: true`, under the newest release of each TypeScript major a consumer may
// have installed: 5, 6 and 7. TypeScript 7 is the native compiler and ships no compiler API, which
// `repo-contract/affected` needs for both its types and its runtime (the command refuses 7 with a
// message). So under 7 every other barrel must compile, and a consumer that imports `affected` must
// fail with the compiler-API error -- the documented limit is asserted, not assumed.
// Override the list on the command line: `node scripts/typescript-compat.mjs <artifacts-dir>
// [version ...]`. There is no 5.0 floor here: the optional `typescript >=5.0.0` peer exists for
// `affected` alone, and the oldest 5.x cannot even parse the newest `@types/node` the scratch
// project installs.

import { spawnSync } from "node:child_process"
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const artifactsDir = process.argv[2]
if (!artifactsDir) {
  console.error("Usage: node scripts/typescript-compat.mjs <artifacts-dir> [version ...]")
  process.exit(1)
}
const versions = process.argv.slice(3).length > 0 ? process.argv.slice(3) : ["5", "6", "7"]

const tarball = readdirSync(artifactsDir).find((f) => f.endsWith(".tgz"))
if (!tarball) {
  console.error(`No .tgz found in ${artifactsDir}`)
  process.exit(1)
}
const tarballPath = path.resolve(artifactsDir, tarball)

function run(command, args, dir) {
  const result = spawnSync(command, args, { cwd: dir, stdio: "inherit" })
  if (result.status !== 0) {
    console.error(`${command} ${args.join(" ")} failed (exit ${String(result.status)})`)
    process.exit(result.status ?? 1)
  }
}

function check(version) {
  const dir = mkdtempSync(path.join(tmpdir(), `repo-contract-tscompat-${version}-`))
  try {
    checkIn(dir, version)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function checkIn(dir, version) {
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "tscompat", version: "0.0.0" }),
  )
  run(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      tarballPath,
      `typescript@${version}`,
      "@types/node@latest",
      "cross-spawn",
      "@types/cross-spawn",
    ],
    dir,
  )

  // `affected` needs the compiler API's types, which TypeScript 7 does not ship: under 7 it is
  // compiled on its own below and must fail, so the main consumer leaves it out there.
  const affectedImports =
    version === "7"
      ? ""
      : `import { parseScopeArgs, resolveScope } from "repo-contract/affected"
import type { ScopeDecision } from "repo-contract/affected"
`
  const affectedUse =
    version === "7"
      ? `const scope = { scope: "full" as const }`
      : `const parsed = parseScopeArgs(["--scope", "auto"])
const scope: ScopeDecision = resolveScope({ requested: parsed.ok ? parsed.scope : undefined, env: {} })`
  writeFileSync(
    path.join(dir, "consumer.ts"),
    `import crossSpawn from "cross-spawn"
import { defineRepoContract } from "repo-contract"
import { lint } from "repo-contract/presets"
import { hashRequirementFields } from "repo-contract/helpers"
${affectedImports}import { createRunRecord, serializeRunRecord } from "repo-contract/metrics"
import type { RunRecord } from "repo-contract/metrics"

// Every published barrel this TypeScript can type is imported, so a declaration that fails to
// compile under it in any of them fails here.
const digest: string = hashRequirementFields(
  { justification: "x" },
  ["justification"],
  (record, field) => String(record[field as keyof typeof record]),
)
${affectedUse}
const record: RunRecord = createRunRecord({
  startedAt: new Date(0).toISOString(),
  durationMs: 1,
  scope: scope.scope,
  checks: [],
})
void digest
void serializeRunRecord(record)

export default defineRepoContract({
  spawn: crossSpawn,
  env: process.env,
  checks: {
    Lint: lint(),
  },
})
`,
  )
  writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        moduleResolution: "nodenext",
        module: "nodenext",
        strict: true,
        noEmit: true,
        types: ["node"],
      },
      include: ["consumer.ts"],
    }),
  )

  run("npx", ["tsc", "-p", "tsconfig.json"], dir)
  console.log(`consumer.ts compiled cleanly under typescript@${version}.`)

  if (version === "7") {
    // The documented limit, asserted: `affected`'s declarations name compiler-API types that
    // TypeScript 7's package does not export, so importing the barrel must fail with exactly that.
    writeFileSync(
      path.join(dir, "affected.ts"),
      `import { parseScopeArgs } from "repo-contract/affected"
void parseScopeArgs(["--scope", "auto"])
`,
    )
    writeFileSync(
      path.join(dir, "tsconfig.affected.json"),
      JSON.stringify({ extends: "./tsconfig.json", include: ["affected.ts"] }),
    )
    const result = spawnSync("npx", ["tsc", "-p", "tsconfig.affected.json"], {
      cwd: dir,
      encoding: "utf8",
    })
    const output = `${result.stdout}${result.stderr}`
    if (result.status === 0 || !output.includes("TS2694")) {
      console.error(
        `expected repo-contract/affected to fail under typescript@7 with TS2694 (no compiler API types); got exit ${String(result.status)}:\n${output}`,
      )
      process.exit(1)
    }
    console.log(
      "repo-contract/affected fails under typescript@7 with the documented compiler-API error.",
    )
  }
}

for (const version of versions) check(version)
console.log(`TypeScript compat check passed for typescript ${versions.join(", ")}.`)

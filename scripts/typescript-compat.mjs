// CI's `typescript-compat` job runs this with `node scripts/typescript-compat.mjs <artifacts-dir>`
// against the same packed tarball `published-floor` smoke-tests -- but instead of Node-floor
// runtime behavior, this proves the shipped `.d.ts` files actually compile under a real consumer's
// own toolchain, including a TypeScript release newer than anything this repo's own build ever
// runs against (this repo's own tsconfig uses `moduleResolution: "Bundler"` and a pinned
// `typescript` devDependency -- neither exercises `nodenext` resolution or a future major, so a
// declaration-emission regression there would otherwise go unnoticed until a real consumer hit it).
//
// Fresh `npm install` inside a scratch project, exactly like `published-floor`'s
// scripts/smoke-consumer.mjs -- unlike that script, this one CAN use `npm install typescript@latest`
// (a real devDependency of the scratch project, not of this repository), since this job doesn't
// share the Node-floor / no-toolchain constraint `published-floor` has.
//
// Exits 0 only if the packed tarball's declarations compile cleanly under TypeScript's latest
// release with `moduleResolution: "nodenext"` and `strict: true`.

import { spawnSync } from "node:child_process"
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const artifactsDir = process.argv[2]
if (!artifactsDir) {
  console.error("Usage: node scripts/typescript-compat.mjs <artifacts-dir>")
  process.exit(1)
}

const tarball = readdirSync(artifactsDir).find((f) => f.endsWith(".tgz"))
if (!tarball) {
  console.error(`No .tgz found in ${artifactsDir}`)
  process.exit(1)
}
const tarballPath = path.resolve(artifactsDir, tarball)

const dir = mkdtempSync(path.join(tmpdir(), "repo-contract-tscompat-"))

function run(command, args) {
  const result = spawnSync(command, args, { cwd: dir, stdio: "inherit" })
  if (result.status !== 0) {
    console.error(`${command} ${args.join(" ")} failed (exit ${String(result.status)})`)
    process.exit(result.status ?? 1)
  }
}

try {
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "tscompat", version: "0.0.0" }),
  )
  run("npm", [
    "install",
    "--no-audit",
    "--no-fund",
    tarballPath,
    "typescript@latest",
    "@types/node@latest",
    "cross-spawn",
    "@types/cross-spawn",
  ])

  writeFileSync(
    path.join(dir, "consumer.ts"),
    `import crossSpawn from "cross-spawn"
import { defineRepoContract } from "repo-contract"
import { lint } from "repo-contract/presets"

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

  run("npx", ["tsc", "-p", "tsconfig.json"])
  console.log(
    "TypeScript compat check passed: consumer.ts compiled cleanly under typescript@latest.",
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}

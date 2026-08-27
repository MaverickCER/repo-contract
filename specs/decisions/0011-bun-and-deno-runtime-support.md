# 0011: Bun and Deno are tested, supported consumption runtimes

## Status

Accepted. Implemented in `test/helpers/pack-consumer.ts`, `test/e2e/consumer-install-bun.test.ts`,
`test/e2e/consumer-install-deno.test.ts`, `.github/workflows/ci.yml`.

## Context

README's runtime support matrix listed Bun and Deno as "Not tested; likely to work through Node
compatibility layers, but not supported for v0.1.0" — an honest placeholder at the time it was
written, but an unverified one. `repo-contract` spawns processes and reads `process.env` (see [ADR
0004](0004-cross-platform-command-execution-and-process-cleanup.md)), which makes it plausible that
a future change to `src/execution/` or a dependency bump (`cross-spawn`, in particular) could work
under Node's real `child_process` implementation while silently breaking under Bun's or Deno's
compatibility layer — neither of which reimplements Node's APIs with 100% fidelity. Nothing in CI
would have caught that regression, and the README's claim would have stayed aspirational rather
than evidence-backed — exactly the gap between "asserted" and "verified" this package's own thesis
(evidence over assertion) argues against when applied to any other check.

## Decision

Bun and Deno are promoted from "not tested" to a tested, documented consumption path, verified
end-to-end against the real packed tarball — the same `npm pack` + fresh-install fixture the
existing Node E2E test already used, now shared via `test/helpers/pack-consumer.ts`. Each runtime's
suite covers the same compatibility-relevant surface: the ESM entry point, the CommonJS entry point
(`require`, proving `dist/index.cjs` and Deno/Bun's own CJS interop, not just their ESM resolution),
and the `./presets` subpath export.

Deno requires `--allow-read --allow-run --allow-env` (verified as the minimum working set — no
broader permission is needed); Bun requires no non-default flags. Both are documented in README's
runtime support matrix.

Both E2E suites skip cleanly (`describe.skipIf`) when the runtime's own binary isn't on `PATH`,
matching the existing `distIsBuilt` skip pattern — most local machines and most CI jobs don't have
Bun or Deno installed, and that's a normal state, not a broken one. A dedicated `runtime-compat` CI
job installs both runtimes via their official setup actions and runs the full E2E suite there,
so the tests are actually exercised on every PR rather than only skipping everywhere. It runs once,
on one OS and one Node version — proving Bun/Deno interop doesn't depend on which Node version or
OS also happens to be on the runner, an axis already covered for the Node-only path by the existing
`verify` matrix job.

`package.json`'s `engines` field is unchanged: it stays Node-only.

## Consequences

- A future change that breaks Bun or Deno compatibility is caught by CI, not discovered by a
  consumer filing an issue.
- Deno's permission model is now a documented, consumer-facing contract, not something a Deno user
  has to reverse-engineer from a stack trace.
- Local development without Bun/Deno installed is unaffected — the suites skip, `npm test` still
  passes.
- The internal test suite (`vitest`, coverage, mutation testing) still only ever runs under Node;
  this decision is scoped to whether the _published, built artifact_ works when imported/required
  from Bun or Deno, not to running this repository's own tooling under them.

## Alternatives considered

- **Updating the README claim to "supported" without adding tests**, on the strength of manual
  verification alone: rejected — an unverified compatibility claim is exactly the gap the prior
  "Not tested" wording already flagged. A claim with no regression coverage behind it decays the
  first time someone changes `src/execution/` without knowing Bun/Deno exist.
- **Adding `bun`/`deno` keys under `package.json`'s `engines`**: rejected — npm's `engines` field is
  only meaningfully enforced by npm itself, and only for `node`/`npm`/`yarn`; Bun and Deno don't
  read `package.json` `engines` at all. The keys would be decorative, and nothing would ever catch
  them drifting out of date.
- **Running the full internal Vitest suite (not just a consumer-install-style E2E smoke test) under
  Bun/Deno**: rejected — the internal suite exercises `src/` via Node-specific tooling (`vitest`,
  V8 coverage) that was never meant to run cross-runtime. What a consumer actually needs proven is
  that the _published_ artifact works when imported from their runtime, which the consumer-install
  pattern already proves directly, at far lower cost than porting the whole test harness.
- **Running `runtime-compat` across the full OS/Node matrix** used by the `verify` job: rejected —
  Bun/Deno compatibility doesn't depend on which Node version happens to also be installed on the
  runner (the two runtimes don't invoke Node's own binary at all), so repeating it per-Node-version
  would inflate CI time for no additional signal. Cross-OS Bun/Deno coverage was also considered and
  rejected for now — Bun and Deno each ship the same real, single-binary executable per OS with no
  Windows-`.cmd`-shim-style resolution gap of the kind ADR 0004 had to solve for `npm`, so the
  cross-platform risk this package actually cares about isn't runtime-specific.

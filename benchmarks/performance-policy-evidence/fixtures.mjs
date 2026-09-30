// Tiered synthetic evidence/policy generator for the `evaluate-evidence-and-policy` benchmark
// (measures src/evidence/build-evidence.ts's `buildEvidence` and src/policy/run-policies.ts's
// `runPolicies` -- the two stages repo-contract runs immediately after `runChecks`, see
// src/run-repo-contract.ts). Deliberately plain JS, dependency-free.
//
// No real process is ever spawned here (unlike the sibling `performance-checks` category) --
// `buildEvidence`/`runPolicies` never spawn anything themselves, they only interpret already-
// captured `CheckEvidence`. Isolating them from real spawn overhead is the point: this category
// measures pure CPU-bound evidence-assembly + policy-evaluation cost (JSON parsing at increasing
// payload size, dependency-evidence lookups, rationale-string construction) as check count and
// per-check output size both grow, which real process-spawn noise (dominant in `performance-checks`)
// would otherwise mask.

export const BENCHMARK_SUITE_VERSION = 1

export const TIERS = {
  small: { checks: 20, payloadBytes: 500 },
  medium: { checks: 100, payloadBytes: 5_000 },
  large: { checks: 400, payloadBytes: 50_000 },
}

export const TIER_NAMES = Object.keys(TIERS)

export const POLICY_EVIDENCE_BENCHMARKS = {
  "evaluate-evidence-and-policy": { tiers: TIER_NAMES, definitionVersion: 1 },
}

/** A deterministic JSON-serializable payload of roughly `targetBytes`, shaped like a real check's parsed tool output (a `findings` array of small structured records). */
function buildPayload(checkIndex, targetBytes) {
  const findings = []
  let size = 20
  let n = 0
  while (size < targetBytes) {
    const finding = {
      rule: `rule-${n % 37}`,
      file: `src/module-${checkIndex}/file-${n}.ts`,
      line: (n * 7) % 500,
      message: `Synthetic finding #${n} for check ${checkIndex}.`,
      severity: n % 3 === 0 ? "error" : n % 3 === 1 ? "warning" : "info",
    }
    findings.push(finding)
    size += JSON.stringify(finding).length + 1
    n++
  }
  return { checkIndex, findingCount: findings.length, findings }
}

/**
 * Builds `checkCount` synthetic `CheckExecutionEntry` triples (the shape `runChecks` returns --
 * `[checkId, CheckDefinition, CheckEvidence]`) with real JSON stdout of roughly `payloadBytes`
 * each, plus a real, non-trivial `policy` that reads both its own parsed output and its
 * `dependsOn` dependencies' evidence (about 15% of checks declare one dependency on an earlier
 * check, exercising `runPolicies`' per-check dependency-evidence-gathering loop).
 * @param checkCount - how many synthetic checks to generate.
 * @param payloadBytes - approximate size, in bytes, of each check's synthetic JSON stdout.
 * @returns the synthetic execution entries (as `runChecks` would have returned them) plus the total evidence payload size in bytes.
 */
export function generateEvidenceFixture(checkCount, payloadBytes) {
  const entries = []
  let totalBytes = 0

  for (let i = 0; i < checkCount; i++) {
    const id = `check-${String(i).padStart(4, "0")}`
    const payload = buildPayload(i, payloadBytes)
    const stdout = JSON.stringify(payload)
    totalBytes += stdout.length

    const dependsOn = i > 6 && i % 7 === 0 ? [`check-${String(i - 3).padStart(4, "0")}`] : undefined

    const check = {
      run: ["node", "-e", ""],
      output: { format: "json" },
      dependsOn,
      policy: (ctx) => {
        const value = ctx.result.output?.success ? ctx.result.output.value : undefined
        const findingCount = value && typeof value === "object" ? value.findingCount : 0
        const depFindingCounts = Object.values(ctx.dependencies).length
        const errorCount = Array.isArray(value?.findings)
          ? value.findings.filter((f) => f.severity === "error").length
          : 0
        return {
          outcome: errorCount > 0 ? "warn" : "pass",
          rationale: `${id}: ${String(findingCount)} finding(s) (${String(errorCount)} error-severity), ${String(depFindingCounts)} dependency evidence record(s) inspected.`,
        }
      },
    }

    const evidence = {
      command: "node",
      args: ["-e", ""],
      startedAt: new Date(0).toISOString(),
      completedAt: new Date(1).toISOString(),
      durationMs: 1,
      exitCode: 0,
      signal: null,
      stdout,
      stderr: "",
      status: "completed",
    }

    entries.push([id, check, evidence])
  }

  return { entries, totalBytes }
}

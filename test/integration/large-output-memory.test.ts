import { describe, expect, it } from "vitest"
import { runRepoContract } from "../../src/run-repo-contract.js"
import type { RepoContractConfig } from "../../src/types.js"

const node = process.execPath

// Per-stream capture cap in spawn-check.ts (MAX_CAPTURED_OUTPUT_BYTES). Kept
// as a local literal, not imported, so this test breaks loudly if that
// constant moves without this ceiling being reconsidered.
const CAP_BYTES = 10 * 1024 * 1024

/**
 * Perf / resource smoke test for the audit's finding C9: many checks, each
 * flooding stdout well past the capture cap, run concurrently through the
 * real public API. The deterministic guarantee is the byte assertions -- every
 * retained stream is bounded, so total retained output is bounded by
 * `checks x CAP` regardless of how much the commands actually printed. The RSS
 * ceiling is a deliberately loose catastrophe tripwire: it only fires if
 * truncation stops working entirely and the run starts holding whole
 * multi-hundred-MiB streams.
 */
describe("runRepoContract -- bounded memory under many chatty checks", () => {
  it("caps retained output per check and keeps peak RSS within a sane ceiling", async () => {
    const CHECK_COUNT = 8
    // Each check prints ~1.4x the cap to stdout so truncation must engage.
    const OVERAGE_BYTES = Math.ceil(CAP_BYTES * 1.4)

    const checks: RepoContractConfig["checks"] = {}
    for (let i = 0; i < CHECK_COUNT; i += 1) {
      checks[`flood-${String(i)}`] = {
        run: [node, "-e", `process.stdout.write("x".repeat(${String(OVERAGE_BYTES)}))`],
        policy: ({ result }) =>
          result.exitCode === 0
            ? { outcome: "pass", rationale: "exited 0" }
            : { outcome: "fail", rationale: "expected exit 0" },
      }
    }

    const rssBefore = process.memoryUsage().rss
    const { evidence, verdict } = await runRepoContract({ checks })
    const rssAfter = process.memoryUsage().rss

    expect(verdict.passed).toBe(true)
    expect(Object.keys(evidence.checks)).toHaveLength(CHECK_COUNT)

    let totalRetained = 0
    for (const entry of Object.values(evidence.checks)) {
      const { stdout } = entry
      // Retained text is the cap plus a short fixed truncation marker.
      expect(stdout.length).toBeLessThan(CAP_BYTES + 200)
      expect(stdout).toContain("...[output truncated at")
      totalRetained += stdout.length
    }

    // Bounded by checks x cap, never by what the commands actually emitted.
    expect(totalRetained).toBeLessThan(CHECK_COUNT * (CAP_BYTES + 200))

    // Loose tripwire only. If truncation broke, this run would be holding
    // ~8 x 14 MiB of live strings plus slice churn; well-behaved it is
    // ~8 x 10 MiB. 512 MiB of growth leaves wide margin either way while
    // still catching a total regression.
    expect(rssAfter - rssBefore).toBeLessThan(512 * 1024 * 1024)
  }, 60_000)
})

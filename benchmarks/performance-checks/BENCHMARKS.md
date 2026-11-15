# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **31.8 ms** per operation compared with a bare-minimum baseline (**6.3% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 31.8 ms | 237 ms |
| Added latency, relative to baseline | 6.3% | 1.4% |
| Added CPU time per operation | 39.3 ms | 799 ms |
| Added memory per operation (heap delta) | 175.7 KiB | 12.0 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | 31 ops/s | 4 ops/s |

## 1. End-to-end: the package's total impact

Shows what a repository pays, per contract run, for having repo-contract orchestrate its checks instead of spawning the same processes itself. Both sides spawn exactly the same trivial processes at the same concurrency; the difference is repo-contract's dependency scheduling, evidence capture, output handling and policy evaluation. This is CI and pre-push time, paid on every run: the floor under whatever the real tools cost.

- **Baseline (no package):** Spawn n trivial processes directly, eight at a time, with no repo-contract.
- **With the package:** `runChecks` runs n trivial checks (every fifth depends on the one before it) through the real scheduler, spawning the same processes at the same concurrency.

Both sides use empty or minimal functions on purpose. The difference is then the package's own cost, not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| configured checks | swept | The tier axis: how many checks a repository configures and runs in one contract run. |
| work per check | fixed at "the fastest real process (node -e \"\")" | Every check spawns a real process that does nothing, so the cost measured is repo-contract's scheduling, not the tool a real check would run. |
| concurrency | fixed at 8 | Eight checks run at a time; more cores allow more, fewer allow less. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |
| dependency shape | fixed at "every fifth check depends on its predecessor" | Real contracts have a few dependency edges; chains and barriers are measured as variants of runChecks below. |

The baseline is an empty or minimal function, so it costs almost nothing. The _relative_ overhead can then look enormous (shown as a multiple of the baseline). Read the absolute columns (time, CPU and dollars added): they are what a bill and a latency budget are made of.

| checks | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 135 ms | 162 ms | 31.6 ms | 23% | 12.9 ms | $0.066 – $0.145 |
| 40 | 256 ms | 283 ms | 27.1 ms | 11% | 22.1 ms | $0.057 – $0.249 |
| 80 | 504 ms | 537 ms | 31.8 ms | 6.3% | 39.3 ms | $0.066 – $0.442 |
| 160 | 1.01 s | 1.05 s | 51.5 ms | 5.1% | 77.4 ms | $0.107 – $0.871 |
| 320 | 2.01 s | 2.07 s | 59.4 ms | 2.9% | 107 ms | $0.124 – $1.21 |
| 640 | 4.09 s | 4.12 s | 5.59 ms | 0.1% | 112 ms | $0.012 – $1.26 |
| 1280 | 8.20 s | 8.37 s | 106 ms | 1.3% | 409 ms | $0.221 – $4.60 |
| 2560 | 16.5 s | 16.6 s | 237 ms | 1.4% | 799 ms | $0.494 – $8.99 |

**How the total grows:** O(n) (linear), exponent 1.00 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | check | O(n) | O(n) | ✅ matches | 521 ms | 16.9 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | check | O(n) | O(n) | ✅ matches | 551 ms | 16.6 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | check | O(n) | O(n) | ✅ matches | 588 ms | 19.4 s |
| `runChecks (scheduler and process orchestration)` (with-reporting-hook) | check | O(n) | O(n) | ✅ matches | 551 ms | 16.5 s |
| `runRepoContract` (plain) | check | O(n) | O(n) | ✅ matches | 532 ms | 1.01 s (at 160) |
| `runRepoContract` (plain) | concurrency | O(1) | n/a | ❔ not enough data | 549 ms (at 16) | 549 ms (at 16) |
| `runRepoContract` (with-hooks) | check | O(n) | O(n) | ✅ matches | 549 ms | 1.07 s (at 160) |
| `runRepoContract` (with-hooks) | concurrency | O(1) | n/a | ❔ not enough data | 551 ms (at 16) | 551 ms (at 16) |

> **Could not be determined.** The big-O of these could not be measured, so they are not checked against their documentation:
>
> - `run-repo-contract (plain)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.77, and a fit below 0.8 is not trusted; fitted exponent -0.33). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth
> - `run-repo-contract (with-hooks)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.76, and a fit below 0.8 is not trusted; fitted exponent -0.33). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth

### `runChecks (scheduler and process orchestration)`

**Why we benchmark it.** It is the engine of every contract run: every check in every repository passes through it. Its overhead is paid on every pre-push, every pull request and every CI job.

**What poor performance would mean.** Slower pre-push hooks and CI jobs in direct proportion to how many checks a repository configures; developers start skipping hooks that feel slow, and a super-linear scheduler would punish exactly the repositories that adopt the most checks.

**Expected growth: O(n).** Each check is scheduled once, spawned once and its output captured once, with a bounded number running at a time; dependency edges are looked up in a map. So total time is proportional to the number of checks (divided by the concurrency).

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| configured checks | swept | The tier axis: how many checks a repository configures and runs in one contract run. |
| work per check | fixed at "the fastest real process (node -e \"\")" | Every check spawns a real process that does nothing, so the cost measured is repo-contract's scheduling, not the tool a real check would run. |
| concurrency | fixed at 8 | Eight checks run at a time; more cores allow more, fewer allow less. |
| dependency structure | variant | No dependencies, a few dependency edges, or frequent isolated barriers that serialize the run. |
| output volume | fixed at "none" | The processes print nothing; large outputs are measured in the policy-evidence suite. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**Deliberately not covered**

- **long dependency chains**: A chain through every check serializes the whole run and measures process latency, not scheduling; real contracts do not do this.
- **check timeouts and aborts**: They are failure paths; the steady-state cost is the successful run.

**In the end-to-end run:** This is the end-to-end operation itself.

#### Variant `no-dependencies`

Every check is independent, so the scheduler can always keep eight running.

**Measured: O(n)** (exponent 1.01, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 139 ms | 142 ms | 45.1 ms | 2.8 MiB | 7 |
| 40 | 266 ms | 273 ms | 89.4 ms | 6.4 MiB | 4 |
| 80 | 521 ms | 566 ms | 176 ms | 11.1 MiB | 2 |
| 160 | 1.03 s | 1.04 s | 328 ms | 22.1 MiB | 1 |
| 320 | 2.06 s | 2.06 s | 651 ms | 44.1 MiB | 0 |
| 640 | 4.14 s | 4.18 s | 1.31 s | 42.8 MiB | 0 |
| 1280 | 8.34 s | 8.37 s | 2.65 s | 33.6 MiB | 0 |
| 2560 | 16.9 s | 17.0 s | 5.20 s | 48.4 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.98, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 171 ms | 172 ms | 41.6 ms | 3.3 MiB | 6 |
| 40 | 289 ms | 305 ms | 85.1 ms | 6.5 MiB | 3 |
| 80 | 551 ms | 558 ms | 169 ms | 11.2 MiB | 2 |
| 160 | 1.09 s | 1.10 s | 340 ms | 22.4 MiB | 1 |
| 320 | 2.16 s | 2.17 s | 668 ms | 44.7 MiB | 0 |
| 640 | 4.21 s | 4.24 s | 1.31 s | 43.9 MiB | 0 |
| 1280 | 8.43 s | 8.45 s | 2.63 s | 36.0 MiB | 0 |
| 2560 | 16.6 s | 16.6 s | 5.07 s | 22.7 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.01, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 152 ms | 154 ms | 40.8 ms | 3.3 MiB | 7 |
| 40 | 294 ms | 305 ms | 88.6 ms | 6.5 MiB | 3 |
| 80 | 588 ms | 596 ms | 161 ms | 11.2 MiB | 2 |
| 160 | 1.19 s | 1.20 s | 317 ms | 22.6 MiB | 1 |
| 320 | 2.42 s | 2.45 s | 629 ms | 45.9 MiB | 0 |
| 640 | 4.81 s | 4.82 s | 1.27 s | 48.7 MiB | 0 |
| 1280 | 9.79 s | 9.82 s | 2.58 s | 9.9 MiB | 0 |
| 2560 | 19.4 s | 19.4 s | 4.99 s | 26.2 MiB | 0 |

#### Variant `with-reporting-hook`

The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.99, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 166 ms | 175 ms | 51.5 ms | 3.3 MiB | 6 |
| 40 | 296 ms | 300 ms | 101 ms | 6.5 MiB | 3 |
| 80 | 551 ms | 552 ms | 184 ms | 11.2 MiB | 2 |
| 160 | 1.07 s | 1.10 s | 345 ms | 22.3 MiB | 1 |
| 320 | 2.11 s | 2.17 s | 664 ms | 44.7 MiB | 0 |
| 640 | 4.20 s | 4.21 s | 1.34 s | 43.9 MiB | 0 |
| 1280 | 8.32 s | 8.33 s | 2.65 s | 35.9 MiB | 0 |
| 2560 | 16.5 s | 16.6 s | 5.10 s | 24.8 MiB | 0 |

### `runRepoContract`

**Why we benchmark it.** It is the public entry point of every contract run: it validates the configuration, schedules and spawns the checks, assembles the evidence and judges it, so it is what every pre-push and every CI job calls.

**What poor performance would mean.** Slower pre-push hooks and CI jobs in proportion to how many checks a repository configures, and a concurrency setting that no longer shortens a run would waste every extra core.

**Expected growth: O(n).** Each check is scheduled, spawned and judged once, with a bounded number running at a time, so total time is proportional to the number of checks.

**Measured on a shorter ladder (20, 40, 80, 160).** Every check spawns a real process and the whole run is measured, so sizes beyond a few hundred take minutes per sample; `run-checks` already measures the scheduler to 2,560.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| configured checks | swept | The tier axis: how many checks a repository configures and runs in one contract run. |
| work per check | fixed at "the fastest real process (node -e \"\")" | Every check spawns a real process that does nothing, so the cost measured is repo-contract's scheduling, not the tool a real check would run. |
| concurrency | swept | How many checks run at a time. |
| hooks | variant | Whether the run reports progress through `onEvidence` and `onVerdict`. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which measures the scheduler on its own (`run-checks`).

#### Variant `plain`

No hooks: the shape of a run that only wants its verdict.

**Measured: O(n)** (exponent 0.91, 4 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 155 ms | 158 ms | 49.2 ms | 3.0 MiB | 6 |
| 40 | 274 ms | 285 ms | 91.8 ms | 5.9 MiB | 4 |
| 80 | 532 ms | 575 ms | 179 ms | 11.6 MiB | 2 |
| 160 | 1.01 s | 1.04 s | 331 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.43 s | 1.44 s | 131 ms | 11.6 MiB | 1 |
| 2 | 803 ms | 816 ms | 154 ms | 11.6 MiB | 1 |
| 4 | 568 ms | 573 ms | 173 ms | 11.6 MiB | 2 |
| 8 | 542 ms | 612 ms | 172 ms | 11.6 MiB | 2 |
| 16 | 549 ms | 555 ms | 170 ms | 11.6 MiB | 2 |

#### Variant `with-hooks`

Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.91, 4 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 162 ms | 167 ms | 44.2 ms | 3.0 MiB | 6 |
| 40 | 287 ms | 295 ms | 96.8 ms | 5.9 MiB | 3 |
| 80 | 549 ms | 551 ms | 179 ms | 11.6 MiB | 2 |
| 160 | 1.07 s | 1.08 s | 339 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.44 s | 1.47 s | 131 ms | 11.6 MiB | 1 |
| 2 | 798 ms | 799 ms | 156 ms | 11.6 MiB | 1 |
| 4 | 570 ms | 578 ms | 179 ms | 11.6 MiB | 2 |
| 8 | 542 ms | 547 ms | 174 ms | 11.6 MiB | 2 |
| 16 | 551 ms | 573 ms | 171 ms | 11.6 MiB | 2 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 537 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 551 ms | 551 ms | 103% |
| `run-repo-contract` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 16.6 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 16.6 s | 16.6 s | 100% |
| _unattributed_ |  |  | 3.83 ms | 0.0% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-15T06:50:29.456Z` → `2026-11-15T07:01:19.575Z` (650 s), ci: CI (run 43687150892)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `c968b12ca3ffc07428d76f750f67c60cc7212521` on `chore/bump-internal-package-contract-v0.19.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks: One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


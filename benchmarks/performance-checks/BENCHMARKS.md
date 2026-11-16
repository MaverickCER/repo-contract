# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **27.3 ms** per operation compared with a bare-minimum baseline (**4.7% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.99). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 27.3 ms | 356 ms |
| Added latency, relative to baseline | 4.7% | 2.1% |
| Added CPU time per operation | 43.4 ms | 802 ms |
| Added memory per operation (heap delta) | 213.2 KiB | 34.9 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | 37 ops/s | 3 ops/s |

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
| 20 | 135 ms | 167 ms | 31.9 ms | 24% | 14.0 ms | $0.066 – $0.157 |
| 40 | 263 ms | 293 ms | 32.4 ms | 12% | 25.7 ms | $0.068 – $0.289 |
| 80 | 581 ms | 613 ms | 27.3 ms | 4.7% | 43.4 ms | $0.057 – $0.488 |
| 160 | 1.12 s | 1.11 s | 36.0 ms | 3.2% | 69.6 ms | $0.075 – $0.782 |
| 320 | 2.05 s | 2.07 s | 18.6 ms | 0.9% | 99.3 ms | $0.039 – $1.12 |
| 640 | 4.12 s | 4.20 s | 39.1 ms | 0.9% | 161 ms | $0.081 – $1.81 |
| 1280 | 8.32 s | 8.68 s | 220 ms | 2.6% | 493 ms | $0.458 – $5.54 |
| 2560 | 16.5 s | 16.8 s | 356 ms | 2.1% | 802 ms | $0.741 – $9.02 |

**How the total grows:** O(n) (linear), exponent 0.99 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | check | O(n) | O(n) | ✅ matches | 575 ms | 16.4 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | check | O(n) | O(n) | ✅ matches | 527 ms | 16.5 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | check | O(n) | O(n) | ✅ matches | 582 ms | 18.8 s |
| `runChecks (scheduler and process orchestration)` (with-reporting-hook) | check | O(n) | O(n) | ✅ matches | 595 ms | 16.3 s |
| `runRepoContract` (plain) | check | O(n) | O(n) | ✅ matches | 535 ms | 1.05 s (at 160) |
| `runRepoContract` (plain) | concurrency | O(1) | n/a | ❔ not enough data | 555 ms (at 16) | 555 ms (at 16) |
| `runRepoContract` (with-hooks) | check | O(n) | O(n) | ✅ matches | 613 ms | 1.07 s (at 160) |
| `runRepoContract` (with-hooks) | concurrency | O(1) | n/a | ❔ not enough data | 555 ms (at 16) | 555 ms (at 16) |

> **Could not be determined.** The big-O of these could not be measured, so they are not checked against their documentation:
>
> - `run-repo-contract (plain)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.71, and a fit below 0.8 is not trusted; fitted exponent -0.36). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth
> - `run-repo-contract (with-hooks)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.75, and a fit below 0.8 is not trusted; fitted exponent -0.37). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth

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

**Measured: O(n)** (exponent 1.00, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 150 ms | 162 ms | 45.8 ms | 2.8 MiB | 7 |
| 40 | 298 ms | 304 ms | 80.8 ms | 6.4 MiB | 3 |
| 80 | 575 ms | 599 ms | 145 ms | 11.1 MiB | 2 |
| 160 | 1.05 s | 1.05 s | 268 ms | 22.1 MiB | 1 |
| 320 | 2.08 s | 2.09 s | 524 ms | 44.1 MiB | 0 |
| 640 | 4.13 s | 4.31 s | 1.03 s | 42.7 MiB | 0 |
| 1280 | 8.43 s | 8.59 s | 2.09 s | 33.7 MiB | 0 |
| 2560 | 16.4 s | 16.5 s | 3.95 s | 49.0 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.98, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 171 ms | 173 ms | 37.6 ms | 3.3 MiB | 6 |
| 40 | 284 ms | 292 ms | 66.3 ms | 6.5 MiB | 4 |
| 80 | 527 ms | 584 ms | 127 ms | 11.2 MiB | 2 |
| 160 | 1.09 s | 1.10 s | 265 ms | 22.4 MiB | 1 |
| 320 | 2.13 s | 2.14 s | 524 ms | 44.7 MiB | 0 |
| 640 | 4.07 s | 4.07 s | 998 ms | 43.9 MiB | 0 |
| 1280 | 8.18 s | 8.28 s | 2.04 s | 36.2 MiB | 0 |
| 2560 | 16.5 s | 16.7 s | 4.01 s | 46.7 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.00, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 148 ms | 152 ms | 33.1 ms | 3.3 MiB | 7 |
| 40 | 318 ms | 329 ms | 72.0 ms | 6.5 MiB | 3 |
| 80 | 582 ms | 622 ms | 134 ms | 11.2 MiB | 2 |
| 160 | 1.19 s | 1.23 s | 255 ms | 22.6 MiB | 1 |
| 320 | 2.38 s | 2.43 s | 498 ms | 45.9 MiB | 0 |
| 640 | 4.74 s | 4.75 s | 999 ms | 48.7 MiB | 0 |
| 1280 | 9.49 s | 9.60 s | 2.05 s | 9.8 MiB | 0 |
| 2560 | 18.8 s | 18.9 s | 3.92 s | 23.5 MiB | 0 |

#### Variant `with-reporting-hook`

The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.99, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 162 ms | 163 ms | 44.8 ms | 3.3 MiB | 6 |
| 40 | 313 ms | 315 ms | 91.1 ms | 6.5 MiB | 3 |
| 80 | 595 ms | 599 ms | 161 ms | 11.2 MiB | 2 |
| 160 | 1.05 s | 1.05 s | 267 ms | 22.4 MiB | 1 |
| 320 | 2.10 s | 2.21 s | 517 ms | 44.7 MiB | 0 |
| 640 | 4.06 s | 4.08 s | 1.03 s | 43.9 MiB | 0 |
| 1280 | 8.19 s | 8.24 s | 2.07 s | 36.1 MiB | 0 |
| 2560 | 16.3 s | 16.9 s | 3.96 s | 54.7 MiB | 0 |

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
| 20 | 158 ms | 167 ms | 42.8 ms | 3.0 MiB | 6 |
| 40 | 283 ms | 283 ms | 80.6 ms | 5.9 MiB | 4 |
| 80 | 535 ms | 536 ms | 147 ms | 11.6 MiB | 2 |
| 160 | 1.05 s | 1.08 s | 277 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.61 s | 1.70 s | 152 ms | 11.6 MiB | 1 |
| 2 | 794 ms | 822 ms | 132 ms | 11.6 MiB | 1 |
| 4 | 544 ms | 557 ms | 141 ms | 11.6 MiB | 2 |
| 8 | 552 ms | 554 ms | 146 ms | 11.6 MiB | 2 |
| 16 | 555 ms | 562 ms | 144 ms | 11.6 MiB | 2 |

#### Variant `with-hooks`

Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.92, 4 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 164 ms | 166 ms | 38.5 ms | 3.0 MiB | 6 |
| 40 | 288 ms | 333 ms | 83.1 ms | 5.9 MiB | 3 |
| 80 | 613 ms | 615 ms | 165 ms | 11.6 MiB | 2 |
| 160 | 1.07 s | 1.08 s | 274 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.64 s | 1.65 s | 153 ms | 11.6 MiB | 1 |
| 2 | 831 ms | 836 ms | 142 ms | 11.6 MiB | 1 |
| 4 | 565 ms | 587 ms | 147 ms | 11.6 MiB | 2 |
| 8 | 544 ms | 556 ms | 146 ms | 11.6 MiB | 2 |
| 16 | 555 ms | 565 ms | 148 ms | 11.6 MiB | 2 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 613 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 527 ms | 527 ms | 86% |
| `run-repo-contract` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 86.2 ms | 14% |

**At 2560 checks** (whole operation: 16.8 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 16.5 s | 16.5 s | 98% |
| _unattributed_ |  |  | 323 ms | 1.9% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-16T07:07:07.115Z` → `2026-11-16T07:17:56.736Z` (650 s), ci: CI (run 43821281531)
- Machine: Intel(R) Xeon(R) 6973P-C, 4 logical core(s) (2 physical), 15982 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `9ed6892d1b5d84763183988768b29c47b99889cc` on `chore/bump-internal-package-contract-v0.20.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks: One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


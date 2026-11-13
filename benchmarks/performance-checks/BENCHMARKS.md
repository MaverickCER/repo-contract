# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **37.7 ms** per operation compared with a bare-minimum baseline (**7.2% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.99). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 37.7 ms | 74.5 ms |
| Added latency, relative to baseline | 7.2% | 0.4% |
| Added CPU time per operation | 44.1 ms | 860 ms |
| Added memory per operation (heap delta) | 159.9 KiB | 33.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$0.1 – $10 |
| Single-core throughput ceiling of the overhead alone | 27 ops/s | 13 ops/s |

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
| 20 | 143 ms | 166 ms | 23.1 ms | 16% | 13.1 ms | $0.048 – $0.147 |
| 40 | 274 ms | 306 ms | 32.3 ms | 12% | 25.6 ms | $0.067 – $0.288 |
| 80 | 526 ms | 557 ms | 37.7 ms | 7.2% | 44.1 ms | $0.079 – $0.496 |
| 160 | 1.04 s | 1.11 s | 69.2 ms | 6.6% | 84.1 ms | $0.144 – $0.946 |
| 320 | 2.13 s | 2.23 s | 101 ms | 4.8% | 112 ms | $0.211 – $1.26 |
| 640 | 4.33 s | 4.28 s | 0 | 0.0% | 137 ms | $0 – $1.54 |
| 1280 | 8.47 s | 8.77 s | 300 ms | 3.5% | 491 ms | $0.625 – $5.52 |
| 2560 | 17.0 s | 17.6 s | 74.5 ms | 0.4% | 860 ms | $0.155 – $9.67 |

**How the total grows:** O(n) (linear), exponent 0.99 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | check | O(n) | O(n) | ✅ matches | 528 ms | 17.5 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | check | O(n) | O(n) | ✅ matches | 587 ms | 16.7 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | check | O(n) | O(n) | ✅ matches | 625 ms | 19.2 s |
| `runChecks (scheduler and process orchestration)` (with-reporting-hook) | check | O(n) | O(n) | ✅ matches | 526 ms | 16.6 s |
| `runRepoContract` (plain) | check | O(n) | O(n) | ✅ matches | 529 ms | 1.05 s (at 160) |
| `runRepoContract` (plain) | concurrency | O(1) | n/a | ❔ not enough data | 544 ms (at 16) | 544 ms (at 16) |
| `runRepoContract` (with-hooks) | check | O(n) | O(n) | ✅ matches | 537 ms | 1.08 s (at 160) |
| `runRepoContract` (with-hooks) | concurrency | O(1) | n/a | ❔ not enough data | 536 ms (at 16) | 536 ms (at 16) |

> **Could not be determined.** The big-O of these could not be measured, so they are not checked against their documentation:
>
> - `run-repo-contract (plain)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.75, and a fit below 0.8 is not trusted; fitted exponent -0.36). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth
> - `run-repo-contract (with-hooks)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.74, and a fit below 0.8 is not trusted; fitted exponent -0.37). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth

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
| 20 | 139 ms | 143 ms | 42.2 ms | 2.8 MiB | 7 |
| 40 | 271 ms | 273 ms | 75.6 ms | 6.4 MiB | 4 |
| 80 | 528 ms | 553 ms | 141 ms | 11.1 MiB | 2 |
| 160 | 1.04 s | 1.05 s | 274 ms | 22.1 MiB | 1 |
| 320 | 2.20 s | 2.21 s | 559 ms | 44.1 MiB | 0 |
| 640 | 4.33 s | 4.43 s | 1.08 s | 42.7 MiB | 0 |
| 1280 | 8.70 s | 8.91 s | 2.25 s | 33.6 MiB | 0 |
| 2560 | 17.5 s | 17.8 s | 4.33 s | 49.3 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.99, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 161 ms | 166 ms | 36.7 ms | 3.3 MiB | 6 |
| 40 | 291 ms | 294 ms | 67.3 ms | 6.5 MiB | 3 |
| 80 | 587 ms | 593 ms | 136 ms | 11.2 MiB | 2 |
| 160 | 1.10 s | 1.19 s | 284 ms | 22.4 MiB | 1 |
| 320 | 2.08 s | 2.09 s | 510 ms | 44.7 MiB | 0 |
| 640 | 4.11 s | 4.30 s | 1.01 s | 43.9 MiB | 0 |
| 1280 | 8.40 s | 8.59 s | 2.10 s | 36.2 MiB | 0 |
| 2560 | 16.7 s | 16.8 s | 4.11 s | 46.2 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.00, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 143 ms | 149 ms | 33.8 ms | 3.2 MiB | 7 |
| 40 | 316 ms | 321 ms | 73.4 ms | 6.5 MiB | 3 |
| 80 | 625 ms | 638 ms | 139 ms | 11.2 MiB | 2 |
| 160 | 1.20 s | 1.23 s | 265 ms | 22.6 MiB | 1 |
| 320 | 2.45 s | 2.45 s | 528 ms | 45.9 MiB | 0 |
| 640 | 4.81 s | 4.91 s | 1.02 s | 48.7 MiB | 0 |
| 1280 | 9.59 s | 9.73 s | 2.04 s | 9.4 MiB | 0 |
| 2560 | 19.2 s | 19.5 s | 4.04 s | 23.5 MiB | 0 |

#### Variant `with-reporting-hook`

The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 1.00, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 161 ms | 165 ms | 43.0 ms | 3.3 MiB | 6 |
| 40 | 284 ms | 284 ms | 83.4 ms | 6.5 MiB | 4 |
| 80 | 526 ms | 531 ms | 144 ms | 11.2 MiB | 2 |
| 160 | 1.03 s | 1.04 s | 261 ms | 22.3 MiB | 1 |
| 320 | 2.08 s | 2.15 s | 531 ms | 44.7 MiB | 0 |
| 640 | 4.16 s | 4.21 s | 1.03 s | 43.9 MiB | 0 |
| 1280 | 8.22 s | 8.46 s | 2.10 s | 36.0 MiB | 0 |
| 2560 | 16.6 s | 16.7 s | 4.11 s | 47.3 MiB | 0 |

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
| 20 | 158 ms | 159 ms | 44.8 ms | 3.0 MiB | 6 |
| 40 | 289 ms | 295 ms | 86.1 ms | 5.9 MiB | 3 |
| 80 | 529 ms | 534 ms | 145 ms | 11.6 MiB | 2 |
| 160 | 1.05 s | 1.05 s | 270 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.55 s | 1.55 s | 130 ms | 11.6 MiB | 1 |
| 2 | 816 ms | 848 ms | 135 ms | 11.6 MiB | 1 |
| 4 | 554 ms | 559 ms | 139 ms | 11.6 MiB | 2 |
| 8 | 546 ms | 588 ms | 151 ms | 11.6 MiB | 2 |
| 16 | 544 ms | 551 ms | 146 ms | 11.6 MiB | 2 |

#### Variant `with-hooks`

Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.90, 4 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 168 ms | 178 ms | 39.0 ms | 3.0 MiB | 6 |
| 40 | 287 ms | 301 ms | 85.9 ms | 5.9 MiB | 3 |
| 80 | 537 ms | 546 ms | 150 ms | 11.6 MiB | 2 |
| 160 | 1.08 s | 1.14 s | 272 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.59 s | 1.61 s | 136 ms | 11.6 MiB | 1 |
| 2 | 800 ms | 809 ms | 131 ms | 11.6 MiB | 1 |
| 4 | 545 ms | 572 ms | 139 ms | 11.6 MiB | 2 |
| 8 | 543 ms | 544 ms | 144 ms | 11.6 MiB | 2 |
| 16 | 536 ms | 576 ms | 152 ms | 11.6 MiB | 2 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 557 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 587 ms | 587 ms | 105% |
| `run-repo-contract` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 17.6 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 16.7 s | 16.7 s | 95% |
| _unattributed_ |  |  | 922 ms | 5.2% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-13T08:43:04.185Z` → `2026-11-13T08:54:08.182Z` (664 s), ci: CI (run 43395219911)
- Machine: Intel(R) Xeon(R) 6973P-C, 4 logical core(s) (2 physical), 15982 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `7df3cfb8deed41483220ea7dc82f40281ae3c479` on `docs/v1-claims-evidence`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks: One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


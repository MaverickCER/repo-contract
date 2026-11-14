# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **30.9 ms** per operation compared with a bare-minimum baseline (**5.1% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.01). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 30.9 ms | 542 ms |
| Added latency, relative to baseline | 5.1% | 2.7% |
| Added CPU time per operation | 42.6 ms | 1.01 s |
| Added memory per operation (heap delta) | 201.4 KiB | 12.4 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | 32 ops/s | 2 ops/s |

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
| 20 | 155 ms | 191 ms | 39.5 ms | 25% | 14.9 ms | $0.082 – $0.167 |
| 40 | 304 ms | 345 ms | 34.8 ms | 11% | 23.3 ms | $0.073 – $0.262 |
| 80 | 605 ms | 636 ms | 30.9 ms | 5.1% | 42.6 ms | $0.064 – $0.479 |
| 160 | 1.19 s | 1.26 s | 63.6 ms | 5.3% | 89.6 ms | $0.132 – $1.01 |
| 320 | 2.39 s | 2.47 s | 85.9 ms | 3.6% | 115 ms | $0.179 – $1.30 |
| 640 | 4.87 s | 4.96 s | 95.8 ms | 2.0% | 126 ms | $0.200 – $1.41 |
| 1280 | 9.82 s | 10.1 s | 246 ms | 2.5% | 536 ms | $0.512 – $6.02 |
| 2560 | 19.9 s | 20.3 s | 542 ms | 2.7% | 1.01 s | $1.13 – $11.38 |

**How the total grows:** O(n) (linear), exponent 1.01 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | check | O(n) | O(n) | ✅ matches | 619 ms | 20.1 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | check | O(n) | O(n) | ✅ matches | 663 ms | 20.2 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | check | O(n) | O(n) | ✅ matches | 718 ms | 23.1 s |
| `runChecks (scheduler and process orchestration)` (with-reporting-hook) | check | O(n) | O(n) | ✅ matches | 661 ms | 20.3 s |
| `runRepoContract` (plain) | check | O(n) | O(n) | ✅ matches | 709 ms | 1.31 s (at 160) |
| `runRepoContract` (plain) | concurrency | O(1) | n/a | ❔ not enough data | 664 ms (at 16) | 664 ms (at 16) |
| `runRepoContract` (with-hooks) | check | O(n) | O(n) | ✅ matches | 662 ms | 1.31 s (at 160) |
| `runRepoContract` (with-hooks) | concurrency | O(1) | n/a | ❔ not enough data | 660 ms (at 16) | 660 ms (at 16) |

> **Could not be determined.** The big-O of these could not be measured, so they are not checked against their documentation:
>
> - `run-repo-contract (plain)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.78, and a fit below 0.8 is not trusted; fitted exponent -0.36). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth
> - `run-repo-contract (with-hooks)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.74, and a fit below 0.8 is not trusted; fitted exponent -0.35). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth

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
| 20 | 167 ms | 170 ms | 56.1 ms | 2.8 MiB | 6 |
| 40 | 333 ms | 342 ms | 110 ms | 6.4 MiB | 3 |
| 80 | 619 ms | 641 ms | 191 ms | 11.1 MiB | 2 |
| 160 | 1.26 s | 1.28 s | 385 ms | 22.1 MiB | 1 |
| 320 | 2.50 s | 2.55 s | 737 ms | 44.1 MiB | 0 |
| 640 | 5.08 s | 5.13 s | 1.51 s | 42.7 MiB | 0 |
| 1280 | 10.1 s | 10.2 s | 3.05 s | 33.8 MiB | 0 |
| 2560 | 20.1 s | 20.1 s | 5.87 s | 49.8 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.99, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 203 ms | 205 ms | 49.5 ms | 3.3 MiB | 5 |
| 40 | 353 ms | 357 ms | 97.3 ms | 6.5 MiB | 3 |
| 80 | 663 ms | 665 ms | 187 ms | 11.2 MiB | 2 |
| 160 | 1.28 s | 1.29 s | 381 ms | 22.4 MiB | 1 |
| 320 | 2.56 s | 2.59 s | 755 ms | 44.7 MiB | 0 |
| 640 | 5.08 s | 5.11 s | 1.49 s | 43.9 MiB | 0 |
| 1280 | 10.2 s | 10.2 s | 3.04 s | 36.0 MiB | 0 |
| 2560 | 20.2 s | 20.2 s | 5.88 s | 45.9 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 0.99, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 176 ms | 180 ms | 44.8 ms | 3.2 MiB | 6 |
| 40 | 359 ms | 375 ms | 97.2 ms | 6.5 MiB | 3 |
| 80 | 718 ms | 720 ms | 179 ms | 11.2 MiB | 1 |
| 160 | 1.46 s | 1.48 s | 359 ms | 22.6 MiB | 1 |
| 320 | 2.94 s | 2.96 s | 732 ms | 46.0 MiB | 0 |
| 640 | 5.83 s | 5.90 s | 1.44 s | 48.7 MiB | 0 |
| 1280 | 11.6 s | 11.6 s | 2.88 s | 9.3 MiB | 0 |
| 2560 | 23.1 s | 23.4 s | 5.62 s | 23.5 MiB | 0 |

#### Variant `with-reporting-hook`

The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.99, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 200 ms | 206 ms | 53.8 ms | 3.3 MiB | 5 |
| 40 | 353 ms | 354 ms | 109 ms | 6.5 MiB | 3 |
| 80 | 661 ms | 666 ms | 199 ms | 11.2 MiB | 2 |
| 160 | 1.29 s | 1.36 s | 383 ms | 22.3 MiB | 1 |
| 320 | 2.55 s | 2.56 s | 754 ms | 44.7 MiB | 0 |
| 640 | 5.08 s | 5.09 s | 1.51 s | 44.0 MiB | 0 |
| 1280 | 10.2 s | 10.2 s | 3.07 s | 35.7 MiB | 0 |
| 2560 | 20.3 s | 20.4 s | 5.97 s | 55.0 MiB | 0 |

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

**Measured: O(n)** (exponent 0.92, 4 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 198 ms | 201 ms | 53.4 ms | 3.0 MiB | 5 |
| 40 | 351 ms | 370 ms | 107 ms | 5.9 MiB | 3 |
| 80 | 709 ms | 719 ms | 210 ms | 11.6 MiB | 1 |
| 160 | 1.31 s | 1.32 s | 398 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.87 s | 1.92 s | 183 ms | 11.6 MiB | 1 |
| 2 | 1.00 s | 1.01 s | 182 ms | 11.6 MiB | 1 |
| 4 | 701 ms | 708 ms | 208 ms | 11.6 MiB | 1 |
| 8 | 672 ms | 673 ms | 203 ms | 11.6 MiB | 1 |
| 16 | 664 ms | 670 ms | 196 ms | 11.6 MiB | 2 |

#### Variant `with-hooks`

Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.91, 4 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 199 ms | 201 ms | 48.3 ms | 3.0 MiB | 5 |
| 40 | 351 ms | 354 ms | 109 ms | 5.9 MiB | 3 |
| 80 | 662 ms | 668 ms | 202 ms | 11.6 MiB | 2 |
| 160 | 1.31 s | 1.34 s | 394 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.82 s | 1.85 s | 168 ms | 11.6 MiB | 1 |
| 2 | 958 ms | 1.01 s | 180 ms | 11.6 MiB | 1 |
| 4 | 669 ms | 678 ms | 193 ms | 11.6 MiB | 1 |
| 8 | 657 ms | 658 ms | 196 ms | 11.6 MiB | 2 |
| 16 | 660 ms | 696 ms | 199 ms | 11.6 MiB | 2 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 636 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 663 ms | 663 ms | 104% |
| `run-repo-contract` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 20.3 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 20.2 s | 20.2 s | 100% |
| _unattributed_ |  |  | 77.6 ms | 0.4% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-14T17:17:24.207Z` → `2026-11-14T17:30:30.029Z` (786 s), ci: CI (run 43620104979)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `deaaafc18b5426f07b59528132254f2852602af3` on `dependabot/npm_and_yarn/dev-dependencies-6f64cd0fc8`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks: One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


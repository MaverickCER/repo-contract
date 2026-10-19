# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **0** per operation compared with a bare-minimum baseline (**0.0% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0 – $0.1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 0 | 1.87 s |
| Added latency, relative to baseline | 0.0% | 12% |
| Added CPU time per operation | 27.1 ms | 2.22 s |
| Added memory per operation (heap delta) | 10.9 MiB | 18.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0 – $0.1 | ~$10 |
| Single-core throughput ceiling of the overhead alone | ∞ ops/s | 1 ops/s |

## 1. End-to-end: the package's total impact

Shows what a repository pays, per contract run, for having repo-contract orchestrate its checks instead of spawning the same processes itself. Both sides spawn exactly the same trivial processes at the same concurrency; the difference is repo-contract's dependency scheduling, evidence capture, output handling and policy evaluation. This is CI and pre-push time, paid on every run: the floor under whatever the real tools cost.

- **Baseline (no package):** Spawn n trivial processes directly, eight at a time, with no repo-contract.
- **With the package:** `runChecks` runs n trivial checks (every fifth depends on the one before it) through the real scheduler, spawning the same processes at the same concurrency.

Both sides use empty or minimal functions on purpose, so the difference is the package's own cost -- not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| configured checks | swept | The tier axis: how many checks a repository configures and runs in one contract run. |
| work per check | fixed at "the fastest real process (node -e \"\")" | Every check spawns a real process that does nothing, so the cost measured is repo-contract's scheduling, not the tool a real check would run. |
| concurrency | fixed at 8 | Eight checks run at a time; more cores allow more, fewer allow less. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |
| dependency shape | fixed at "every fifth check depends on its predecessor" | Real contracts have a few dependency edges; chains and barriers are measured as variants of runChecks below. |

The baseline is an empty or minimal function, so it costs almost nothing and the _relative_ overhead can look enormous (shown as a multiple of the baseline). Read the absolute columns -- time, CPU and dollars added -- they are what a bill and a latency budget are made of.

| checks | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 138 ms | 152 ms | 14.6 ms | 11% | 12.2 ms | $0.030 – $0.137 |
| 40 | 250 ms | 271 ms | 20.6 ms | 8.2% | 19.0 ms | $0.043 – $0.214 |
| 80 | 520 ms | 519 ms | 0 | 0.0% | 27.1 ms | $0 – $0.305 |
| 160 | 1.06 s | 1.06 s | 0 | 0.0% | 67.9 ms | $0 – $0.764 |
| 320 | 2.03 s | 2.01 s | 0 | 0.0% | 140 ms | $0 – $1.58 |
| 640 | 4.07 s | 4.05 s | 0 | 0.0% | 308 ms | $0 – $3.46 |
| 1280 | 7.69 s | 8.51 s | 826 ms | 11% | 915 ms | $1.72 – $10.29 |
| 2560 | 15.6 s | 17.4 s | 1.87 s | 12% | 2.22 s | $3.90 – $24.92 |

**How the total grows:** O(n) (linear), exponent 1.02 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | check | O(n) | O(n) | ✅ matches | 584 ms | 17.4 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | check | O(n) | O(n) | ✅ matches | 560 ms | 15.9 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | check | O(n) | O(n) | ✅ matches | 570 ms | 18.3 s |
| `runChecks (scheduler and process orchestration)` (with-reporting-hook) | check | O(n) | O(n) | ✅ matches | 520 ms | 15.7 s |
| `runRepoContract` (plain) | check | O(n) | O(n) | ✅ matches | 512 ms | 977 ms (at 160) |
| `runRepoContract` (plain) | concurrency | O(1) | n/a | ❔ not enough data | 512 ms (at 16) | 512 ms (at 16) |
| `runRepoContract` (with-hooks) | check | O(n) | O(n) | ✅ matches | 519 ms | 985 ms (at 160) |
| `runRepoContract` (with-hooks) | concurrency | O(1) | n/a | ❔ not enough data | 534 ms (at 16) | 534 ms (at 16) |

> **Could not be determined.** The big-O of these could not be measured, so they are not checked against their documentation:
>
> - `run-repo-contract (plain)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.78, and a fit below 0.8 is not trusted; fitted exponent -0.33). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth
> - `run-repo-contract (with-hooks)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.76, and a fit below 0.8 is not trusted; fitted exponent -0.32). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth

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

- **long dependency chains** -- A chain through every check serializes the whole run and measures process latency, not scheduling; real contracts do not do this.
- **check timeouts and aborts** -- They are failure paths; the steady-state cost is the successful run.

**In the end-to-end run:** This is the end-to-end operation itself.

#### Variant `no-dependencies`

Every check is independent, so the scheduler can always keep eight running.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 147 ms | 151 ms | 47.0 ms | 3.3 MiB | 7 |
| 40 | 289 ms | 298 ms | 98.1 ms | 6.5 MiB | 3 |
| 80 | 584 ms | 628 ms | 183 ms | 11.2 MiB | 2 |
| 160 | 1.13 s | 1.15 s | 357 ms | 22.4 MiB | 1 |
| 320 | 2.25 s | 2.27 s | 701 ms | 44.9 MiB | 0 |
| 640 | 4.57 s | 4.58 s | 1.39 s | 44.3 MiB | 0 |
| 1280 | 9.05 s | 9.31 s | 2.81 s | 36.0 MiB | 0 |
| 2560 | 17.4 s | 17.6 s | 5.07 s | 47.9 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.97, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 173 ms | 173 ms | 47.0 ms | 3.3 MiB | 6 |
| 40 | 299 ms | 303 ms | 91.8 ms | 6.6 MiB | 3 |
| 80 | 560 ms | 573 ms | 174 ms | 11.4 MiB | 2 |
| 160 | 1.10 s | 1.13 s | 336 ms | 22.8 MiB | 1 |
| 320 | 2.12 s | 2.19 s | 640 ms | 45.6 MiB | 0 |
| 640 | 4.28 s | 4.28 s | 1.30 s | 45.6 MiB | 0 |
| 1280 | 8.35 s | 8.36 s | 2.51 s | 39.3 MiB | 0 |
| 2560 | 15.9 s | 16.3 s | 4.36 s | 32.2 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.01, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 139 ms | 146 ms | 42.5 ms | 3.3 MiB | 7 |
| 40 | 294 ms | 294 ms | 76.4 ms | 6.6 MiB | 3 |
| 80 | 570 ms | 573 ms | 139 ms | 11.9 MiB | 2 |
| 160 | 1.12 s | 1.14 s | 266 ms | 23.1 MiB | 1 |
| 320 | 2.29 s | 2.36 s | 545 ms | 46.9 MiB | 0 |
| 640 | 4.57 s | 4.58 s | 1.06 s | 50.9 MiB | 0 |
| 1280 | 9.23 s | 9.28 s | 2.21 s | 15.0 MiB | 0 |
| 2560 | 18.3 s | 18.6 s | 4.47 s | 8.3 MiB | 0 |

#### Variant `with-reporting-hook`

The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.98, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 155 ms | 161 ms | 45.0 ms | 2.9 MiB | 6 |
| 40 | 276 ms | 280 ms | 79.0 ms | 6.6 MiB | 4 |
| 80 | 520 ms | 524 ms | 150 ms | 11.4 MiB | 2 |
| 160 | 1.04 s | 1.18 s | 286 ms | 22.8 MiB | 1 |
| 320 | 2.09 s | 2.11 s | 598 ms | 45.7 MiB | 0 |
| 640 | 3.97 s | 4.07 s | 1.08 s | 45.7 MiB | 0 |
| 1280 | 7.97 s | 8.07 s | 2.27 s | 39.2 MiB | 0 |
| 2560 | 15.7 s | 16.1 s | 4.37 s | 13.2 MiB | 0 |

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

**Measured: O(n)** (exponent 0.91, 4 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 148 ms | 158 ms | 42.0 ms | 3.0 MiB | 7 |
| 40 | 263 ms | 265 ms | 76.2 ms | 6.0 MiB | 4 |
| 80 | 512 ms | 533 ms | 145 ms | 11.8 MiB | 2 |
| 160 | 977 ms | 981 ms | 277 ms | 23.6 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.33 s | 1.38 s | 113 ms | 11.8 MiB | 1 |
| 2 | 746 ms | 760 ms | 135 ms | 11.8 MiB | 1 |
| 4 | 545 ms | 556 ms | 153 ms | 11.8 MiB | 2 |
| 8 | 502 ms | 514 ms | 139 ms | 11.8 MiB | 2 |
| 16 | 512 ms | 517 ms | 143 ms | 11.8 MiB | 2 |

#### Variant `with-hooks`

Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.90, 4 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 153 ms | 168 ms | 42.1 ms | 3.0 MiB | 7 |
| 40 | 274 ms | 302 ms | 74.4 ms | 6.0 MiB | 4 |
| 80 | 519 ms | 567 ms | 147 ms | 11.8 MiB | 2 |
| 160 | 985 ms | 1.00 s | 276 ms | 23.6 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.37 s | 1.37 s | 116 ms | 11.8 MiB | 1 |
| 2 | 768 ms | 776 ms | 136 ms | 11.8 MiB | 1 |
| 4 | 554 ms | 558 ms | 154 ms | 11.8 MiB | 2 |
| 8 | 534 ms | 597 ms | 157 ms | 11.8 MiB | 2 |
| 16 | 534 ms | 536 ms | 154 ms | 11.8 MiB | 2 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 519 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 560 ms | 560 ms | 108% |
| `run-repo-contract` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 17.4 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 15.9 s | 15.9 s | 91% |
| _unattributed_ |  |  | 1.50 s | 8.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-19T12:49:00.132Z` → `2026-10-19T12:59:40.439Z` (640 s), ci: CI (run 39254970455)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `9a7f16bb0d0e2237799eb2925b1b4d3de7798c99` on `changeset-release/main`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


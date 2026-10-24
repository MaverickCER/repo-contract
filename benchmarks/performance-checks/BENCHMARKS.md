# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **no overhead this run could measure** (its median was at or below the baseline's, which is run-to-run noise, not a speed-up) per operation compared with a bare-minimum baseline (**0.0% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.99). At list prices that is on the order of **~$0 – $0.1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 0 | 470 ms |
| Added latency, relative to baseline | 0.0% | 2.9% |
| Added CPU time per operation | 25.8 ms | 1.61 s |
| Added memory per operation (heap delta) | 11.0 MiB | 21.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0 – $0.1 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | not measurable (no overhead measured) | 2 ops/s |

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
| 20 | 178 ms | 161 ms | 0 | 0.0% | 11.3 ms | $0 – $0.127 |
| 40 | 318 ms | 313 ms | 0 | 0.0% | 30.3 ms | $0 – $0.341 |
| 80 | 577 ms | 553 ms | 0 | 0.0% | 25.8 ms | $0 – $0.290 |
| 160 | 1.10 s | 1.10 s | 5.17 ms | 0.5% | 86.3 ms | $0.011 – $0.970 |
| 320 | 2.16 s | 2.03 s | 0 | 0.0% | 108 ms | $0 – $1.21 |
| 640 | 4.31 s | 4.01 s | 0 | 0.0% | 211 ms | $0 – $2.37 |
| 1280 | 8.52 s | 8.40 s | 0 | 0.0% | 771 ms | $0 – $8.66 |
| 2560 | 16.0 s | 16.5 s | 470 ms | 2.9% | 1.61 s | $0.980 – $18.12 |

**How the total grows:** O(n) (linear), exponent 0.99 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | check | O(n) | O(n) | ✅ matches | 540 ms | 17.0 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | check | O(n) | O(n) | ✅ matches | 527 ms | 16.1 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | check | O(n) | O(n) | ✅ matches | 603 ms | 19.5 s |
| `runChecks (scheduler and process orchestration)` (with-reporting-hook) | check | O(n) | O(n) | ✅ matches | 564 ms | 17.0 s |
| `runRepoContract` (plain) | check | O(n) | O(n) | ✅ matches | 553 ms | 1.12 s (at 160) |
| `runRepoContract` (plain) | concurrency | O(1) | O(1) | ✅ matches | 521 ms (at 16) | 521 ms (at 16) |
| `runRepoContract` (with-hooks) | check | O(n) | O(n) | ✅ matches | 529 ms | 1.05 s (at 160) |
| `runRepoContract` (with-hooks) | concurrency | O(1) | n/a | ❔ not enough data | 521 ms (at 16) | 521 ms (at 16) |

> **Could not be determined.** The big-O of these could not be measured, so they are not checked against their documentation:
>
> - `run-repo-contract (with-hooks)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.80, and a fit below 0.8 is not trusted; fitted exponent -0.36). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth

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

**Measured: O(n)** (exponent 0.97, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 156 ms | 173 ms | 54.0 ms | 3.3 MiB | 6 |
| 40 | 291 ms | 294 ms | 95.2 ms | 6.5 MiB | 3 |
| 80 | 540 ms | 560 ms | 163 ms | 11.3 MiB | 2 |
| 160 | 1.09 s | 1.09 s | 325 ms | 22.5 MiB | 1 |
| 320 | 2.32 s | 2.34 s | 725 ms | 44.8 MiB | 0 |
| 640 | 4.65 s | 4.71 s | 1.47 s | 44.0 MiB | 0 |
| 1280 | 8.19 s | 8.74 s | 2.35 s | 36.6 MiB | 0 |
| 2560 | 17.0 s | 17.1 s | 4.97 s | 47.1 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 166 ms | 229 ms | 44.1 ms | 3.3 MiB | 6 |
| 40 | 275 ms | 277 ms | 77.5 ms | 6.6 MiB | 4 |
| 80 | 527 ms | 537 ms | 150 ms | 11.4 MiB | 2 |
| 160 | 1.03 s | 1.05 s | 298 ms | 22.8 MiB | 1 |
| 320 | 2.10 s | 2.22 s | 595 ms | 45.6 MiB | 0 |
| 640 | 4.13 s | 4.19 s | 1.18 s | 45.6 MiB | 0 |
| 1280 | 8.06 s | 8.29 s | 2.31 s | 39.1 MiB | 0 |
| 2560 | 16.1 s | 16.2 s | 4.37 s | 12.0 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.02, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 146 ms | 147 ms | 42.7 ms | 3.3 MiB | 7 |
| 40 | 284 ms | 287 ms | 74.4 ms | 6.6 MiB | 4 |
| 80 | 603 ms | 663 ms | 157 ms | 11.9 MiB | 2 |
| 160 | 1.15 s | 1.16 s | 278 ms | 23.1 MiB | 1 |
| 320 | 2.33 s | 2.34 s | 556 ms | 46.8 MiB | 0 |
| 640 | 4.68 s | 4.90 s | 1.14 s | 50.8 MiB | 0 |
| 1280 | 9.52 s | 9.73 s | 2.33 s | 15.0 MiB | 0 |
| 2560 | 19.5 s | 19.6 s | 4.69 s | 54.2 MiB | 0 |

#### Variant `with-reporting-hook`

The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 168 ms | 171 ms | 49.0 ms | 3.3 MiB | 6 |
| 40 | 292 ms | 293 ms | 86.1 ms | 6.6 MiB | 3 |
| 80 | 564 ms | 593 ms | 176 ms | 11.4 MiB | 2 |
| 160 | 1.09 s | 1.11 s | 330 ms | 22.8 MiB | 1 |
| 320 | 2.09 s | 2.17 s | 631 ms | 45.7 MiB | 0 |
| 640 | 4.31 s | 4.34 s | 1.29 s | 45.8 MiB | 0 |
| 1280 | 8.63 s | 8.79 s | 2.60 s | 39.0 MiB | 0 |
| 2560 | 17.0 s | 17.3 s | 5.00 s | 46.3 MiB | 0 |

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

**Measured: O(n)** (exponent 0.93, 4 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 162 ms | 166 ms | 46.8 ms | 3.0 MiB | 6 |
| 40 | 293 ms | 294 ms | 89.1 ms | 6.0 MiB | 3 |
| 80 | 553 ms | 559 ms | 166 ms | 11.8 MiB | 2 |
| 160 | 1.12 s | 1.16 s | 338 ms | 23.6 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

**Measured: O(1)** (exponent -0.37, 5 sizes) -- ✅ matches.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.48 s | 1.51 s | 131 ms | 11.8 MiB | 1 |
| 2 | 834 ms | 842 ms | 153 ms | 11.8 MiB | 1 |
| 4 | 574 ms | 584 ms | 172 ms | 11.8 MiB | 2 |
| 8 | 527 ms | 529 ms | 148 ms | 11.8 MiB | 2 |
| 16 | 521 ms | 547 ms | 148 ms | 11.8 MiB | 2 |

#### Variant `with-hooks`

Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.92, 4 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 155 ms | 161 ms | 43.7 ms | 3.0 MiB | 6 |
| 40 | 278 ms | 283 ms | 83.0 ms | 6.0 MiB | 4 |
| 80 | 529 ms | 552 ms | 155 ms | 11.8 MiB | 2 |
| 160 | 1.05 s | 1.07 s | 308 ms | 23.6 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.49 s | 1.50 s | 138 ms | 11.8 MiB | 1 |
| 2 | 811 ms | 816 ms | 148 ms | 11.8 MiB | 1 |
| 4 | 566 ms | 566 ms | 164 ms | 11.8 MiB | 2 |
| 8 | 542 ms | 544 ms | 158 ms | 11.8 MiB | 2 |
| 16 | 521 ms | 534 ms | 149 ms | 11.8 MiB | 2 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 553 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 527 ms | 527 ms | 95% |
| `run-repo-contract` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 25.4 ms | 4.6% |

**At 2560 checks** (whole operation: 16.5 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 16.1 s | 16.1 s | 98% |
| _unattributed_ |  |  | 366 ms | 2.2% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-24T12:37:05.112Z` → `2026-10-24T12:47:58.935Z` (654 s), ci: CI (run 40094646708)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `08a56952368f6314fb95ed92557172cba05e5702` on `chore/zod-advisory`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


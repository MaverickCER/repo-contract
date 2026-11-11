# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **29.2 ms** per operation compared with a bare-minimum baseline (**4.6% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 29.2 ms | 1.53 s |
| Added latency, relative to baseline | 4.6% | 7.9% |
| Added CPU time per operation | 34.4 ms | 2.36 s |
| Added memory per operation (heap delta) | 10.9 MiB | 42.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$10 |
| Single-core throughput ceiling of the overhead alone | 34 ops/s | 1 ops/s |

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
| 20 | 155 ms | 192 ms | 36.5 ms | 24% | 12.8 ms | $0.076 – $0.144 |
| 40 | 314 ms | 342 ms | 28.4 ms | 9.1% | 20.3 ms | $0.059 – $0.228 |
| 80 | 637 ms | 666 ms | 29.2 ms | 4.6% | 34.4 ms | $0.061 – $0.387 |
| 160 | 1.27 s | 1.32 s | 49.1 ms | 3.9% | 104 ms | $0.102 – $1.17 |
| 320 | 2.50 s | 2.57 s | 69.6 ms | 2.8% | 189 ms | $0.145 – $2.12 |
| 640 | 5.07 s | 5.29 s | 222 ms | 4.4% | 495 ms | $0.463 – $5.57 |
| 1280 | 9.87 s | 10.3 s | 465 ms | 4.7% | 1.14 s | $0.970 – $12.80 |
| 2560 | 19.4 s | 21.0 s | 1.53 s | 7.9% | 2.36 s | $3.19 – $26.56 |

**How the total grows:** O(n) (linear), exponent 1.00 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | check | O(n) | O(n) | ✅ matches | 653 ms | 20.8 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | check | O(n) | O(n) | ✅ matches | 687 ms | 21.0 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | check | O(n) | O(n) | ✅ matches | 777 ms | 23.7 s |
| `runChecks (scheduler and process orchestration)` (with-reporting-hook) | check | O(n) | O(n) | ✅ matches | 714 ms | 21.1 s |
| `runRepoContract` (plain) | check | O(n) | O(n) | ✅ matches | 719 ms | 1.39 s (at 160) |
| `runRepoContract` (plain) | concurrency | O(1) | n/a | ❔ not enough data | 703 ms (at 16) | 703 ms (at 16) |
| `runRepoContract` (with-hooks) | check | O(n) | O(n) | ✅ matches | 713 ms | 1.39 s (at 160) |
| `runRepoContract` (with-hooks) | concurrency | O(1) | n/a | ❔ not enough data | 724 ms (at 16) | 724 ms (at 16) |

> **Could not be determined.** The big-O of these could not be measured, so they are not checked against their documentation:
>
> - `run-repo-contract (plain)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.76, and a fit below 0.8 is not trusted; fitted exponent -0.34). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth
> - `run-repo-contract (with-hooks)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.72, and a fit below 0.8 is not trusted; fitted exponent -0.33). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth

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

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 188 ms | 200 ms | 60.6 ms | 2.8 MiB | 5 |
| 40 | 327 ms | 333 ms | 101 ms | 6.4 MiB | 3 |
| 80 | 653 ms | 657 ms | 203 ms | 11.0 MiB | 2 |
| 160 | 1.30 s | 1.31 s | 402 ms | 22.0 MiB | 1 |
| 320 | 2.60 s | 2.71 s | 789 ms | 43.9 MiB | 0 |
| 640 | 5.37 s | 5.39 s | 1.67 s | 42.4 MiB | 0 |
| 1280 | 10.5 s | 10.8 s | 3.22 s | 33.1 MiB | 0 |
| 2560 | 20.8 s | 20.8 s | 6.23 s | 42.0 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 206 ms | 214 ms | 55.3 ms | 3.3 MiB | 5 |
| 40 | 353 ms | 365 ms | 103 ms | 6.5 MiB | 3 |
| 80 | 687 ms | 689 ms | 211 ms | 11.2 MiB | 1 |
| 160 | 1.36 s | 1.37 s | 410 ms | 22.4 MiB | 1 |
| 320 | 2.76 s | 2.77 s | 848 ms | 44.8 MiB | 0 |
| 640 | 5.44 s | 5.48 s | 1.68 s | 43.9 MiB | 0 |
| 1280 | 10.7 s | 10.8 s | 3.30 s | 35.9 MiB | 0 |
| 2560 | 21.0 s | 21.0 s | 6.32 s | 48.7 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 189 ms | 194 ms | 59.5 ms | 3.3 MiB | 5 |
| 40 | 375 ms | 381 ms | 102 ms | 6.5 MiB | 3 |
| 80 | 777 ms | 787 ms | 208 ms | 11.7 MiB | 1 |
| 160 | 1.49 s | 1.49 s | 376 ms | 22.6 MiB | 1 |
| 320 | 2.95 s | 2.96 s | 743 ms | 45.9 MiB | 0 |
| 640 | 5.92 s | 5.98 s | 1.48 s | 48.7 MiB | 0 |
| 1280 | 12.1 s | 12.3 s | 3.13 s | 9.5 MiB | 0 |
| 2560 | 23.7 s | 24.0 s | 5.91 s | 63.2 MiB | 0 |

#### Variant `with-reporting-hook`

The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 219 ms | 224 ms | 64.0 ms | 3.3 MiB | 5 |
| 40 | 390 ms | 401 ms | 126 ms | 6.5 MiB | 3 |
| 80 | 714 ms | 741 ms | 234 ms | 11.2 MiB | 1 |
| 160 | 1.41 s | 1.41 s | 450 ms | 22.3 MiB | 1 |
| 320 | 2.67 s | 2.73 s | 824 ms | 44.7 MiB | 0 |
| 640 | 5.46 s | 5.53 s | 1.74 s | 44.0 MiB | 0 |
| 1280 | 11.0 s | 11.1 s | 3.52 s | 35.2 MiB | 0 |
| 2560 | 21.1 s | 21.2 s | 6.41 s | 47.4 MiB | 0 |

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

**Measured: O(n)** (exponent 0.90, 4 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 218 ms | 219 ms | 63.8 ms | 3.0 MiB | 5 |
| 40 | 376 ms | 379 ms | 128 ms | 5.9 MiB | 3 |
| 80 | 719 ms | 722 ms | 239 ms | 11.6 MiB | 1 |
| 160 | 1.39 s | 1.40 s | 457 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.91 s | 1.91 s | 194 ms | 11.6 MiB | 1 |
| 2 | 1.03 s | 1.04 s | 196 ms | 11.6 MiB | 1 |
| 4 | 729 ms | 734 ms | 225 ms | 11.6 MiB | 1 |
| 8 | 718 ms | 719 ms | 235 ms | 11.6 MiB | 1 |
| 16 | 703 ms | 707 ms | 225 ms | 11.6 MiB | 1 |

#### Variant `with-hooks`

Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.91, 4 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 211 ms | 213 ms | 59.8 ms | 3.0 MiB | 5 |
| 40 | 368 ms | 371 ms | 122 ms | 5.9 MiB | 3 |
| 80 | 713 ms | 721 ms | 239 ms | 11.6 MiB | 1 |
| 160 | 1.39 s | 1.42 s | 440 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.90 s | 1.90 s | 193 ms | 11.6 MiB | 1 |
| 2 | 1.01 s | 1.02 s | 194 ms | 11.6 MiB | 1 |
| 4 | 718 ms | 737 ms | 229 ms | 11.6 MiB | 1 |
| 8 | 715 ms | 726 ms | 238 ms | 11.6 MiB | 1 |
| 16 | 724 ms | 726 ms | 234 ms | 11.6 MiB | 1 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 666 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 687 ms | 687 ms | 103% |
| `run-repo-contract` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 21.0 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 21.0 s | 21.0 s | 100% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-11T07:02:33.771Z` → `2026-11-11T07:16:08.623Z` (815 s), ci: CI (run 42975026328)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `f971baef5bef1f677014cd827bc0fadcb6498399` on `chore/bump-internal-package-contract-v0.17.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


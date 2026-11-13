# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **19.5 ms** per operation compared with a bare-minimum baseline (**3.2% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 19.5 ms | 776 ms |
| Added latency, relative to baseline | 3.2% | 4.0% |
| Added CPU time per operation | 41.3 ms | 1.06 s |
| Added memory per operation (heap delta) | 183.1 KiB | 12.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | 51 ops/s | 1 ops/s |

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
| 20 | 151 ms | 186 ms | 29.7 ms | 20% | 12.9 ms | $0.062 – $0.145 |
| 40 | 312 ms | 339 ms | 27.0 ms | 8.6% | 27.0 ms | $0.056 – $0.303 |
| 80 | 615 ms | 652 ms | 19.5 ms | 3.2% | 41.3 ms | $0.041 – $0.465 |
| 160 | 1.19 s | 1.25 s | 50.7 ms | 4.2% | 89.5 ms | $0.106 – $1.01 |
| 320 | 2.40 s | 2.44 s | 38.3 ms | 1.6% | 111 ms | $0.080 – $1.25 |
| 640 | 4.86 s | 4.94 s | 113 ms | 2.3% | 102 ms | $0.236 – $1.14 |
| 1280 | 9.90 s | 10.1 s | 172 ms | 1.7% | 510 ms | $0.358 – $5.74 |
| 2560 | 19.4 s | 20.1 s | 776 ms | 4.0% | 1.06 s | $1.62 – $11.93 |

**How the total grows:** O(n) (linear), exponent 1.00 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | check | O(n) | O(n) | ✅ matches | 616 ms | 19.6 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | check | O(n) | O(n) | ✅ matches | 637 ms | 20.6 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | check | O(n) | O(n) | ✅ matches | 735 ms | 22.3 s |
| `runChecks (scheduler and process orchestration)` (with-reporting-hook) | check | O(n) | O(n) | ✅ matches | 642 ms | 19.6 s |
| `runRepoContract` (plain) | check | O(n) | O(n) | ✅ matches | 651 ms | 1.31 s (at 160) |
| `runRepoContract` (plain) | concurrency | O(1) | n/a | ❔ not enough data | 669 ms (at 16) | 669 ms (at 16) |
| `runRepoContract` (with-hooks) | check | O(n) | O(n) | ✅ matches | 667 ms | 1.31 s (at 160) |
| `runRepoContract` (with-hooks) | concurrency | O(1) | n/a | ❔ not enough data | 682 ms (at 16) | 682 ms (at 16) |

> **Could not be determined.** The big-O of these could not be measured, so they are not checked against their documentation:
>
> - `run-repo-contract (plain)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.75, and a fit below 0.8 is not trusted; fitted exponent -0.35). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth
> - `run-repo-contract (with-hooks)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.73, and a fit below 0.8 is not trusted; fitted exponent -0.34). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth

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
| 20 | 156 ms | 161 ms | 47.8 ms | 2.8 MiB | 6 |
| 40 | 317 ms | 324 ms | 102 ms | 6.4 MiB | 3 |
| 80 | 616 ms | 620 ms | 188 ms | 11.1 MiB | 2 |
| 160 | 1.22 s | 1.22 s | 358 ms | 22.1 MiB | 1 |
| 320 | 2.47 s | 2.47 s | 709 ms | 44.0 MiB | 0 |
| 640 | 4.86 s | 4.95 s | 1.38 s | 42.7 MiB | 0 |
| 1280 | 9.72 s | 9.79 s | 2.79 s | 33.8 MiB | 0 |
| 2560 | 19.6 s | 19.6 s | 5.48 s | 49.5 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 1.01, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 190 ms | 192 ms | 42.5 ms | 3.3 MiB | 5 |
| 40 | 330 ms | 331 ms | 88.3 ms | 6.5 MiB | 3 |
| 80 | 637 ms | 641 ms | 177 ms | 11.2 MiB | 2 |
| 160 | 1.26 s | 1.28 s | 366 ms | 22.4 MiB | 1 |
| 320 | 2.47 s | 2.49 s | 694 ms | 44.6 MiB | 0 |
| 640 | 5.06 s | 5.07 s | 1.47 s | 43.9 MiB | 0 |
| 1280 | 10.1 s | 10.2 s | 2.99 s | 36.0 MiB | 0 |
| 2560 | 20.6 s | 20.6 s | 6.01 s | 45.8 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 184 ms | 187 ms | 47.2 ms | 3.2 MiB | 5 |
| 40 | 370 ms | 375 ms | 97.6 ms | 6.5 MiB | 3 |
| 80 | 735 ms | 746 ms | 191 ms | 11.2 MiB | 1 |
| 160 | 1.46 s | 1.48 s | 377 ms | 22.6 MiB | 1 |
| 320 | 2.93 s | 2.97 s | 730 ms | 45.9 MiB | 0 |
| 640 | 5.86 s | 5.93 s | 1.45 s | 48.7 MiB | 0 |
| 1280 | 11.7 s | 11.7 s | 2.91 s | 9.6 MiB | 0 |
| 2560 | 22.3 s | 22.3 s | 5.25 s | 26.1 MiB | 0 |

#### Variant `with-reporting-hook`

The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 195 ms | 205 ms | 58.8 ms | 3.3 MiB | 5 |
| 40 | 352 ms | 352 ms | 111 ms | 6.5 MiB | 3 |
| 80 | 642 ms | 647 ms | 191 ms | 11.2 MiB | 2 |
| 160 | 1.25 s | 1.27 s | 368 ms | 22.3 MiB | 1 |
| 320 | 2.45 s | 2.46 s | 712 ms | 44.6 MiB | 0 |
| 640 | 4.83 s | 4.93 s | 1.39 s | 43.8 MiB | 0 |
| 1280 | 9.93 s | 9.97 s | 2.90 s | 35.9 MiB | 0 |
| 2560 | 19.6 s | 19.7 s | 5.53 s | 53.9 MiB | 0 |

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
| 20 | 196 ms | 197 ms | 52.6 ms | 3.0 MiB | 5 |
| 40 | 350 ms | 356 ms | 110 ms | 5.9 MiB | 3 |
| 80 | 651 ms | 656 ms | 195 ms | 11.6 MiB | 2 |
| 160 | 1.31 s | 1.32 s | 395 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.85 s | 1.85 s | 176 ms | 11.6 MiB | 1 |
| 2 | 984 ms | 992 ms | 181 ms | 11.6 MiB | 1 |
| 4 | 687 ms | 701 ms | 200 ms | 11.6 MiB | 1 |
| 8 | 680 ms | 681 ms | 206 ms | 11.6 MiB | 1 |
| 16 | 669 ms | 703 ms | 206 ms | 11.6 MiB | 1 |

#### Variant `with-hooks`

Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.90, 4 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 200 ms | 202 ms | 50.2 ms | 3.0 MiB | 5 |
| 40 | 361 ms | 375 ms | 111 ms | 5.9 MiB | 3 |
| 80 | 667 ms | 667 ms | 209 ms | 11.6 MiB | 1 |
| 160 | 1.31 s | 1.33 s | 405 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.87 s | 1.87 s | 181 ms | 11.6 MiB | 1 |
| 2 | 979 ms | 992 ms | 181 ms | 11.6 MiB | 1 |
| 4 | 681 ms | 697 ms | 203 ms | 11.6 MiB | 1 |
| 8 | 680 ms | 689 ms | 217 ms | 11.6 MiB | 1 |
| 16 | 682 ms | 682 ms | 212 ms | 11.6 MiB | 1 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 652 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 637 ms | 637 ms | 98% |
| `run-repo-contract` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 14.5 ms | 2.2% |

**At 2560 checks** (whole operation: 20.1 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 20.6 s | 20.6 s | 103% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-13T00:05:23.384Z` → `2026-11-13T00:18:17.238Z` (774 s), ci: CI (run 43333798477)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `364060fc11152ee4034737a0bc82ec8f721c5c53` on `docs/v1-claims-evidence`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **21.2 ms** per operation compared with a bare-minimum baseline (**3.7% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.01). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 21.2 ms | 1.29 s |
| Added latency, relative to baseline | 3.7% | 7.4% |
| Added CPU time per operation | 42.2 ms | 2.37 s |
| Added memory per operation (heap delta) | 11.0 MiB | 37.1 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | 47 ops/s | 1 ops/s |

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
| 20 | 199 ms | 181 ms | 0 | 0.0% | 9.63 ms | $0 – $0.108 |
| 40 | 295 ms | 317 ms | 22.2 ms | 7.5% | 30.5 ms | $0.046 – $0.342 |
| 80 | 576 ms | 597 ms | 21.2 ms | 3.7% | 42.2 ms | $0.044 – $0.474 |
| 160 | 1.14 s | 1.15 s | 6.94 ms | 0.6% | 88.8 ms | $0.014 – $0.999 |
| 320 | 2.33 s | 2.33 s | 3.10 ms | 0.1% | 188 ms | $0.0065 – $2.12 |
| 640 | 4.48 s | 4.58 s | 97.4 ms | 2.2% | 475 ms | $0.203 – $5.34 |
| 1280 | 8.98 s | 9.57 s | 588 ms | 6.6% | 1.32 s | $1.23 – $14.86 |
| 2560 | 17.4 s | 18.7 s | 1.29 s | 7.4% | 2.37 s | $2.69 – $26.63 |

**How the total grows:** O(n) (linear), exponent 1.01 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | check | O(n) | O(n) | ✅ matches | 593 ms | 19.3 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | check | O(n) | O(n) | ✅ matches | 628 ms | 17.8 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | check | O(n) | O(n) | ✅ matches | 628 ms | 20.2 s |
| `runChecks (scheduler and process orchestration)` (with-reporting-hook) | check | O(n) | O(n) | ✅ matches | 586 ms | 18.0 s |
| `runRepoContract` (plain) | check | O(n) | O(n) | ✅ matches | 596 ms | 1.15 s (at 160) |
| `runRepoContract` (plain) | concurrency | O(1) | n/a | ❔ not enough data | 625 ms (at 16) | 625 ms (at 16) |
| `runRepoContract` (with-hooks) | check | O(n) | O(n) | ✅ matches | 592 ms | 1.21 s (at 160) |
| `runRepoContract` (with-hooks) | concurrency | O(1) | O(1) | ✅ matches | 596 ms (at 16) | 596 ms (at 16) |

> **Could not be determined.** The big-O of these could not be measured, so they are not checked against their documentation:
>
> - `run-repo-contract (plain)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.72, and a fit below 0.8 is not trusted; fitted exponent -0.34). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth

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
| 20 | 155 ms | 160 ms | 54.2 ms | 3.2 MiB | 6 |
| 40 | 313 ms | 316 ms | 114 ms | 6.4 MiB | 3 |
| 80 | 593 ms | 594 ms | 210 ms | 11.0 MiB | 2 |
| 160 | 1.23 s | 1.24 s | 440 ms | 22.0 MiB | 1 |
| 320 | 2.48 s | 2.55 s | 888 ms | 44.0 MiB | 0 |
| 640 | 4.94 s | 4.98 s | 1.77 s | 42.4 MiB | 0 |
| 1280 | 9.95 s | 9.98 s | 3.55 s | 32.7 MiB | 0 |
| 2560 | 19.3 s | 19.3 s | 6.72 s | 33.9 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.96, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 182 ms | 188 ms | 55.3 ms | 3.3 MiB | 5 |
| 40 | 330 ms | 330 ms | 111 ms | 6.5 MiB | 3 |
| 80 | 628 ms | 649 ms | 218 ms | 11.2 MiB | 2 |
| 160 | 1.23 s | 1.24 s | 428 ms | 22.3 MiB | 1 |
| 320 | 2.39 s | 2.40 s | 817 ms | 44.7 MiB | 0 |
| 640 | 4.77 s | 4.78 s | 1.63 s | 43.9 MiB | 0 |
| 1280 | 8.99 s | 9.31 s | 3.09 s | 35.9 MiB | 0 |
| 2560 | 17.8 s | 18.1 s | 6.02 s | 23.8 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 157 ms | 157 ms | 49.2 ms | 3.3 MiB | 6 |
| 40 | 303 ms | 307 ms | 92.5 ms | 6.5 MiB | 3 |
| 80 | 628 ms | 633 ms | 185 ms | 11.7 MiB | 2 |
| 160 | 1.26 s | 1.26 s | 342 ms | 22.6 MiB | 1 |
| 320 | 2.44 s | 2.59 s | 662 ms | 45.9 MiB | 0 |
| 640 | 4.97 s | 5.19 s | 1.37 s | 48.7 MiB | 0 |
| 1280 | 9.94 s | 10.1 s | 2.73 s | 8.9 MiB | 0 |
| 2560 | 20.2 s | 20.4 s | 5.62 s | 67.4 MiB | 0 |

#### Variant `with-reporting-hook`

The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 176 ms | 179 ms | 57.4 ms | 2.8 MiB | 6 |
| 40 | 303 ms | 318 ms | 109 ms | 6.5 MiB | 3 |
| 80 | 586 ms | 592 ms | 210 ms | 11.2 MiB | 2 |
| 160 | 1.15 s | 1.17 s | 392 ms | 22.3 MiB | 1 |
| 320 | 2.24 s | 2.27 s | 775 ms | 44.7 MiB | 0 |
| 640 | 4.35 s | 4.58 s | 1.44 s | 43.9 MiB | 0 |
| 1280 | 9.35 s | 9.68 s | 3.30 s | 35.4 MiB | 0 |
| 2560 | 18.0 s | 18.2 s | 6.16 s | 22.8 MiB | 0 |

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
| 20 | 176 ms | 183 ms | 57.8 ms | 3.0 MiB | 6 |
| 40 | 318 ms | 320 ms | 114 ms | 5.9 MiB | 3 |
| 80 | 596 ms | 606 ms | 216 ms | 11.6 MiB | 2 |
| 160 | 1.15 s | 1.22 s | 408 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.69 s | 1.70 s | 188 ms | 11.6 MiB | 1 |
| 2 | 898 ms | 907 ms | 195 ms | 11.6 MiB | 1 |
| 4 | 604 ms | 611 ms | 198 ms | 11.6 MiB | 2 |
| 8 | 610 ms | 627 ms | 225 ms | 11.6 MiB | 2 |
| 16 | 625 ms | 641 ms | 227 ms | 11.6 MiB | 2 |

#### Variant `with-hooks`

Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.90, 4 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 182 ms | 183 ms | 57.2 ms | 3.0 MiB | 5 |
| 40 | 331 ms | 352 ms | 124 ms | 5.9 MiB | 3 |
| 80 | 592 ms | 623 ms | 212 ms | 11.6 MiB | 2 |
| 160 | 1.21 s | 1.22 s | 432 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

**Measured: O(1)** (exponent -0.35, 5 sizes) -- ✅ matches.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.67 s | 1.69 s | 186 ms | 11.6 MiB | 1 |
| 2 | 908 ms | 914 ms | 200 ms | 11.6 MiB | 1 |
| 4 | 679 ms | 684 ms | 238 ms | 11.6 MiB | 1 |
| 8 | 620 ms | 625 ms | 226 ms | 11.6 MiB | 2 |
| 16 | 596 ms | 613 ms | 206 ms | 11.6 MiB | 2 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 597 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 628 ms | 628 ms | 105% |
| `run-repo-contract` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 18.7 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 17.8 s | 17.8 s | 95% |
| _unattributed_ |  |  | 908 ms | 4.9% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-09T20:02:28.489Z` → `2026-11-09T20:14:22.632Z` (714 s), ci: CI (run 42688972549)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `6a44026fb94c96831f0f0a3fd88fd58afb21b25c` on `chore/bump-internal-package-contract-v0.16.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **17.4 ms** per operation compared with a bare-minimum baseline (**2.6% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 17.4 ms | 848 ms |
| Added latency, relative to baseline | 2.6% | 4.1% |
| Added CPU time per operation | 33.9 ms | 1.57 s |
| Added memory per operation (heap delta) | 10.9 MiB | 36.5 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | 58 ops/s | 1 ops/s |

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
| 20 | 174 ms | 203 ms | 29.2 ms | 17% | 12.7 ms | $0.061 – $0.143 |
| 40 | 334 ms | 355 ms | 21.3 ms | 6.4% | 17.0 ms | $0.044 – $0.192 |
| 80 | 667 ms | 685 ms | 17.4 ms | 2.6% | 33.9 ms | $0.036 – $0.381 |
| 160 | 1.37 s | 1.33 s | 0 | 0.0% | 72.4 ms | $0 – $0.814 |
| 320 | 2.61 s | 2.63 s | 16.8 ms | 0.6% | 142 ms | $0.035 – $1.60 |
| 640 | 5.26 s | 5.25 s | 0 | 0.0% | 314 ms | $0 – $3.53 |
| 1280 | 10.4 s | 10.5 s | 109 ms | 1.0% | 752 ms | $0.226 – $8.46 |
| 2560 | 20.5 s | 21.4 s | 848 ms | 4.1% | 1.57 s | $1.77 – $17.66 |

**How the total grows:** O(n) (linear), exponent 1.00 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | check | O(n) | O(n) | ✅ matches | 678 ms | 21.9 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | check | O(n) | O(n) | ✅ matches | 719 ms | 21.2 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | check | O(n) | O(n) | ✅ matches | 753 ms | 24.4 s |
| `runChecks (scheduler and process orchestration)` (with-reporting-hook) | check | O(n) | O(n) | ✅ matches | 720 ms | 21.4 s |
| `runRepoContract` (plain) | check | O(n) | O(n) | ✅ matches | 707 ms | 1.38 s (at 160) |
| `runRepoContract` (plain) | concurrency | O(1) | n/a | ❔ not enough data | 701 ms (at 16) | 701 ms (at 16) |
| `runRepoContract` (with-hooks) | check | O(n) | O(n) | ✅ matches | 709 ms | 1.34 s (at 160) |
| `runRepoContract` (with-hooks) | concurrency | O(1) | n/a | ❔ not enough data | 704 ms (at 16) | 704 ms (at 16) |

> **Could not be determined.** The big-O of these could not be measured, so they are not checked against their documentation:
>
> - `run-repo-contract (plain)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.76, and a fit below 0.8 is not trusted; fitted exponent -0.34). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth
> - `run-repo-contract (with-hooks)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.74, and a fit below 0.8 is not trusted; fitted exponent -0.33). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth

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
| 20 | 175 ms | 180 ms | 47.3 ms | 3.3 MiB | 6 |
| 40 | 340 ms | 352 ms | 89.9 ms | 6.5 MiB | 3 |
| 80 | 678 ms | 687 ms | 164 ms | 11.2 MiB | 1 |
| 160 | 1.37 s | 1.39 s | 318 ms | 22.4 MiB | 1 |
| 320 | 2.75 s | 2.76 s | 638 ms | 44.8 MiB | 0 |
| 640 | 5.47 s | 5.49 s | 1.29 s | 44.2 MiB | 0 |
| 1280 | 10.9 s | 10.9 s | 2.59 s | 36.7 MiB | 0 |
| 2560 | 21.9 s | 22.0 s | 5.13 s | 46.4 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.98, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 220 ms | 225 ms | 52.1 ms | 3.3 MiB | 5 |
| 40 | 374 ms | 382 ms | 91.8 ms | 6.6 MiB | 3 |
| 80 | 719 ms | 726 ms | 173 ms | 11.4 MiB | 1 |
| 160 | 1.40 s | 1.42 s | 334 ms | 22.8 MiB | 1 |
| 320 | 2.76 s | 2.78 s | 659 ms | 45.6 MiB | 0 |
| 640 | 5.47 s | 5.47 s | 1.29 s | 45.5 MiB | 0 |
| 1280 | 10.8 s | 10.9 s | 2.55 s | 39.3 MiB | 0 |
| 2560 | 21.2 s | 21.3 s | 4.92 s | 44.3 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 190 ms | 205 ms | 52.9 ms | 3.3 MiB | 5 |
| 40 | 382 ms | 388 ms | 86.7 ms | 6.6 MiB | 3 |
| 80 | 753 ms | 755 ms | 160 ms | 11.8 MiB | 1 |
| 160 | 1.52 s | 1.52 s | 308 ms | 23.1 MiB | 1 |
| 320 | 3.03 s | 3.05 s | 609 ms | 46.9 MiB | 0 |
| 640 | 6.07 s | 6.13 s | 1.21 s | 51.0 MiB | 0 |
| 1280 | 12.1 s | 12.3 s | 2.45 s | 14.6 MiB | 0 |
| 2560 | 24.4 s | 24.5 s | 4.83 s | 36.5 MiB | 0 |

#### Variant `with-reporting-hook`

The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 221 ms | 223 ms | 51.1 ms | 3.3 MiB | 5 |
| 40 | 371 ms | 378 ms | 94.5 ms | 6.6 MiB | 3 |
| 80 | 720 ms | 721 ms | 180 ms | 11.4 MiB | 1 |
| 160 | 1.39 s | 1.41 s | 344 ms | 22.8 MiB | 1 |
| 320 | 2.70 s | 2.74 s | 649 ms | 45.6 MiB | 0 |
| 640 | 5.42 s | 5.48 s | 1.29 s | 45.7 MiB | 0 |
| 1280 | 10.7 s | 10.7 s | 2.55 s | 39.3 MiB | 0 |
| 2560 | 21.4 s | 21.4 s | 5.04 s | 16.6 MiB | 0 |

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
| 20 | 206 ms | 219 ms | 53.6 ms | 3.0 MiB | 5 |
| 40 | 373 ms | 376 ms | 96.5 ms | 6.0 MiB | 3 |
| 80 | 707 ms | 715 ms | 176 ms | 11.8 MiB | 1 |
| 160 | 1.38 s | 1.39 s | 340 ms | 23.6 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.89 s | 1.94 s | 147 ms | 11.8 MiB | 1 |
| 2 | 1.01 s | 1.02 s | 159 ms | 11.8 MiB | 1 |
| 4 | 728 ms | 741 ms | 173 ms | 11.8 MiB | 1 |
| 8 | 698 ms | 709 ms | 169 ms | 11.8 MiB | 1 |
| 16 | 701 ms | 701 ms | 169 ms | 11.8 MiB | 1 |

#### Variant `with-hooks`

Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.89, 4 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 212 ms | 215 ms | 48.3 ms | 3.0 MiB | 5 |
| 40 | 369 ms | 369 ms | 92.8 ms | 6.0 MiB | 3 |
| 80 | 709 ms | 720 ms | 182 ms | 11.8 MiB | 1 |
| 160 | 1.34 s | 1.34 s | 322 ms | 23.6 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.88 s | 1.88 s | 146 ms | 11.8 MiB | 1 |
| 2 | 1.00e+3 ms | 1.00 s | 154 ms | 11.8 MiB | 1 |
| 4 | 711 ms | 723 ms | 168 ms | 11.8 MiB | 1 |
| 8 | 705 ms | 713 ms | 172 ms | 11.8 MiB | 1 |
| 16 | 704 ms | 707 ms | 177 ms | 11.8 MiB | 1 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 685 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 719 ms | 719 ms | 105% |
| `run-repo-contract` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 21.4 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 21.2 s | 21.2 s | 99% |
| _unattributed_ |  |  | 191 ms | 0.9% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-24T13:08:41.998Z` → `2026-10-24T13:22:34.155Z` (832 s), ci: CI (run 40096835946)
- Machine: INTEL(R) XEON(R) PLATINUM 8573C, 4 logical core(s) (2 physical), 15989 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `72d58e9411c9b1d4c7f13c886abb5de93dbb6068` on `chore/zod-4-6-7`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


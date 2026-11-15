# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **20.5 ms** per operation compared with a bare-minimum baseline (**4.4% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.99). At list prices that is on the order of **~$0.1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 20.5 ms | 211 ms |
| Added latency, relative to baseline | 4.4% | 1.4% |
| Added CPU time per operation | 27.6 ms | 641 ms |
| Added memory per operation (heap delta) | 128.4 KiB | 34.1 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | 49 ops/s | 5 ops/s |

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
| 20 | 124 ms | 152 ms | 34.2 ms | 28% | 11.6 ms | $0.071 – $0.130 |
| 40 | 236 ms | 264 ms | 25.7 ms | 11% | 16.1 ms | $0.053 – $0.181 |
| 80 | 469 ms | 492 ms | 20.5 ms | 4.4% | 27.6 ms | $0.043 – $0.311 |
| 160 | 934 ms | 960 ms | 33.3 ms | 3.6% | 54.0 ms | $0.069 – $0.608 |
| 320 | 1.86 s | 1.91 s | 60.3 ms | 3.2% | 86.3 ms | $0.126 – $0.970 |
| 640 | 3.70 s | 3.78 s | 69.9 ms | 1.9% | 121 ms | $0.146 – $1.36 |
| 1280 | 7.39 s | 7.51 s | 114 ms | 1.5% | 359 ms | $0.237 – $4.03 |
| 2560 | 14.8 s | 15.0 s | 211 ms | 1.4% | 641 ms | $0.441 – $7.20 |

**How the total grows:** O(n) (linear), exponent 0.99 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | check | O(n) | O(n) | ✅ matches | 477 ms | 14.9 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | check | O(n) | O(n) | ✅ matches | 491 ms | 15.1 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | check | O(n) | O(n) | ✅ matches | 548 ms | 17.8 s |
| `runChecks (scheduler and process orchestration)` (with-reporting-hook) | check | O(n) | O(n) | ✅ matches | 512 ms | 15.4 s |
| `runRepoContract` (plain) | check | O(n) | O(n) | ✅ matches | 499 ms | 966 ms (at 160) |
| `runRepoContract` (plain) | concurrency | O(1) | n/a | ❔ not enough data | 501 ms (at 16) | 501 ms (at 16) |
| `runRepoContract` (with-hooks) | check | O(n) | O(n) | ✅ matches | 501 ms | 986 ms (at 160) |
| `runRepoContract` (with-hooks) | concurrency | O(1) | n/a | ❔ not enough data | 505 ms (at 16) | 505 ms (at 16) |

> **Could not be determined.** The big-O of these could not be measured, so they are not checked against their documentation:
>
> - `run-repo-contract (plain)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.75, and a fit below 0.8 is not trusted; fitted exponent -0.36). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth
> - `run-repo-contract (with-hooks)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.77, and a fit below 0.8 is not trusted; fitted exponent -0.36). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth

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
| 20 | 127 ms | 129 ms | 35.2 ms | 2.8 MiB | 8 |
| 40 | 238 ms | 245 ms | 61.0 ms | 6.4 MiB | 4 |
| 80 | 477 ms | 479 ms | 122 ms | 11.0 MiB | 2 |
| 160 | 937 ms | 940 ms | 229 ms | 22.1 MiB | 1 |
| 320 | 1.86 s | 1.88 s | 451 ms | 44.0 MiB | 1 |
| 640 | 3.75 s | 3.78 s | 900 ms | 42.5 MiB | 0 |
| 1280 | 7.50 s | 7.51 s | 1.82 s | 33.3 MiB | 0 |
| 2560 | 14.9 s | 15.1 s | 3.51 s | 48.8 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.99, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 150 ms | 153 ms | 31.6 ms | 3.3 MiB | 7 |
| 40 | 259 ms | 273 ms | 59.0 ms | 6.5 MiB | 4 |
| 80 | 491 ms | 502 ms | 117 ms | 11.2 MiB | 2 |
| 160 | 971 ms | 984 ms | 228 ms | 22.3 MiB | 1 |
| 320 | 1.91 s | 1.92 s | 448 ms | 44.6 MiB | 1 |
| 640 | 3.78 s | 3.78 s | 897 ms | 43.8 MiB | 0 |
| 1280 | 7.59 s | 7.62 s | 1.83 s | 35.9 MiB | 0 |
| 2560 | 15.1 s | 15.2 s | 3.53 s | 45.7 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.01, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 137 ms | 138 ms | 29.6 ms | 3.2 MiB | 7 |
| 40 | 272 ms | 275 ms | 60.9 ms | 6.5 MiB | 4 |
| 80 | 548 ms | 548 ms | 111 ms | 11.2 MiB | 2 |
| 160 | 1.10 s | 1.10 s | 224 ms | 22.6 MiB | 1 |
| 320 | 2.17 s | 2.18 s | 433 ms | 45.8 MiB | 0 |
| 640 | 4.38 s | 4.38 s | 881 ms | 48.6 MiB | 0 |
| 1280 | 8.79 s | 8.83 s | 1.79 s | 9.5 MiB | 0 |
| 2560 | 17.8 s | 17.9 s | 3.50 s | 23.5 MiB | 0 |

#### Variant `with-reporting-hook`

The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.98, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 153 ms | 154 ms | 40.2 ms | 3.2 MiB | 7 |
| 40 | 274 ms | 275 ms | 75.7 ms | 6.5 MiB | 4 |
| 80 | 512 ms | 512 ms | 131 ms | 11.2 MiB | 2 |
| 160 | 1.01 s | 1.02 s | 244 ms | 22.3 MiB | 1 |
| 320 | 1.97 s | 1.97 s | 467 ms | 44.6 MiB | 1 |
| 640 | 3.88 s | 3.89 s | 928 ms | 43.6 MiB | 0 |
| 1280 | 7.78 s | 7.91 s | 1.89 s | 35.7 MiB | 0 |
| 2560 | 15.4 s | 15.8 s | 3.60 s | 47.1 MiB | 0 |

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

**Measured: O(n)** (exponent 0.88, 4 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 155 ms | 158 ms | 42.1 ms | 3.0 MiB | 6 |
| 40 | 269 ms | 279 ms | 70.7 ms | 5.8 MiB | 4 |
| 80 | 499 ms | 504 ms | 129 ms | 11.6 MiB | 2 |
| 160 | 966 ms | 983 ms | 244 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.45 s | 1.45 s | 109 ms | 11.6 MiB | 1 |
| 2 | 735 ms | 747 ms | 116 ms | 11.5 MiB | 1 |
| 4 | 516 ms | 516 ms | 126 ms | 11.6 MiB | 2 |
| 8 | 497 ms | 509 ms | 127 ms | 11.6 MiB | 2 |
| 16 | 501 ms | 503 ms | 125 ms | 11.6 MiB | 2 |

#### Variant `with-hooks`

Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.89, 4 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 155 ms | 155 ms | 32.8 ms | 3.0 MiB | 6 |
| 40 | 268 ms | 273 ms | 74.0 ms | 5.8 MiB | 4 |
| 80 | 501 ms | 508 ms | 128 ms | 11.6 MiB | 2 |
| 160 | 986 ms | 991 ms | 239 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.43 s | 1.43 s | 110 ms | 11.6 MiB | 1 |
| 2 | 757 ms | 759 ms | 121 ms | 11.6 MiB | 1 |
| 4 | 526 ms | 527 ms | 126 ms | 11.6 MiB | 2 |
| 8 | 502 ms | 505 ms | 126 ms | 11.6 MiB | 2 |
| 16 | 505 ms | 506 ms | 129 ms | 11.6 MiB | 2 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 492 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 491 ms | 491 ms | 100% |
| `run-repo-contract` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 897 µs | 0.2% |

**At 2560 checks** (whole operation: 15.0 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 15.1 s | 15.1 s | 101% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-15T21:38:46.410Z` → `2026-11-15T21:48:39.047Z` (593 s), ci: CI (run 43764681048)
- Machine: Intel(R) Xeon(R) 6975P-C, 4 logical core(s) (2 physical), 15701 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `4e579bb6c18fc4991d98d19f391f709f27edd82e` on `feat/v1-readiness`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks: One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


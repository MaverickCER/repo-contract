# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **15.4 ms** per operation compared with a bare-minimum baseline (**3.0%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 0.99). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 15.4 ms | 851 ms |
| Added latency, relative to baseline | 3.0% | 5.5% |
| Added CPU time per operation | 31.5 ms | 1.66 s |
| Added memory per operation (heap delta) | 11.0 MiB | 4.4 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | 65 ops/s | 1 ops/s |

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
| 20 | 129 ms | 159 ms | 30.2 ms | 23% | 16.7 ms | $0.063 – $0.187 |
| 40 | 238 ms | 283 ms | 44.5 ms | 19% | 23.9 ms | $0.093 – $0.269 |
| 80 | 519 ms | 534 ms | 15.4 ms | 3.0% | 31.5 ms | $0.032 – $0.354 |
| 160 | 958 ms | 1.04 s | 83.1 ms | 8.7% | 99.0 ms | $0.173 – $1.11 |
| 320 | 2.06 s | 2.08 s | 17.9 ms | 0.9% | 163 ms | $0.037 – $1.83 |
| 640 | 3.85 s | 4.07 s | 222 ms | 5.8% | 398 ms | $0.463 – $4.47 |
| 1280 | 7.49 s | 8.02 s | 537 ms | 7.2% | 864 ms | $1.12 – $9.72 |
| 2560 | 15.6 s | 16.5 s | 851 ms | 5.5% | 1.66 s | $1.77 – $18.70 |

**How the total grows:** O(n) (linear), exponent 0.99 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | O(n) | O(n) | ✅ matches | 519 ms | 16.1 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | O(n) | O(n) | ✅ matches | 540 ms | 16.7 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | O(n) | O(n) | ✅ matches | 671 ms | 18.9 s |

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

**Measured: O(n)** (exponent 0.98, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 138 ms | 141 ms | 44.2 ms | 2.8 MiB | 7 |
| 40 | 263 ms | 264 ms | 80.4 ms | 6.5 MiB | 4 |
| 80 | 519 ms | 524 ms | 152 ms | 11.2 MiB | 2 |
| 160 | 1.05 s | 1.10 s | 317 ms | 22.4 MiB | 1 |
| 320 | 2.07 s | 2.15 s | 598 ms | 44.8 MiB | 0 |
| 640 | 4.05 s | 4.12 s | 1.17 s | 44.0 MiB | 0 |
| 1280 | 8.07 s | 8.18 s | 2.31 s | 36.4 MiB | 0 |
| 2560 | 16.1 s | 16.4 s | 4.47 s | 23.9 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 1.01, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 157 ms | 158 ms | 42.0 ms | 3.3 MiB | 6 |
| 40 | 269 ms | 284 ms | 76.6 ms | 6.6 MiB | 4 |
| 80 | 540 ms | 557 ms | 152 ms | 11.4 MiB | 2 |
| 160 | 1.01 s | 1.01 s | 285 ms | 22.8 MiB | 1 |
| 320 | 2.08 s | 2.12 s | 587 ms | 45.5 MiB | 0 |
| 640 | 4.10 s | 4.15 s | 1.16 s | 45.3 MiB | 0 |
| 1280 | 8.19 s | 8.31 s | 2.36 s | 39.0 MiB | 0 |
| 2560 | 16.7 s | 17.7 s | 4.73 s | 29.9 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 0.96, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 168 ms | 171 ms | 53.1 ms | 3.3 MiB | 6 |
| 40 | 332 ms | 345 ms | 96.4 ms | 6.6 MiB | 3 |
| 80 | 671 ms | 671 ms | 177 ms | 11.9 MiB | 1 |
| 160 | 1.32 s | 1.33 s | 346 ms | 23.0 MiB | 1 |
| 320 | 2.57 s | 2.64 s | 650 ms | 46.8 MiB | 0 |
| 640 | 4.74 s | 5.08 s | 1.17 s | 50.7 MiB | 0 |
| 1280 | 9.52 s | 9.75 s | 2.34 s | 14.6 MiB | 0 |
| 2560 | 18.9 s | 19.0 s | 4.63 s | 7.2 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 534 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 540 ms | 540 ms | 101% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 16.5 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 16.7 s | 16.7 s | 102% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-06T21:00:37.654Z` → `2026-10-06T21:09:00.737Z` (503 s), ci: CI (run 37530693420)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `0e51d582a5907ff18ce2808aa638415dd4cc43ce` on `dependabot/npm_and_yarn/shell-quote-1.11.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **55.0 ms** per operation compared with a bare-minimum baseline (**7.0%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 55.0 ms | 2.93 s |
| Added latency, relative to baseline | 7.0% | 12% |
| Added CPU time per operation | 61.0 ms | 3.71 s |
| Added memory per operation (heap delta) | 10.8 MiB | 15.9 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$10 – $100 |
| Single-core throughput ceiling of the overhead alone | 18 ops/s | 0 ops/s |

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
| 20 | 233 ms | 227 ms | 0 | 0.0% | 15.5 ms | $0 – $0.174 |
| 40 | 395 ms | 439 ms | 44.8 ms | 11% | 34.0 ms | $0.093 – $0.383 |
| 80 | 787 ms | 842 ms | 55.0 ms | 7.0% | 61.0 ms | $0.115 – $0.686 |
| 160 | 1.74 s | 1.62 s | 0 | 0.0% | 129 ms | $0 – $1.45 |
| 320 | 3.16 s | 3.22 s | 63.4 ms | 2.0% | 236 ms | $0.132 – $2.65 |
| 640 | 6.32 s | 6.37 s | 57.8 ms | 0.9% | 550 ms | $0.120 – $6.18 |
| 1280 | 12.3 s | 13.1 s | 736 ms | 6.0% | 1.49 s | $1.53 – $16.81 |
| 2560 | 24.9 s | 27.8 s | 2.93 s | 12% | 3.71 s | $6.11 – $41.72 |

**How the total grows:** O(n) (linear), exponent 1.02 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | O(n) | O(n) | ✅ matches | 891 ms | 26.7 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | O(n) | O(n) | ✅ matches | 904 ms | 26.6 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | O(n) | O(n) | ✅ matches | 952 ms | 29.1 s |

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
| 20 | 235 ms | 235 ms | 83.5 ms | 3.3 MiB | 4 |
| 40 | 457 ms | 463 ms | 149 ms | 6.5 MiB | 2 |
| 80 | 891 ms | 896 ms | 273 ms | 11.2 MiB | 1 |
| 160 | 1.75 s | 1.76 s | 540 ms | 22.4 MiB | 1 |
| 320 | 3.43 s | 3.44 s | 1.04 s | 44.8 MiB | 0 |
| 640 | 6.79 s | 6.89 s | 2.04 s | 44.1 MiB | 0 |
| 1280 | 13.5 s | 13.7 s | 4.09 s | 35.9 MiB | 0 |
| 2560 | 26.7 s | 27.4 s | 7.81 s | 48.5 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.97, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 266 ms | 268 ms | 74.9 ms | 3.3 MiB | 4 |
| 40 | 460 ms | 472 ms | 132 ms | 6.6 MiB | 2 |
| 80 | 904 ms | 906 ms | 271 ms | 11.4 MiB | 1 |
| 160 | 1.77 s | 1.78 s | 533 ms | 22.7 MiB | 1 |
| 320 | 3.44 s | 3.50 s | 1.02 s | 45.5 MiB | 0 |
| 640 | 6.72 s | 6.76 s | 2.00 s | 45.5 MiB | 0 |
| 1280 | 12.8 s | 13.4 s | 3.72 s | 39.0 MiB | 0 |
| 2560 | 26.6 s | 26.7 s | 7.87 s | 52.3 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 237 ms | 239 ms | 75.0 ms | 3.3 MiB | 4 |
| 40 | 467 ms | 489 ms | 127 ms | 6.6 MiB | 2 |
| 80 | 952 ms | 957 ms | 243 ms | 11.9 MiB | 1 |
| 160 | 1.88 s | 1.93 s | 474 ms | 23.0 MiB | 1 |
| 320 | 3.81 s | 3.83 s | 965 ms | 46.7 MiB | 0 |
| 640 | 7.78 s | 7.78 s | 1.96 s | 50.7 MiB | 0 |
| 1280 | 14.8 s | 15.1 s | 3.69 s | 13.2 MiB | 0 |
| 2560 | 29.1 s | 29.2 s | 6.90 s | 31.9 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 842 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 904 ms | 904 ms | 107% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 27.8 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 26.6 s | 26.6 s | 96% |
| _unattributed_ |  |  | 1.21 s | 4.3% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-06T01:17:13.774Z` → `2026-10-06T01:30:42.200Z` (808 s), ci: CI (run 37398342781)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `00c49e0f51aed0c48718e00aa50ad06ec040d37f` on `fix/v1-audit`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


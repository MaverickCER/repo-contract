# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **36.6 ms** per operation compared with a bare-minimum baseline (**5.2%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 36.6 ms | 807 ms |
| Added latency, relative to baseline | 5.2% | 3.6% |
| Added CPU time per operation | 39.8 ms | 2.18 s |
| Added memory per operation (heap delta) | 10.9 MiB | 39.0 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | 27 ops/s | 1 ops/s |

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
| 20 | 197 ms | 225 ms | 27.3 ms | 14% | 13.0 ms | $0.057 – $0.146 |
| 40 | 356 ms | 382 ms | 26.2 ms | 7.3% | 20.2 ms | $0.055 – $0.227 |
| 80 | 708 ms | 745 ms | 36.6 ms | 5.2% | 39.8 ms | $0.076 – $0.448 |
| 160 | 1.43 s | 1.47 s | 37.4 ms | 2.6% | 121 ms | $0.078 – $1.36 |
| 320 | 2.92 s | 2.90 s | 0 | 0.0% | 199 ms | $0 – $2.23 |
| 640 | 5.62 s | 5.81 s | 187 ms | 3.3% | 476 ms | $0.391 – $5.35 |
| 1280 | 11.3 s | 11.7 s | 317 ms | 2.8% | 1.14 s | $0.660 – $12.78 |
| 2560 | 22.5 s | 23.3 s | 807 ms | 3.6% | 2.18 s | $1.68 – $24.50 |

**How the total grows:** O(n) (linear), exponent 1.00 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | O(n) | O(n) | ✅ matches | 751 ms | 23.7 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | O(n) | O(n) | ✅ matches | 771 ms | 23.2 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | O(n) | O(n) | ✅ matches | 822 ms | 27.0 s |

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
| 20 | 194 ms | 195 ms | 58.7 ms | 3.3 MiB | 5 |
| 40 | 382 ms | 386 ms | 109 ms | 6.5 MiB | 3 |
| 80 | 751 ms | 755 ms | 212 ms | 11.2 MiB | 1 |
| 160 | 1.49 s | 1.52 s | 419 ms | 22.4 MiB | 1 |
| 320 | 2.97 s | 3.00 s | 831 ms | 44.8 MiB | 0 |
| 640 | 5.89 s | 5.90 s | 1.66 s | 44.0 MiB | 0 |
| 1280 | 11.7 s | 11.8 s | 3.32 s | 36.2 MiB | 0 |
| 2560 | 23.7 s | 23.8 s | 6.66 s | 46.1 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 234 ms | 237 ms | 63.6 ms | 3.3 MiB | 4 |
| 40 | 405 ms | 411 ms | 114 ms | 6.6 MiB | 2 |
| 80 | 771 ms | 779 ms | 220 ms | 11.4 MiB | 1 |
| 160 | 1.51 s | 1.55 s | 437 ms | 22.8 MiB | 1 |
| 320 | 3.00 s | 3.05 s | 862 ms | 45.5 MiB | 0 |
| 640 | 5.98 s | 6.00 s | 1.71 s | 45.3 MiB | 0 |
| 1280 | 11.8 s | 11.8 s | 3.33 s | 39.0 MiB | 0 |
| 2560 | 23.2 s | 23.6 s | 6.45 s | 44.6 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.01, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 208 ms | 210 ms | 63.0 ms | 3.3 MiB | 5 |
| 40 | 411 ms | 414 ms | 107 ms | 6.6 MiB | 2 |
| 80 | 822 ms | 841 ms | 198 ms | 11.7 MiB | 1 |
| 160 | 1.63 s | 1.64 s | 387 ms | 23.0 MiB | 1 |
| 320 | 3.24 s | 3.29 s | 769 ms | 46.8 MiB | 0 |
| 640 | 6.55 s | 6.56 s | 1.53 s | 50.8 MiB | 0 |
| 1280 | 13.1 s | 13.2 s | 3.09 s | 13.1 MiB | 0 |
| 2560 | 27.0 s | 27.0 s | 6.43 s | 34.1 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 745 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 771 ms | 771 ms | 104% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 23.3 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 23.2 s | 23.2 s | 100% |
| _unattributed_ |  |  | 36.5 ms | 0.2% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-11T10:47:34.365Z` → `2026-10-11T10:59:30.749Z` (716 s), ci: CI (run 38133169542)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `8d43d7d6309390ceaded10213ffea0d238092ecd` on `docs/accuracy-stage-1a`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


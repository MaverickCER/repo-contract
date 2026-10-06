# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **18.2 ms** per operation compared with a bare-minimum baseline (**2.6%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 18.2 ms | 1.09 s |
| Added latency, relative to baseline | 2.6% | 4.9% |
| Added CPU time per operation | 34.5 ms | 2.30 s |
| Added memory per operation (heap delta) | 10.9 MiB | 24.2 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | 55 ops/s | 1 ops/s |

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
| 20 | 188 ms | 210 ms | 22.4 ms | 12% | 14.1 ms | $0.047 – $0.159 |
| 40 | 371 ms | 383 ms | 12.8 ms | 3.4% | 21.0 ms | $0.027 – $0.236 |
| 80 | 704 ms | 723 ms | 18.2 ms | 2.6% | 34.5 ms | $0.038 – $0.388 |
| 160 | 1.38 s | 1.43 s | 48.9 ms | 3.5% | 91.1 ms | $0.102 – $1.02 |
| 320 | 2.82 s | 2.83 s | 6.03 ms | 0.2% | 195 ms | $0.013 – $2.19 |
| 640 | 5.49 s | 5.65 s | 156 ms | 2.8% | 447 ms | $0.326 – $5.02 |
| 1280 | 11.0 s | 11.4 s | 357 ms | 3.2% | 1.12 s | $0.744 – $12.60 |
| 2560 | 21.9 s | 23.0 s | 1.09 s | 4.9% | 2.30 s | $2.26 – $25.88 |

**How the total grows:** O(n) (linear), exponent 1.00 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | O(n) | O(n) | ✅ matches | 729 ms | 22.7 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | O(n) | O(n) | ✅ matches | 742 ms | 22.7 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | O(n) | O(n) | ✅ matches | 802 ms | 25.9 s |

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
| 20 | 187 ms | 188 ms | 58.8 ms | 3.3 MiB | 5 |
| 40 | 370 ms | 373 ms | 113 ms | 6.5 MiB | 3 |
| 80 | 729 ms | 729 ms | 209 ms | 11.2 MiB | 1 |
| 160 | 1.45 s | 1.47 s | 414 ms | 22.4 MiB | 1 |
| 320 | 2.91 s | 2.94 s | 828 ms | 44.8 MiB | 0 |
| 640 | 5.78 s | 5.78 s | 1.64 s | 44.1 MiB | 0 |
| 1280 | 11.7 s | 11.7 s | 3.39 s | 36.1 MiB | 0 |
| 2560 | 22.7 s | 22.9 s | 6.26 s | 48.1 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 215 ms | 220 ms | 57.2 ms | 3.3 MiB | 5 |
| 40 | 389 ms | 391 ms | 108 ms | 6.6 MiB | 3 |
| 80 | 742 ms | 748 ms | 203 ms | 11.4 MiB | 1 |
| 160 | 1.45 s | 1.45 s | 403 ms | 22.8 MiB | 1 |
| 320 | 2.86 s | 2.87 s | 800 ms | 45.6 MiB | 0 |
| 640 | 5.71 s | 5.84 s | 1.58 s | 45.6 MiB | 0 |
| 1280 | 11.5 s | 11.5 s | 3.26 s | 39.1 MiB | 0 |
| 2560 | 22.7 s | 22.8 s | 6.26 s | 15.4 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 209 ms | 210 ms | 57.6 ms | 3.3 MiB | 5 |
| 40 | 404 ms | 405 ms | 108 ms | 6.6 MiB | 2 |
| 80 | 802 ms | 805 ms | 196 ms | 11.7 MiB | 1 |
| 160 | 1.61 s | 1.61 s | 387 ms | 23.0 MiB | 1 |
| 320 | 3.22 s | 3.25 s | 764 ms | 46.8 MiB | 0 |
| 640 | 6.46 s | 6.47 s | 1.53 s | 50.8 MiB | 0 |
| 1280 | 12.9 s | 12.9 s | 3.05 s | 13.2 MiB | 0 |
| 2560 | 25.9 s | 26.0 s | 6.02 s | 68.8 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 723 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 742 ms | 742 ms | 103% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 23.0 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 22.7 s | 22.7 s | 98% |
| _unattributed_ |  |  | 369 ms | 1.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-06T21:52:02.656Z` → `2026-10-06T22:03:40.761Z` (698 s), ci: CI (run 37536792493)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15994 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `a6dae09d65cda4550cd2581164e7a0c9b1f6a780` on `chore/update-non-ts-deps`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


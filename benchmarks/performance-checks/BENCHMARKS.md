# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **28.8 ms** per operation compared with a bare-minimum baseline (**4.0%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 28.8 ms | 737 ms |
| Added latency, relative to baseline | 4.0% | 3.2% |
| Added CPU time per operation | 37.7 ms | 2.27 s |
| Added memory per operation (heap delta) | 10.8 MiB | 4.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | 35 ops/s | 1 ops/s |

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
| 20 | 202 ms | 221 ms | 18.7 ms | 9.3% | 12.0 ms | $0.039 – $0.135 |
| 40 | 368 ms | 394 ms | 25.8 ms | 7.0% | 21.3 ms | $0.054 – $0.239 |
| 80 | 717 ms | 746 ms | 28.8 ms | 4.0% | 37.7 ms | $0.060 – $0.424 |
| 160 | 1.45 s | 1.47 s | 20.4 ms | 1.4% | 99.9 ms | $0.042 – $1.12 |
| 320 | 2.94 s | 2.94 s | 5.35 ms | 0.2% | 232 ms | $0.011 – $2.61 |
| 640 | 5.67 s | 5.86 s | 188 ms | 3.3% | 491 ms | $0.392 – $5.52 |
| 1280 | 11.3 s | 11.8 s | 442 ms | 3.9% | 1.26 s | $0.920 – $14.17 |
| 2560 | 22.9 s | 23.6 s | 737 ms | 3.2% | 2.27 s | $1.54 – $25.48 |

**How the total grows:** O(n) (linear), exponent 1.00 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | O(n) | O(n) | ✅ matches | 743 ms | 23.5 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | O(n) | O(n) | ✅ matches | 761 ms | 23.4 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | O(n) | O(n) | ✅ matches | 833 ms | 26.8 s |

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
| 20 | 189 ms | 201 ms | 61.1 ms | 2.8 MiB | 5 |
| 40 | 386 ms | 387 ms | 113 ms | 6.5 MiB | 3 |
| 80 | 743 ms | 756 ms | 209 ms | 11.2 MiB | 1 |
| 160 | 1.49 s | 1.50 s | 437 ms | 22.5 MiB | 1 |
| 320 | 2.95 s | 2.95 s | 840 ms | 44.7 MiB | 0 |
| 640 | 5.83 s | 5.88 s | 1.66 s | 44.0 MiB | 0 |
| 1280 | 11.7 s | 11.7 s | 3.34 s | 36.3 MiB | 0 |
| 2560 | 23.5 s | 23.7 s | 6.61 s | 48.7 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 230 ms | 246 ms | 62.3 ms | 3.3 MiB | 4 |
| 40 | 402 ms | 415 ms | 116 ms | 6.6 MiB | 2 |
| 80 | 761 ms | 762 ms | 213 ms | 11.4 MiB | 1 |
| 160 | 1.51 s | 1.51 s | 432 ms | 22.8 MiB | 1 |
| 320 | 2.99 s | 2.99 s | 864 ms | 45.6 MiB | 0 |
| 640 | 5.88 s | 5.91 s | 1.67 s | 45.5 MiB | 0 |
| 1280 | 11.7 s | 11.8 s | 3.33 s | 39.2 MiB | 0 |
| 2560 | 23.4 s | 23.5 s | 6.62 s | 52.7 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 212 ms | 214 ms | 67.9 ms | 3.3 MiB | 5 |
| 40 | 427 ms | 433 ms | 118 ms | 6.6 MiB | 2 |
| 80 | 833 ms | 851 ms | 215 ms | 11.9 MiB | 1 |
| 160 | 1.67 s | 1.69 s | 413 ms | 23.1 MiB | 1 |
| 320 | 3.34 s | 3.35 s | 803 ms | 46.8 MiB | 0 |
| 640 | 6.70 s | 6.70 s | 1.60 s | 50.9 MiB | 0 |
| 1280 | 13.4 s | 13.5 s | 3.23 s | 13.3 MiB | 0 |
| 2560 | 26.8 s | 26.8 s | 6.38 s | 71.0 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 746 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 761 ms | 761 ms | 102% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 23.6 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 23.4 s | 23.4 s | 99% |
| _unattributed_ |  |  | 243 ms | 1.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-09T18:31:26.815Z` → `2026-10-09T18:43:26.360Z` (720 s), ci: CI (run 37973820326)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `480224ed5db4992705b22a1ac333d06fcf8fcc8e` on `fix/verify-builds-the-generated-docs`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


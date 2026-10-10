# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **0** per operation compared with a bare-minimum baseline (**0.0%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.04). At list prices that is on the order of **~$0 – $0.1 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 0 | 1.76 s |
| Added latency, relative to baseline | 0.0% | 11% |
| Added CPU time per operation | 17.9 ms | 2.25 s |
| Added memory per operation (heap delta) | 11.0 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0 – $0.1 | ~$10 |
| Single-core throughput ceiling of the overhead alone | ∞ ops/s | 1 ops/s |

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
| 20 | 153 ms | 164 ms | 10.9 ms | 7.1% | 12.1 ms | $0.023 – $0.136 |
| 40 | 329 ms | 290 ms | 0 | 0.0% | 18.7 ms | $0 – $0.211 |
| 80 | 605 ms | 519 ms | 0 | 0.0% | 17.9 ms | $0 – $0.201 |
| 160 | 1.08 s | 1.07 s | 0 | 0.0% | 85.8 ms | $0 – $0.964 |
| 320 | 2.00 s | 2.05 s | 49.9 ms | 2.5% | 146 ms | $0.104 – $1.64 |
| 640 | 4.01 s | 4.26 s | 250 ms | 6.2% | 450 ms | $0.520 – $5.06 |
| 1280 | 8.76 s | 9.10 s | 348 ms | 4.0% | 1.10 s | $0.725 – $12.41 |
| 2560 | 16.7 s | 18.4 s | 1.76 s | 11% | 2.25 s | $3.68 – $25.30 |

**How the total grows:** O(n) (linear), exponent 1.04 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | O(n) | O(n) | ✅ matches | 579 ms | 17.3 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | O(n) | O(n) | ✅ matches | 576 ms | 17.1 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | O(n) | O(n) | ✅ matches | 612 ms | 20.5 s |

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

**Measured: O(n)** (exponent 0.97, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 164 ms | 194 ms | 48.8 ms | 3.3 MiB | 6 |
| 40 | 291 ms | 295 ms | 96.5 ms | 6.5 MiB | 3 |
| 80 | 579 ms | 582 ms | 181 ms | 11.2 MiB | 2 |
| 160 | 1.17 s | 1.17 s | 369 ms | 22.4 MiB | 1 |
| 320 | 2.42 s | 2.50 s | 775 ms | 44.8 MiB | 0 |
| 640 | 4.58 s | 4.70 s | 1.43 s | 44.1 MiB | 0 |
| 1280 | 8.89 s | 9.31 s | 2.72 s | 35.8 MiB | 0 |
| 2560 | 17.3 s | 18.2 s | 4.88 s | 48.7 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.97, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 176 ms | 178 ms | 48.5 ms | 3.3 MiB | 6 |
| 40 | 310 ms | 314 ms | 90.8 ms | 6.6 MiB | 3 |
| 80 | 576 ms | 592 ms | 172 ms | 11.4 MiB | 2 |
| 160 | 1.16 s | 1.18 s | 351 ms | 22.8 MiB | 1 |
| 320 | 2.26 s | 2.30 s | 678 ms | 45.6 MiB | 0 |
| 640 | 4.45 s | 4.51 s | 1.30 s | 45.4 MiB | 0 |
| 1280 | 8.72 s | 8.82 s | 2.54 s | 38.9 MiB | 0 |
| 2560 | 17.1 s | 17.3 s | 4.84 s | 29.7 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.02, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 158 ms | 162 ms | 46.4 ms | 3.3 MiB | 6 |
| 40 | 304 ms | 312 ms | 83.7 ms | 6.6 MiB | 3 |
| 80 | 612 ms | 646 ms | 157 ms | 11.7 MiB | 2 |
| 160 | 1.21 s | 1.23 s | 303 ms | 23.0 MiB | 1 |
| 320 | 2.52 s | 2.53 s | 626 ms | 46.8 MiB | 0 |
| 640 | 5.06 s | 5.08 s | 1.26 s | 50.7 MiB | 0 |
| 1280 | 10.1 s | 10.2 s | 2.52 s | 12.9 MiB | 0 |
| 2560 | 20.5 s | 20.6 s | 5.10 s | 8.5 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 519 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 576 ms | 576 ms | 111% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 18.4 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 17.1 s | 17.1 s | 93% |
| _unattributed_ |  |  | 1.29 s | 7.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-10T22:36:01.372Z` → `2026-10-10T22:45:04.569Z` (543 s), ci: CI (run 38092012203)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `da80093aebf458f036d338ee7a9815294d601337` on `docs/accuracy-stage-1a`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


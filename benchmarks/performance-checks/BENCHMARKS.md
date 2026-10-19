# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **0** per operation compared with a bare-minimum baseline (**0.0%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0 – $1 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 0 | 0 |
| Added latency, relative to baseline | 0.0% | 0.0% |
| Added CPU time per operation | 29.9 ms | 1.49 s |
| Added memory per operation (heap delta) | 10.9 MiB | 4.5 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0 – $1 | ~$0 – $10 |
| Single-core throughput ceiling of the overhead alone | ∞ ops/s | ∞ ops/s |

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
| 20 | 149 ms | 159 ms | 9.81 ms | 6.6% | 12.8 ms | $0.020 – $0.144 |
| 40 | 283 ms | 288 ms | 4.19 ms | 1.5% | 22.1 ms | $0.0087 – $0.248 |
| 80 | 543 ms | 526 ms | 0 | 0.0% | 29.9 ms | $0 – $0.336 |
| 160 | 1.08 s | 1.07 s | 0 | 0.0% | 85.0 ms | $0 – $0.956 |
| 320 | 2.18 s | 2.17 s | 0 | 0.0% | 166 ms | $0 – $1.86 |
| 640 | 4.27 s | 4.27 s | 0 | 0.0% | 388 ms | $0 – $4.37 |
| 1280 | 8.44 s | 8.45 s | 15.2 ms | 0.2% | 857 ms | $0.032 – $9.64 |
| 2560 | 17.2 s | 17.1 s | 0 | 0.0% | 1.49 s | $0 – $16.71 |

**How the total grows:** O(n) (linear), exponent 1.00 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | O(n) | O(n) | ✅ matches | 517 ms | 16.9 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | O(n) | O(n) | ✅ matches | 527 ms | 16.6 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | O(n) | O(n) | ✅ matches | 576 ms | 18.5 s |

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
| 20 | 142 ms | 149 ms | 45.0 ms | 2.8 MiB | 7 |
| 40 | 272 ms | 284 ms | 81.2 ms | 6.5 MiB | 4 |
| 80 | 517 ms | 521 ms | 152 ms | 11.3 MiB | 2 |
| 160 | 1.08 s | 1.10 s | 319 ms | 22.5 MiB | 1 |
| 320 | 2.15 s | 2.17 s | 632 ms | 44.9 MiB | 0 |
| 640 | 4.35 s | 4.67 s | 1.28 s | 44.1 MiB | 0 |
| 1280 | 8.21 s | 8.91 s | 2.36 s | 36.2 MiB | 0 |
| 2560 | 16.9 s | 17.0 s | 4.73 s | 8.6 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 167 ms | 172 ms | 47.5 ms | 3.3 MiB | 6 |
| 40 | 280 ms | 285 ms | 83.6 ms | 6.6 MiB | 4 |
| 80 | 527 ms | 530 ms | 150 ms | 11.4 MiB | 2 |
| 160 | 1.03 s | 1.07 s | 292 ms | 22.8 MiB | 1 |
| 320 | 2.06 s | 2.10 s | 605 ms | 45.6 MiB | 0 |
| 640 | 4.24 s | 4.30 s | 1.21 s | 45.6 MiB | 0 |
| 1280 | 8.21 s | 8.30 s | 2.35 s | 39.4 MiB | 0 |
| 2560 | 16.6 s | 16.7 s | 4.67 s | 20.0 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 152 ms | 157 ms | 48.8 ms | 3.3 MiB | 7 |
| 40 | 299 ms | 304 ms | 82.4 ms | 6.6 MiB | 3 |
| 80 | 576 ms | 585 ms | 149 ms | 11.7 MiB | 2 |
| 160 | 1.19 s | 1.20 s | 294 ms | 23.1 MiB | 1 |
| 320 | 2.39 s | 2.43 s | 579 ms | 46.9 MiB | 0 |
| 640 | 4.71 s | 4.71 s | 1.13 s | 51.0 MiB | 0 |
| 1280 | 9.27 s | 9.58 s | 2.22 s | 14.8 MiB | 0 |
| 2560 | 18.5 s | 19.0 s | 4.34 s | 55.4 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 526 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 527 ms | 527 ms | 100% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 17.1 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 16.6 s | 16.6 s | 97% |
| _unattributed_ |  |  | 429 ms | 2.5% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-19T09:28:29.400Z` → `2026-10-19T09:37:07.311Z` (518 s), ci: CI (run 39230286789)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `8e978cf85f2c5d03fc8593966399f0df396af203` on `dependabot/npm_and_yarn/dev-dependencies-f33c6aedb8`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


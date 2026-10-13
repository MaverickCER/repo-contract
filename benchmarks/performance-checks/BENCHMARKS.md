# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **0** per operation compared with a bare-minimum baseline (**0.0%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0 – $0.1 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 0 | 1.55 s |
| Added latency, relative to baseline | 0.0% | 10% |
| Added CPU time per operation | 17.0 ms | 1.80 s |
| Added memory per operation (heap delta) | 11.2 MiB | 3.2 MiB |
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
| 20 | 140 ms | 154 ms | 13.6 ms | 9.7% | 9.87 ms | $0.028 – $0.111 |
| 40 | 267 ms | 266 ms | 0 | 0.0% | 15.2 ms | $0 – $0.171 |
| 80 | 515 ms | 496 ms | 0 | 0.0% | 17.0 ms | $0 – $0.191 |
| 160 | 991 ms | 1.02 s | 29.9 ms | 3.0% | 69.5 ms | $0.062 – $0.782 |
| 320 | 1.94 s | 2.00 s | 58.4 ms | 3.0% | 147 ms | $0.122 – $1.65 |
| 640 | 3.84 s | 4.04 s | 206 ms | 5.4% | 359 ms | $0.429 – $4.03 |
| 1280 | 7.66 s | 8.53 s | 870 ms | 11% | 1.05 s | $1.81 – $11.84 |
| 2560 | 15.5 s | 17.0 s | 1.55 s | 10% | 1.80 s | $3.24 – $20.25 |

**How the total grows:** O(n) (linear), exponent 1.02 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | O(n) | O(n) | ✅ matches | 532 ms | 17.4 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | O(n) | O(n) | ✅ matches | 609 ms | 16.6 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | O(n) | O(n) | ✅ matches | 570 ms | 19.1 s |

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

**Measured: O(n)** (exponent 1.01, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 136 ms | 140 ms | 43.3 ms | 3.3 MiB | 7 |
| 40 | 265 ms | 270 ms | 81.0 ms | 6.5 MiB | 4 |
| 80 | 532 ms | 597 ms | 154 ms | 11.2 MiB | 2 |
| 160 | 1.05 s | 1.11 s | 297 ms | 22.5 MiB | 1 |
| 320 | 2.09 s | 2.12 s | 594 ms | 44.9 MiB | 0 |
| 640 | 4.23 s | 4.33 s | 1.19 s | 44.2 MiB | 0 |
| 1280 | 8.53 s | 8.81 s | 2.42 s | 36.1 MiB | 0 |
| 2560 | 17.4 s | 18.9 s | 4.99 s | 31.9 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.95, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 184 ms | 188 ms | 53.2 ms | 3.3 MiB | 5 |
| 40 | 317 ms | 328 ms | 94.0 ms | 6.6 MiB | 3 |
| 80 | 609 ms | 615 ms | 183 ms | 11.4 MiB | 2 |
| 160 | 1.21 s | 1.24 s | 369 ms | 22.8 MiB | 1 |
| 320 | 2.42 s | 2.46 s | 741 ms | 45.6 MiB | 0 |
| 640 | 4.77 s | 4.81 s | 1.48 s | 45.6 MiB | 0 |
| 1280 | 9.37 s | 9.49 s | 2.89 s | 39.0 MiB | 0 |
| 2560 | 16.6 s | 17.4 s | 4.65 s | 46.4 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 147 ms | 150 ms | 43.6 ms | 3.3 MiB | 7 |
| 40 | 279 ms | 280 ms | 77.9 ms | 6.6 MiB | 4 |
| 80 | 570 ms | 577 ms | 143 ms | 11.7 MiB | 2 |
| 160 | 1.18 s | 1.19 s | 291 ms | 23.1 MiB | 1 |
| 320 | 2.35 s | 2.36 s | 550 ms | 46.8 MiB | 0 |
| 640 | 4.76 s | 5.07 s | 1.16 s | 51.0 MiB | 0 |
| 1280 | 9.34 s | 9.40 s | 2.26 s | 14.6 MiB | 0 |
| 2560 | 19.1 s | 19.5 s | 4.57 s | 35.4 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 496 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 609 ms | 609 ms | 123% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 17.0 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 16.6 s | 16.6 s | 97% |
| _unattributed_ |  |  | 445 ms | 2.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-13T03:11:54.356Z` → `2026-10-13T03:20:32.917Z` (519 s), ci: CI (run 38340527682)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `f6033f91f20c59a3afc96e2bc460cbf2d8c7adaf` on `dependabot/npm_and_yarn/internal-package-contract-v0.10.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


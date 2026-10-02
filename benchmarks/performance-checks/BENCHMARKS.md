# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **19.4 ms** per operation compared with a bare-minimum baseline (3.0%), about **$0.040 – $0.322 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 0.97).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 19.4 ms | 487 ms |
| Added latency, relative to baseline | 3.0% | 2.4% |
| Added CPU time per operation | 28.6 ms | 1.51 s |
| Added memory per operation (heap delta) | 10.9 MiB | 44.6 MiB |
| Estimated compute cost per 1M operations | $0.040 – $0.322 | $1.01 – $16.93 |
| Single-core throughput ceiling of the overhead alone | 52 ops/s | 2 ops/s |

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
| 20 | 184 ms | 200 ms | 15.6 ms | 8.5% | 13.6 ms | $0.032 – $0.153 |
| 40 | 324 ms | 354 ms | 29.4 ms | 9.1% | 19.5 ms | $0.061 – $0.220 |
| 80 | 649 ms | 669 ms | 19.4 ms | 3.0% | 28.6 ms | $0.040 – $0.322 |
| 160 | 1.27 s | 1.32 s | 50.9 ms | 4.0% | 77.0 ms | $0.106 – $0.865 |
| 320 | 2.54 s | 2.60 s | 64.5 ms | 2.5% | 166 ms | $0.134 – $1.86 |
| 640 | 5.07 s | 5.29 s | 219 ms | 4.3% | 359 ms | $0.455 – $4.03 |
| 1280 | 10.1 s | 10.4 s | 355 ms | 3.5% | 859 ms | $0.740 – $9.66 |
| 2560 | 20.1 s | 20.6 s | 487 ms | 2.4% | 1.51 s | $1.01 – $16.93 |

**How the total grows:** O(n) (linear), exponent 0.97 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | O(n) | O(n) | ✅ matches | 656 ms | 20.6 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | O(n) | O(n) | ✅ matches | 675 ms | 20.7 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | O(n) | O(n) | ✅ matches | 752 ms | 24.0 s |

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
| 20 | 169 ms | 172 ms | 47.3 ms | 3.3 MiB | 6 |
| 40 | 326 ms | 332 ms | 84.9 ms | 6.5 MiB | 3 |
| 80 | 656 ms | 659 ms | 159 ms | 11.2 MiB | 2 |
| 160 | 1.30 s | 1.30 s | 306 ms | 22.4 MiB | 1 |
| 320 | 2.56 s | 2.58 s | 602 ms | 44.8 MiB | 0 |
| 640 | 5.13 s | 5.17 s | 1.20 s | 44.1 MiB | 0 |
| 1280 | 10.2 s | 10.3 s | 2.41 s | 36.4 MiB | 0 |
| 2560 | 20.6 s | 20.6 s | 4.75 s | 48.7 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.96, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 206 ms | 208 ms | 49.3 ms | 3.3 MiB | 5 |
| 40 | 357 ms | 360 ms | 85.9 ms | 6.6 MiB | 3 |
| 80 | 675 ms | 677 ms | 159 ms | 11.4 MiB | 1 |
| 160 | 1.34 s | 1.34 s | 310 ms | 22.8 MiB | 1 |
| 320 | 2.64 s | 2.64 s | 614 ms | 45.6 MiB | 0 |
| 640 | 5.28 s | 5.30 s | 1.23 s | 45.6 MiB | 0 |
| 1280 | 10.5 s | 10.5 s | 2.47 s | 39.2 MiB | 0 |
| 2560 | 20.7 s | 20.8 s | 4.81 s | 45.2 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 184 ms | 190 ms | 50.2 ms | 3.3 MiB | 5 |
| 40 | 374 ms | 376 ms | 85.5 ms | 6.6 MiB | 3 |
| 80 | 752 ms | 762 ms | 156 ms | 11.7 MiB | 1 |
| 160 | 1.50 s | 1.52 s | 309 ms | 23.0 MiB | 1 |
| 320 | 2.98 s | 3.01 s | 601 ms | 46.8 MiB | 0 |
| 640 | 5.98 s | 5.99 s | 1.19 s | 50.8 MiB | 0 |
| 1280 | 12.1 s | 12.1 s | 2.40 s | 14.7 MiB | 0 |
| 2560 | 24.0 s | 24.0 s | 4.63 s | 34.8 MiB | 0 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 80 checks** (total added: 19.4 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 675 ms | 36× baseline | 101% |
| _unattributed_ |  | 0 | 0.0% |  |

**At 2560 checks** (total added: 487 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 20.7 s | 44× baseline | 101% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-02T00:20:07.209Z` → `2026-10-02T00:30:44.779Z` (638 s), ci
- Machine: INTEL(R) XEON(R) PLATINUM 8573C, 4 logical core(s) (2 physical), 15989 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `2000ec3e4768c623f615e1355648547539b48b4b` on `feat/shared-benchmark-kit-migration`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


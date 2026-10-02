# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **25.7 ms** per operation compared with a bare-minimum baseline (3.6%), about **$0.053 – $0.440 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 0.97).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 25.7 ms | 878 ms |
| Added latency, relative to baseline | 3.6% | 4.0% |
| Added CPU time per operation | 39.1 ms | 2.19 s |
| Added memory per operation (heap delta) | 10.9 MiB | 45.5 MiB |
| Estimated compute cost per 1M operations | $0.053 – $0.440 | $1.83 – $24.59 |
| Single-core throughput ceiling of the overhead alone | 39 ops/s | 1 ops/s |

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
| 20 | 185 ms | 221 ms | 35.6 ms | 19% | 16.1 ms | $0.074 – $0.181 |
| 40 | 360 ms | 386 ms | 25.9 ms | 7.2% | 22.6 ms | $0.054 – $0.254 |
| 80 | 710 ms | 735 ms | 25.7 ms | 3.6% | 39.1 ms | $0.053 – $0.440 |
| 160 | 1.40 s | 1.45 s | 52.6 ms | 3.8% | 98.1 ms | $0.110 – $1.10 |
| 320 | 2.76 s | 2.86 s | 98.6 ms | 3.6% | 197 ms | $0.205 – $2.21 |
| 640 | 5.55 s | 5.74 s | 187 ms | 3.4% | 441 ms | $0.390 – $4.96 |
| 1280 | 11.1 s | 11.5 s | 431 ms | 3.9% | 1.15 s | $0.898 – $12.94 |
| 2560 | 22.1 s | 23.0 s | 878 ms | 4.0% | 2.19 s | $1.83 – $24.59 |

**How the total grows:** O(n) (linear), exponent 0.97 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | O(n) | O(n) | ✅ matches | 731 ms | 23.0 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | O(n) | O(n) | ✅ matches | 742 ms | 22.9 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | O(n) | O(n) | ✅ matches | 801 ms | 26.0 s |

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
| 20 | 188 ms | 192 ms | 54.0 ms | 2.8 MiB | 5 |
| 40 | 371 ms | 372 ms | 107 ms | 6.5 MiB | 3 |
| 80 | 731 ms | 733 ms | 207 ms | 11.2 MiB | 1 |
| 160 | 1.45 s | 1.46 s | 399 ms | 22.4 MiB | 1 |
| 320 | 2.89 s | 2.90 s | 796 ms | 44.8 MiB | 0 |
| 640 | 5.76 s | 5.76 s | 1.58 s | 44.0 MiB | 0 |
| 1280 | 11.5 s | 11.6 s | 3.16 s | 36.0 MiB | 0 |
| 2560 | 23.0 s | 23.0 s | 6.15 s | 45.7 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.96, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 221 ms | 224 ms | 59.1 ms | 3.3 MiB | 5 |
| 40 | 408 ms | 418 ms | 112 ms | 6.6 MiB | 2 |
| 80 | 742 ms | 742 ms | 204 ms | 11.4 MiB | 1 |
| 160 | 1.46 s | 1.49 s | 396 ms | 22.8 MiB | 1 |
| 320 | 2.90 s | 2.92 s | 791 ms | 45.4 MiB | 0 |
| 640 | 5.77 s | 5.83 s | 1.55 s | 45.3 MiB | 0 |
| 1280 | 11.5 s | 11.5 s | 3.16 s | 39.2 MiB | 0 |
| 2560 | 22.9 s | 22.9 s | 6.21 s | 15.5 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 203 ms | 207 ms | 62.0 ms | 3.3 MiB | 5 |
| 40 | 417 ms | 422 ms | 109 ms | 6.6 MiB | 2 |
| 80 | 801 ms | 815 ms | 196 ms | 11.8 MiB | 1 |
| 160 | 1.62 s | 1.62 s | 390 ms | 23.0 MiB | 1 |
| 320 | 3.24 s | 3.27 s | 766 ms | 46.7 MiB | 0 |
| 640 | 6.51 s | 6.51 s | 1.53 s | 50.7 MiB | 0 |
| 1280 | 13.0 s | 13.1 s | 3.06 s | 13.1 MiB | 0 |
| 2560 | 26.0 s | 26.1 s | 6.09 s | 73.1 MiB | 0 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 80 checks** (total added: 25.7 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 742 ms | 30× baseline | 101% |
| _unattributed_ |  | 0 | 0.0% |  |

**At 2560 checks** (total added: 878 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 22.9 s | 27× baseline | 100% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-02T16:08:16.371Z` → `2026-10-02T16:19:58.523Z` (702 s), ci
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15994 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `c74e9f4ff4a8a8dc2c0e55606a20f2ffaaf1a44c` on `chore/repin-ipc-0.7.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


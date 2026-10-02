# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **36.8 ms** per operation compared with a bare-minimum baseline (5.0%), about **$0.077 – $0.420 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 0.97).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 36.8 ms | 819 ms |
| Added latency, relative to baseline | 5.0% | 3.5% |
| Added CPU time per operation | 37.3 ms | 2.38 s |
| Added memory per operation (heap delta) | 10.9 MiB | 45.0 MiB |
| Estimated compute cost per 1M operations | $0.077 – $0.420 | $1.71 – $26.76 |
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
| 20 | 189 ms | 230 ms | 40.8 ms | 22% | 17.6 ms | $0.085 – $0.198 |
| 40 | 359 ms | 414 ms | 54.8 ms | 15% | 22.4 ms | $0.114 – $0.252 |
| 80 | 730 ms | 766 ms | 36.8 ms | 5.0% | 37.3 ms | $0.077 – $0.420 |
| 160 | 1.47 s | 1.52 s | 45.2 ms | 3.1% | 114 ms | $0.094 – $1.29 |
| 320 | 2.88 s | 3.01 s | 127 ms | 4.4% | 217 ms | $0.265 – $2.44 |
| 640 | 5.84 s | 5.97 s | 128 ms | 2.2% | 427 ms | $0.266 – $4.80 |
| 1280 | 11.6 s | 12.1 s | 504 ms | 4.4% | 1.32 s | $1.05 – $14.80 |
| 2560 | 23.3 s | 24.1 s | 819 ms | 3.5% | 2.38 s | $1.71 – $26.76 |

**How the total grows:** O(n) (linear), exponent 0.97 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | O(n) | O(n) | ✅ matches | 747 ms | 23.9 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | O(n) | O(n) | ✅ matches | 770 ms | 25.0 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | O(n) | O(n) | ✅ matches | 890 ms | 27.2 s |

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
| 20 | 195 ms | 196 ms | 58.7 ms | 2.8 MiB | 5 |
| 40 | 381 ms | 382 ms | 113 ms | 6.5 MiB | 3 |
| 80 | 747 ms | 757 ms | 210 ms | 11.2 MiB | 1 |
| 160 | 1.48 s | 1.50 s | 411 ms | 22.4 MiB | 1 |
| 320 | 2.97 s | 2.98 s | 817 ms | 44.8 MiB | 0 |
| 640 | 5.95 s | 5.98 s | 1.64 s | 44.2 MiB | 0 |
| 1280 | 12.2 s | 12.3 s | 3.47 s | 36.1 MiB | 0 |
| 2560 | 23.9 s | 23.9 s | 6.56 s | 53.7 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.97, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 230 ms | 234 ms | 59.3 ms | 3.3 MiB | 4 |
| 40 | 414 ms | 441 ms | 119 ms | 6.6 MiB | 2 |
| 80 | 770 ms | 773 ms | 216 ms | 11.4 MiB | 1 |
| 160 | 1.52 s | 1.54 s | 417 ms | 22.8 MiB | 1 |
| 320 | 2.98 s | 3.01 s | 837 ms | 45.6 MiB | 0 |
| 640 | 5.98 s | 6.03 s | 1.65 s | 45.4 MiB | 0 |
| 1280 | 12.2 s | 12.4 s | 3.48 s | 39.0 MiB | 0 |
| 2560 | 25.0 s | 25.0 s | 7.27 s | 52.7 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 227 ms | 235 ms | 69.8 ms | 3.3 MiB | 4 |
| 40 | 453 ms | 463 ms | 124 ms | 6.6 MiB | 2 |
| 80 | 890 ms | 895 ms | 229 ms | 11.9 MiB | 1 |
| 160 | 1.81 s | 1.82 s | 464 ms | 23.1 MiB | 1 |
| 320 | 3.60 s | 3.60 s | 883 ms | 46.8 MiB | 0 |
| 640 | 6.92 s | 7.07 s | 1.63 s | 50.7 MiB | 0 |
| 1280 | 13.7 s | 13.9 s | 3.26 s | 14.7 MiB | 0 |
| 2560 | 27.2 s | 27.3 s | 6.28 s | 33.6 MiB | 0 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 80 checks** (total added: 36.8 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 770 ms | 22× baseline | 100% |
| _unattributed_ |  | 0 | 0.0% |  |

**At 2560 checks** (total added: 819 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 25.0 s | 32× baseline | 104% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-02T04:50:23.250Z` → `2026-10-02T05:02:42.024Z` (739 s), ci
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `497835dd13fcdb0a77165f9285e84579d5c12948` on `dependabot/npm_and_yarn/js-yaml-4.3.2`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


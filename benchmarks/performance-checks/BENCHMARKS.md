# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **66.8 ms** per operation compared with a bare-minimum baseline (18%), about **$0.129 – $0.139 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 0.95).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 66.8 ms | 1.60 s |
| Added latency, relative to baseline | 18% | 12% |
| Added CPU time per operation | 11.5 ms | 678 ms |
| Added memory per operation (heap delta) | 6.2 MiB | 26.3 MiB |
| Estimated compute cost per 1M operations | $0.129 – $0.139 | $3.33 – $7.62 |
| Single-core throughput ceiling of the overhead alone | 15 ops/s | 1 ops/s |
| Shipped code parsed at every cold start (gzip) | 19.3 KiB | 19.3 KiB |

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
| 20 | 98.6 ms | 162 ms | 63.9 ms | 65% | 5.69 ms | $0.064 – $0.133 |
| 40 | 195 ms | 236 ms | 41.4 ms | 21% | 7.59 ms | $0.085 – $0.086 |
| 80 | 374 ms | 441 ms | 66.8 ms | 18% | 11.5 ms | $0.129 – $0.139 |
| 160 | 742 ms | 944 ms | 202 ms | 27% | 34.0 ms | $0.382 – $0.420 |
| 320 | 1.50 s | 1.80 s | 304 ms | 20% | 80.3 ms | $0.633 – $0.903 |
| 640 | 3.03 s | 3.55 s | 521 ms | 17% | 160 ms | $1.08 – $1.80 |
| 1280 | 6.51 s | 7.10 s | 584 ms | 9.0% | 392 ms | $1.22 – $4.41 |
| 2560 | 12.8 s | 14.4 s | 1.60 s | 12% | 678 ms | $3.33 – $7.62 |

**How the total grows:** O(n) (linear), exponent 0.95 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | O(n) | O(n) | ✅ matches | 463 ms | 13.4 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | O(n) | O(n) | ✅ matches | 434 ms | 13.5 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | O(n) | O(n) | ✅ matches | 633 ms | 15.9 s |

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
| 20 | 119 ms | 131 ms | 19.3 ms | 1.7 MiB | 8 |
| 40 | 230 ms | 242 ms | 34.7 ms | 4.0 MiB | 4 |
| 80 | 463 ms | 498 ms | 65.6 ms | 7.2 MiB | 2 |
| 160 | 890 ms | 917 ms | 134 ms | 13.8 MiB | 1 |
| 320 | 1.81 s | 1.92 s | 264 ms | 27.4 MiB | 1 |
| 640 | 3.63 s | 3.64 s | 532 ms | 12.0 MiB | 0 |
| 1280 | 7.12 s | 7.22 s | 1.08 s | 15.9 MiB | 0 |
| 2560 | 13.4 s | 13.5 s | 2.16 s | 41.0 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.94, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 158 ms | 159 ms | 14.3 ms | 2.1 MiB | 6 |
| 40 | 231 ms | 235 ms | 30.2 ms | 4.1 MiB | 4 |
| 80 | 434 ms | 503 ms | 65.0 ms | 7.1 MiB | 2 |
| 160 | 859 ms | 867 ms | 131 ms | 14.1 MiB | 1 |
| 320 | 1.74 s | 1.77 s | 282 ms | 28.2 MiB | 1 |
| 640 | 3.33 s | 3.35 s | 527 ms | 13.4 MiB | 0 |
| 1280 | 6.41 s | 6.46 s | 1.06 s | 18.7 MiB | 0 |
| 2560 | 13.5 s | 13.5 s | 2.10 s | 36.8 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 0.92, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 156 ms | 157 ms | 13.1 ms | 2.1 MiB | 6 |
| 40 | 406 ms | 410 ms | 28.8 ms | 4.1 MiB | 2 |
| 80 | 633 ms | 671 ms | 50.6 ms | 8.3 MiB | 2 |
| 160 | 1.04 s | 1.08 s | 106 ms | 14.4 MiB | 1 |
| 320 | 1.99 s | 2.01 s | 211 ms | 29.5 MiB | 1 |
| 640 | 3.98 s | 4.06 s | 422 ms | 18.3 MiB | 0 |
| 1280 | 7.91 s | 7.94 s | 835 ms | 49.9 MiB | 0 |
| 2560 | 15.9 s | 16.0 s | 1.73 s | 15.6 MiB | 0 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 80 checks** (total added: 66.8 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 434 ms | 650% | 98% |
| _unattributed_ |  | 0 | 0.0% |  |

**At 2560 checks** (total added: 1.60 s)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 13.5 s | 842% | 93% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-01T14:28:40.333Z` → `2026-10-01T14:35:40.389Z` (420 s), npm run benchmark
- Machine: Apple M3, 8 logical core(s) (8 physical), 24576 MB RAM, darwin/arm64, Node v24.20.0, local
- Git: `4ef058336f9a3755b92926f8d2bfaa07ef43fdae` on `feat/remove-minimatch-dist-no-urls` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


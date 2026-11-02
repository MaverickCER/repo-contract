# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **83.5 ms** per operation compared with a bare-minimum baseline (**16% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.97). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 83.5 ms | 934 ms |
| Added latency, relative to baseline | 16% | 5.5% |
| Added CPU time per operation | 52.6 ms | 1.83 s |
| Added memory per operation (heap delta) | 11.1 MiB | 24.5 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | 12 ops/s | 1 ops/s |

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
| 20 | 142 ms | 183 ms | 41.2 ms | 29% | 20.0 ms | $0.086 – $0.225 |
| 40 | 259 ms | 314 ms | 54.3 ms | 21% | 31.2 ms | $0.113 – $0.351 |
| 80 | 517 ms | 600 ms | 83.5 ms | 16% | 52.6 ms | $0.174 – $0.591 |
| 160 | 1.03 s | 1.20 s | 173 ms | 17% | 126 ms | $0.361 – $1.42 |
| 320 | 2.07 s | 2.31 s | 242 ms | 12% | 211 ms | $0.503 – $2.38 |
| 640 | 4.17 s | 4.76 s | 586 ms | 14% | 589 ms | $1.22 – $6.62 |
| 1280 | 8.61 s | 8.85 s | 236 ms | 2.7% | 882 ms | $0.491 – $9.92 |
| 2560 | 16.9 s | 17.9 s | 934 ms | 5.5% | 1.83 s | $1.95 – $20.60 |

**How the total grows:** O(n) (linear), exponent 0.97 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | check | O(n) | O(n) | ✅ matches | 589 ms | 17.7 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | check | O(n) | O(n) | ✅ matches | 638 ms | 20.0 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | check | O(n) | O(n) | ✅ matches | 672 ms | 21.9 s |
| `runChecks (scheduler and process orchestration)` (with-reporting-hook) | check | O(n) | O(n) | ✅ matches | 581 ms | 18.8 s |
| `runRepoContract` (plain) | check | O(n) | O(n) | ✅ matches | 649 ms | 1.21 s (at 160) |
| `runRepoContract` (plain) | concurrency | O(1) | n/a | ❔ not enough data | 616 ms (at 16) | 616 ms (at 16) |
| `runRepoContract` (with-hooks) | check | O(n) | O(n) | ✅ matches | 617 ms | 1.24 s (at 160) |
| `runRepoContract` (with-hooks) | concurrency | O(1) | n/a | ❔ not enough data | 621 ms (at 16) | 621 ms (at 16) |

> **Could not be determined.** The big-O of these could not be measured, so they are not checked against their documentation:
>
> - `run-repo-contract (plain)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.78, and a fit below 0.8 is not trusted; fitted exponent -0.35). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth
> - `run-repo-contract (with-hooks)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.79, and a fit below 0.8 is not trusted; fitted exponent -0.37). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth

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
| 20 | 148 ms | 152 ms | 49.7 ms | 2.8 MiB | 7 |
| 40 | 290 ms | 296 ms | 97.9 ms | 6.5 MiB | 3 |
| 80 | 589 ms | 599 ms | 201 ms | 11.2 MiB | 2 |
| 160 | 1.16 s | 1.21 s | 394 ms | 22.4 MiB | 1 |
| 320 | 2.28 s | 2.29 s | 728 ms | 44.9 MiB | 0 |
| 640 | 4.46 s | 4.49 s | 1.40 s | 44.3 MiB | 0 |
| 1280 | 9.03 s | 9.22 s | 2.92 s | 36.2 MiB | 0 |
| 2560 | 17.7 s | 17.8 s | 5.56 s | 40.7 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 1.01, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 180 ms | 183 ms | 53.2 ms | 3.3 MiB | 6 |
| 40 | 316 ms | 329 ms | 96.3 ms | 6.6 MiB | 3 |
| 80 | 638 ms | 645 ms | 206 ms | 11.4 MiB | 2 |
| 160 | 1.24 s | 1.27 s | 410 ms | 22.8 MiB | 1 |
| 320 | 2.32 s | 2.35 s | 743 ms | 45.6 MiB | 0 |
| 640 | 4.87 s | 4.87 s | 1.63 s | 45.6 MiB | 0 |
| 1280 | 9.84 s | 9.84 s | 3.40 s | 38.9 MiB | 0 |
| 2560 | 20.0 s | 20.1 s | 6.79 s | 31.2 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 176 ms | 178 ms | 60.7 ms | 3.3 MiB | 6 |
| 40 | 360 ms | 371 ms | 110 ms | 6.6 MiB | 3 |
| 80 | 672 ms | 684 ms | 196 ms | 11.8 MiB | 1 |
| 160 | 1.35 s | 1.36 s | 381 ms | 23.1 MiB | 1 |
| 320 | 2.77 s | 2.82 s | 777 ms | 46.9 MiB | 0 |
| 640 | 5.42 s | 5.46 s | 1.50 s | 50.9 MiB | 0 |
| 1280 | 10.9 s | 11.1 s | 3.03 s | 13.0 MiB | 0 |
| 2560 | 21.9 s | 22.4 s | 6.15 s | 31.9 MiB | 0 |

#### Variant `with-reporting-hook`

The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 189 ms | 195 ms | 54.3 ms | 3.3 MiB | 5 |
| 40 | 335 ms | 370 ms | 121 ms | 6.6 MiB | 3 |
| 80 | 581 ms | 599 ms | 192 ms | 11.4 MiB | 2 |
| 160 | 1.14 s | 1.14 s | 379 ms | 22.8 MiB | 1 |
| 320 | 2.37 s | 2.42 s | 796 ms | 45.5 MiB | 0 |
| 640 | 4.57 s | 4.63 s | 1.49 s | 45.6 MiB | 0 |
| 1280 | 8.93 s | 8.95 s | 2.89 s | 39.0 MiB | 0 |
| 2560 | 18.8 s | 18.8 s | 6.24 s | 30.5 MiB | 0 |

### `runRepoContract`

**Why we benchmark it.** It is the public entry point of every contract run: it validates the configuration, schedules and spawns the checks, assembles the evidence and judges it, so it is what every pre-push and every CI job calls.

**What poor performance would mean.** Slower pre-push hooks and CI jobs in proportion to how many checks a repository configures, and a concurrency setting that no longer shortens a run would waste every extra core.

**Expected growth: O(n).** Each check is scheduled, spawned and judged once, with a bounded number running at a time, so total time is proportional to the number of checks.

**Measured on a shorter ladder (20, 40, 80, 160).** Every check spawns a real process and the whole run is measured, so sizes beyond a few hundred take minutes per sample; `run-checks` already measures the scheduler to 2,560.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| configured checks | swept | The tier axis: how many checks a repository configures and runs in one contract run. |
| work per check | fixed at "the fastest real process (node -e \"\")" | Every check spawns a real process that does nothing, so the cost measured is repo-contract's scheduling, not the tool a real check would run. |
| concurrency | swept | How many checks run at a time. |
| hooks | variant | Whether the run reports progress through `onEvidence` and `onVerdict`. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which measures the scheduler on its own (`run-checks`).

#### Variant `plain`

No hooks: the shape of a run that only wants its verdict.

**Measured: O(n)** (exponent 0.89, 4 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 192 ms | 194 ms | 60.7 ms | 3.0 MiB | 5 |
| 40 | 340 ms | 349 ms | 122 ms | 6.0 MiB | 3 |
| 80 | 649 ms | 657 ms | 233 ms | 11.8 MiB | 2 |
| 160 | 1.21 s | 1.24 s | 429 ms | 23.6 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.71 s | 1.75 s | 194 ms | 11.8 MiB | 1 |
| 2 | 941 ms | 979 ms | 206 ms | 11.8 MiB | 1 |
| 4 | 651 ms | 653 ms | 221 ms | 11.8 MiB | 2 |
| 8 | 622 ms | 627 ms | 216 ms | 11.8 MiB | 2 |
| 16 | 616 ms | 669 ms | 219 ms | 11.8 MiB | 2 |

#### Variant `with-hooks`

Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.90, 4 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 193 ms | 248 ms | 72.0 ms | 3.0 MiB | 5 |
| 40 | 328 ms | 329 ms | 117 ms | 6.0 MiB | 3 |
| 80 | 617 ms | 640 ms | 217 ms | 11.8 MiB | 2 |
| 160 | 1.24 s | 1.26 s | 427 ms | 23.6 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.77 s | 1.77 s | 196 ms | 11.8 MiB | 1 |
| 2 | 957 ms | 984 ms | 205 ms | 11.8 MiB | 1 |
| 4 | 672 ms | 684 ms | 240 ms | 11.8 MiB | 1 |
| 8 | 610 ms | 618 ms | 212 ms | 11.8 MiB | 2 |
| 16 | 621 ms | 627 ms | 214 ms | 11.8 MiB | 2 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 600 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 638 ms | 638 ms | 106% |
| `run-repo-contract` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 17.9 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 20.0 s | 20.0 s | 112% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T13:06:16.131Z` → `2026-11-02T13:18:13.633Z` (718 s), ci: CI (run 41449961951)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `362be6b4a56d04cba3dc736c412a9bf56bcb6ee3` on `feat/affected-scope`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **40.9 ms** per operation compared with a bare-minimum baseline (**7.0% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.98). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 40.9 ms | 349 ms |
| Added latency, relative to baseline | 7.0% | 2.1% |
| Added CPU time per operation | 47.3 ms | 1.07 s |
| Added memory per operation (heap delta) | 70.3 KiB | 34.0 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | 24 ops/s | 3 ops/s |

## 1. End-to-end: the package's total impact

Shows what a repository pays, per contract run, for having repo-contract orchestrate its checks instead of spawning the same processes itself. Both sides spawn exactly the same trivial processes at the same concurrency; the difference is repo-contract's dependency scheduling, evidence capture, output handling and policy evaluation. This is CI and pre-push time, paid on every run: the floor under whatever the real tools cost.

- **Baseline (no package):** Spawn n trivial processes directly, eight at a time, with no repo-contract.
- **With the package:** `runChecks` runs n trivial checks (every fifth depends on the one before it) through the real scheduler, spawning the same processes at the same concurrency.

Both sides use empty or minimal functions on purpose. The difference is then the package's own cost, not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| configured checks | swept | The tier axis: how many checks a repository configures and runs in one contract run. |
| work per check | fixed at "the fastest real process (node -e \"\")" | Every check spawns a real process that does nothing, so the cost measured is repo-contract's scheduling, not the tool a real check would run. |
| concurrency | fixed at 8 | Eight checks run at a time; more cores allow more, fewer allow less. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |
| dependency shape | fixed at "every fifth check depends on its predecessor" | Real contracts have a few dependency edges; chains and barriers are measured as variants of runChecks below. |

The baseline is an empty or minimal function, so it costs almost nothing. The _relative_ overhead can then look enormous (shown as a multiple of the baseline). Read the absolute columns (time, CPU and dollars added): they are what a bill and a latency budget are made of.

| checks | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 152 ms | 206 ms | 56.7 ms | 37% | 22.1 ms | $0.118 – $0.249 |
| 40 | 293 ms | 346 ms | 53.0 ms | 18% | 34.1 ms | $0.110 – $0.384 |
| 80 | 582 ms | 631 ms | 40.9 ms | 7.0% | 47.3 ms | $0.085 – $0.532 |
| 160 | 1.08 s | 1.16 s | 79.8 ms | 7.4% | 92.9 ms | $0.166 – $1.04 |
| 320 | 2.25 s | 2.20 s | 0 | 0.0% | 53.7 ms | $0 – $0.603 |
| 640 | 4.49 s | 4.63 s | 140 ms | 3.1% | 146 ms | $0.292 – $1.64 |
| 1280 | 8.33 s | 8.82 s | 202 ms | 2.4% | 718 ms | $0.420 – $8.08 |
| 2560 | 16.6 s | 17.5 s | 349 ms | 2.1% | 1.07 s | $0.727 – $12.07 |

**How the total grows:** O(n) (linear), exponent 0.98 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | check | O(n) | O(n) | ✅ matches | 616 ms | 18.1 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | check | O(n) | O(n) | ✅ matches | 628 ms | 18.6 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | check | O(n) | O(n) | ✅ matches | 726 ms | 23.6 s |
| `runChecks (scheduler and process orchestration)` (with-reporting-hook) | check | O(n) | O(n) | ✅ matches | 641 ms | 17.1 s |
| `runRepoContract` (plain) | check | O(n) | O(n) | ✅ matches | 578 ms | 1.08 s (at 160) |
| `runRepoContract` (plain) | concurrency | O(1) | O(1) | ✅ matches | 569 ms (at 16) | 569 ms (at 16) |
| `runRepoContract` (with-hooks) | check | O(n) | O(n) | ✅ matches | 625 ms | 1.19 s (at 160) |
| `runRepoContract` (with-hooks) | concurrency | O(1) | O(1) | ✅ matches | 631 ms (at 16) | 631 ms (at 16) |

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

- **long dependency chains**: A chain through every check serializes the whole run and measures process latency, not scheduling; real contracts do not do this.
- **check timeouts and aborts**: They are failure paths; the steady-state cost is the successful run.

**In the end-to-end run:** This is the end-to-end operation itself.

#### Variant `no-dependencies`

Every check is independent, so the scheduler can always keep eight running.

**Measured: O(n)** (exponent 1.01, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 165 ms | 174 ms | 58.5 ms | 2.8 MiB | 6 |
| 40 | 309 ms | 343 ms | 117 ms | 6.4 MiB | 3 |
| 80 | 616 ms | 618 ms | 236 ms | 11.1 MiB | 2 |
| 160 | 1.07 s | 1.15 s | 385 ms | 22.1 MiB | 1 |
| 320 | 2.32 s | 2.37 s | 830 ms | 44.0 MiB | 0 |
| 640 | 4.54 s | 4.55 s | 1.63 s | 42.8 MiB | 0 |
| 1280 | 8.86 s | 9.00 s | 3.13 s | 33.3 MiB | 0 |
| 2560 | 18.1 s | 18.3 s | 6.28 s | 48.9 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.98, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 200 ms | 226 ms | 60.1 ms | 3.3 MiB | 5 |
| 40 | 351 ms | 365 ms | 110 ms | 6.5 MiB | 3 |
| 80 | 628 ms | 639 ms | 221 ms | 11.2 MiB | 2 |
| 160 | 1.26 s | 1.26 s | 454 ms | 22.4 MiB | 1 |
| 320 | 2.41 s | 2.46 s | 842 ms | 44.7 MiB | 0 |
| 640 | 4.57 s | 4.78 s | 1.57 s | 43.9 MiB | 0 |
| 1280 | 9.69 s | 9.71 s | 3.55 s | 35.8 MiB | 0 |
| 2560 | 18.6 s | 19.6 s | 6.55 s | 46.0 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.01, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 177 ms | 189 ms | 62.4 ms | 3.2 MiB | 6 |
| 40 | 357 ms | 368 ms | 120 ms | 6.5 MiB | 3 |
| 80 | 726 ms | 763 ms | 224 ms | 11.2 MiB | 1 |
| 160 | 1.44 s | 1.46 s | 413 ms | 22.6 MiB | 1 |
| 320 | 2.89 s | 2.97 s | 842 ms | 45.8 MiB | 0 |
| 640 | 5.96 s | 6.18 s | 1.76 s | 48.6 MiB | 0 |
| 1280 | 12.2 s | 12.2 s | 3.60 s | 9.6 MiB | 0 |
| 2560 | 23.6 s | 23.7 s | 6.76 s | 23.5 MiB | 0 |

#### Variant `with-reporting-hook`

The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.96, 8 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 190 ms | 205 ms | 64.7 ms | 3.3 MiB | 5 |
| 40 | 365 ms | 391 ms | 140 ms | 6.5 MiB | 3 |
| 80 | 641 ms | 647 ms | 228 ms | 11.2 MiB | 2 |
| 160 | 1.20 s | 1.22 s | 423 ms | 22.3 MiB | 1 |
| 320 | 2.35 s | 2.36 s | 834 ms | 44.7 MiB | 0 |
| 640 | 4.57 s | 4.63 s | 1.59 s | 43.8 MiB | 0 |
| 1280 | 9.14 s | 9.26 s | 3.29 s | 35.7 MiB | 0 |
| 2560 | 17.1 s | 18.1 s | 5.69 s | 47.3 MiB | 0 |

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

**Measured: O(n)** (exponent 0.79, 4 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 206 ms | 218 ms | 73.9 ms | 3.0 MiB | 5 |
| 40 | 347 ms | 368 ms | 146 ms | 5.9 MiB | 3 |
| 80 | 578 ms | 588 ms | 202 ms | 11.6 MiB | 2 |
| 160 | 1.08 s | 1.08 s | 356 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

**Measured: O(1)** (exponent -0.49, 5 sizes): ✅ matches.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 2.28 s | 2.31 s | 246 ms | 11.6 MiB | 0 |
| 2 | 1.10 s | 1.11 s | 245 ms | 11.6 MiB | 1 |
| 4 | 644 ms | 729 ms | 216 ms | 11.6 MiB | 2 |
| 8 | 608 ms | 613 ms | 207 ms | 11.6 MiB | 2 |
| 16 | 569 ms | 626 ms | 194 ms | 11.6 MiB | 2 |

#### Variant `with-hooks`

Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.81, 4 sizes): ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 221 ms | 223 ms | 62.0 ms | 3.0 MiB | 5 |
| 40 | 347 ms | 349 ms | 128 ms | 5.9 MiB | 3 |
| 80 | 625 ms | 634 ms | 226 ms | 11.6 MiB | 2 |
| 160 | 1.19 s | 1.21 s | 423 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

**Measured: O(1)** (exponent -0.45, 5 sizes): ✅ matches.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 2.36 s | 2.38 s | 241 ms | 11.6 MiB | 0 |
| 2 | 1.14 s | 1.21 s | 249 ms | 11.6 MiB | 1 |
| 4 | 746 ms | 757 ms | 243 ms | 11.6 MiB | 1 |
| 8 | 698 ms | 738 ms | 253 ms | 11.6 MiB | 1 |
| 16 | 631 ms | 637 ms | 218 ms | 11.6 MiB | 2 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 631 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 628 ms | 628 ms | 100% |
| `run-repo-contract` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.75 ms | 0.4% |

**At 2560 checks** (whole operation: 17.5 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 18.6 s | 18.6 s | 106% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-17T18:33:59.605Z` → `2026-11-17T18:46:03.861Z` (724 s), ci: CI (run 44148884303)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `ff0304f1cc5188d15ea2c2acc56e5ac2ab9340cf` on `fix/round7-gaps`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks: One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


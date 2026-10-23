# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **32.4 ms** per operation compared with a bare-minimum baseline (**4.6% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 32.4 ms | 869 ms |
| Added latency, relative to baseline | 4.6% | 3.9% |
| Added CPU time per operation | 35.8 ms | 2.03 s |
| Added memory per operation (heap delta) | 11.0 MiB | 5.5 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | 31 ops/s | 1 ops/s |

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
| 20 | 182 ms | 224 ms | 41.5 ms | 23% | 14.7 ms | $0.086 – $0.165 |
| 40 | 359 ms | 386 ms | 27.2 ms | 7.6% | 21.8 ms | $0.057 – $0.245 |
| 80 | 708 ms | 740 ms | 32.4 ms | 4.6% | 35.8 ms | $0.068 – $0.403 |
| 160 | 1.41 s | 1.45 s | 38.2 ms | 2.7% | 92.5 ms | $0.080 – $1.04 |
| 320 | 2.80 s | 2.88 s | 81.6 ms | 2.9% | 192 ms | $0.170 – $2.16 |
| 640 | 5.59 s | 5.78 s | 191 ms | 3.4% | 469 ms | $0.397 – $5.27 |
| 1280 | 11.2 s | 11.6 s | 426 ms | 3.8% | 1.16 s | $0.887 – $13.04 |
| 2560 | 22.3 s | 23.2 s | 869 ms | 3.9% | 2.03 s | $1.81 – $22.85 |

**How the total grows:** O(n) (linear), exponent 1.00 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | check | O(n) | O(n) | ✅ matches | 729 ms | 23.1 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | check | O(n) | O(n) | ✅ matches | 751 ms | 23.1 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | check | O(n) | O(n) | ✅ matches | 820 ms | 27.5 s |
| `runChecks (scheduler and process orchestration)` (with-reporting-hook) | check | O(n) | O(n) | ✅ matches | 788 ms | 24.2 s |
| `runRepoContract` (plain) | check | O(n) | O(n) | ✅ matches | 793 ms | 1.55 s (at 160) |
| `runRepoContract` (plain) | concurrency | O(1) | n/a | ❔ not enough data | 799 ms (at 16) | 799 ms (at 16) |
| `runRepoContract` (with-hooks) | check | O(n) | O(n) | ✅ matches | 801 ms | 1.55 s (at 160) |
| `runRepoContract` (with-hooks) | concurrency | O(1) | n/a | ❔ not enough data | 798 ms (at 16) | 798 ms (at 16) |

> **Could not be determined.** The big-O of these could not be measured, so they are not checked against their documentation:
>
> - `run-repo-contract (plain)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.75, and a fit below 0.8 is not trusted; fitted exponent -0.33). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth
> - `run-repo-contract (with-hooks)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.74, and a fit below 0.8 is not trusted; fitted exponent -0.33). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth

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

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 188 ms | 198 ms | 54.9 ms | 2.8 MiB | 5 |
| 40 | 378 ms | 379 ms | 107 ms | 6.5 MiB | 3 |
| 80 | 729 ms | 733 ms | 202 ms | 11.3 MiB | 1 |
| 160 | 1.46 s | 1.46 s | 397 ms | 22.5 MiB | 1 |
| 320 | 2.89 s | 2.89 s | 784 ms | 44.9 MiB | 0 |
| 640 | 5.79 s | 5.80 s | 1.57 s | 44.3 MiB | 0 |
| 1280 | 11.6 s | 11.6 s | 3.17 s | 36.7 MiB | 0 |
| 2560 | 23.1 s | 23.1 s | 6.21 s | 49.2 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 224 ms | 227 ms | 55.6 ms | 3.3 MiB | 4 |
| 40 | 398 ms | 401 ms | 115 ms | 6.6 MiB | 3 |
| 80 | 751 ms | 754 ms | 201 ms | 11.4 MiB | 1 |
| 160 | 1.48 s | 1.50 s | 397 ms | 22.8 MiB | 1 |
| 320 | 2.93 s | 2.93 s | 799 ms | 45.7 MiB | 0 |
| 640 | 5.78 s | 5.79 s | 1.56 s | 45.7 MiB | 0 |
| 1280 | 11.6 s | 11.7 s | 3.20 s | 39.4 MiB | 0 |
| 2560 | 23.1 s | 23.1 s | 6.26 s | 45.3 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.02, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 209 ms | 217 ms | 61.7 ms | 3.3 MiB | 5 |
| 40 | 414 ms | 418 ms | 107 ms | 6.6 MiB | 2 |
| 80 | 820 ms | 826 ms | 194 ms | 11.7 MiB | 1 |
| 160 | 1.63 s | 1.66 s | 382 ms | 23.1 MiB | 1 |
| 320 | 3.29 s | 3.32 s | 760 ms | 46.9 MiB | 0 |
| 640 | 6.55 s | 6.59 s | 1.51 s | 51.0 MiB | 0 |
| 1280 | 13.2 s | 13.4 s | 3.02 s | 14.8 MiB | 0 |
| 2560 | 27.5 s | 27.6 s | 6.50 s | 35.9 MiB | 0 |

#### Variant `with-reporting-hook`

The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 226 ms | 242 ms | 59.9 ms | 3.3 MiB | 4 |
| 40 | 412 ms | 418 ms | 119 ms | 6.6 MiB | 2 |
| 80 | 788 ms | 793 ms | 227 ms | 11.4 MiB | 1 |
| 160 | 1.57 s | 1.59 s | 450 ms | 22.8 MiB | 1 |
| 320 | 3.09 s | 3.10 s | 891 ms | 45.7 MiB | 0 |
| 640 | 6.12 s | 6.12 s | 1.78 s | 45.8 MiB | 0 |
| 1280 | 12.1 s | 12.2 s | 3.56 s | 39.4 MiB | 0 |
| 2560 | 24.2 s | 24.4 s | 7.00 s | 52.4 MiB | 0 |

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

**Measured: O(n)** (exponent 0.90, 4 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 238 ms | 245 ms | 65.5 ms | 3.0 MiB | 4 |
| 40 | 419 ms | 421 ms | 124 ms | 6.0 MiB | 2 |
| 80 | 793 ms | 803 ms | 230 ms | 11.8 MiB | 1 |
| 160 | 1.55 s | 1.55 s | 454 ms | 23.6 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 2.12 s | 2.12 s | 190 ms | 11.8 MiB | 0 |
| 2 | 1.15 s | 1.16 s | 201 ms | 11.8 MiB | 1 |
| 4 | 818 ms | 826 ms | 228 ms | 11.8 MiB | 1 |
| 8 | 801 ms | 801 ms | 232 ms | 11.8 MiB | 1 |
| 16 | 799 ms | 805 ms | 229 ms | 11.8 MiB | 1 |

#### Variant `with-hooks`

Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.92, 4 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 228 ms | 236 ms | 59.7 ms | 3.0 MiB | 4 |
| 40 | 417 ms | 424 ms | 118 ms | 6.0 MiB | 2 |
| 80 | 801 ms | 803 ms | 242 ms | 11.8 MiB | 1 |
| 160 | 1.55 s | 1.57 s | 442 ms | 23.6 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 2.11 s | 2.13 s | 191 ms | 11.8 MiB | 0 |
| 2 | 1.12 s | 1.14 s | 199 ms | 11.8 MiB | 1 |
| 4 | 821 ms | 829 ms | 224 ms | 11.8 MiB | 1 |
| 8 | 790 ms | 796 ms | 236 ms | 11.8 MiB | 1 |
| 16 | 798 ms | 800 ms | 234 ms | 11.8 MiB | 1 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 740 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 751 ms | 751 ms | 101% |
| `run-repo-contract` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 23.2 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 23.1 s | 23.1 s | 100% |
| _unattributed_ |  |  | 101 ms | 0.4% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-23T07:44:15.740Z` → `2026-10-23T07:59:25.254Z` (910 s), ci: CI (run 39919720825)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `3f2e7236938ff50dc39760bdb0dbc9ed7a7337df` on `chore/security-and-dep-updates`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


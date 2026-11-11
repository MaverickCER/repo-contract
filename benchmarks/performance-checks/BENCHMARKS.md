# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **27.9 ms** per operation compared with a bare-minimum baseline (**3.3% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 27.9 ms | 1.07 s |
| Added latency, relative to baseline | 3.3% | 4.1% |
| Added CPU time per operation | 47.3 ms | 3.00 s |
| Added memory per operation (heap delta) | 10.9 MiB | 44.4 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$1 – $100 |
| Single-core throughput ceiling of the overhead alone | 36 ops/s | 1 ops/s |

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
| 20 | 223 ms | 258 ms | 35.7 ms | 16% | 16.2 ms | $0.074 – $0.182 |
| 40 | 416 ms | 460 ms | 44.2 ms | 11% | 37.1 ms | $0.092 – $0.418 |
| 80 | 845 ms | 873 ms | 27.9 ms | 3.3% | 47.3 ms | $0.058 – $0.532 |
| 160 | 1.63 s | 1.72 s | 92.2 ms | 5.7% | 145 ms | $0.192 – $1.63 |
| 320 | 3.20 s | 3.41 s | 208 ms | 6.5% | 308 ms | $0.434 – $3.46 |
| 640 | 6.43 s | 6.81 s | 372 ms | 5.8% | 734 ms | $0.775 – $8.25 |
| 1280 | 12.8 s | 13.6 s | 738 ms | 5.7% | 1.68 s | $1.54 – $18.94 |
| 2560 | 26.2 s | 27.2 s | 1.07 s | 4.1% | 3.00 s | $2.24 – $33.72 |

**How the total grows:** O(n) (linear), exponent 1.00 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | check | O(n) | O(n) | ✅ matches | 866 ms | 27.1 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | check | O(n) | O(n) | ✅ matches | 897 ms | 27.6 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | check | O(n) | O(n) | ✅ matches | 984 ms | 31.1 s |
| `runChecks (scheduler and process orchestration)` (with-reporting-hook) | check | O(n) | O(n) | ✅ matches | 913 ms | 27.2 s |
| `runRepoContract` (plain) | check | O(n) | O(n) | ✅ matches | 912 ms | 1.77 s (at 160) |
| `runRepoContract` (plain) | concurrency | O(1) | n/a | ❔ not enough data | 911 ms (at 16) | 911 ms (at 16) |
| `runRepoContract` (with-hooks) | check | O(n) | O(n) | ✅ matches | 911 ms | 1.78 s (at 160) |
| `runRepoContract` (with-hooks) | concurrency | O(1) | n/a | ❔ not enough data | 904 ms (at 16) | 904 ms (at 16) |

> **Could not be determined.** The big-O of these could not be measured, so they are not checked against their documentation:
>
> - `run-repo-contract (plain)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.73, and a fit below 0.8 is not trusted; fitted exponent -0.34). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth
> - `run-repo-contract (with-hooks)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.75, and a fit below 0.8 is not trusted; fitted exponent -0.34). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth

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
| 20 | 229 ms | 231 ms | 75.8 ms | 3.2 MiB | 4 |
| 40 | 444 ms | 449 ms | 143 ms | 6.4 MiB | 2 |
| 80 | 866 ms | 871 ms | 279 ms | 11.0 MiB | 1 |
| 160 | 1.73 s | 1.77 s | 542 ms | 22.0 MiB | 1 |
| 320 | 3.47 s | 3.49 s | 1.10 s | 44.0 MiB | 0 |
| 640 | 6.86 s | 6.89 s | 2.12 s | 42.5 MiB | 0 |
| 1280 | 13.6 s | 13.7 s | 4.23 s | 32.5 MiB | 0 |
| 2560 | 27.1 s | 27.5 s | 8.23 s | 42.1 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 265 ms | 270 ms | 72.8 ms | 3.3 MiB | 4 |
| 40 | 479 ms | 479 ms | 144 ms | 6.5 MiB | 2 |
| 80 | 897 ms | 912 ms | 279 ms | 11.2 MiB | 1 |
| 160 | 1.78 s | 1.79 s | 549 ms | 22.3 MiB | 1 |
| 320 | 3.48 s | 3.52 s | 1.09 s | 44.7 MiB | 0 |
| 640 | 6.89 s | 6.92 s | 2.14 s | 43.8 MiB | 0 |
| 1280 | 13.8 s | 13.9 s | 4.41 s | 35.9 MiB | 0 |
| 2560 | 27.6 s | 27.6 s | 8.58 s | 48.1 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 243 ms | 243 ms | 76.7 ms | 3.3 MiB | 4 |
| 40 | 491 ms | 495 ms | 139 ms | 6.5 MiB | 2 |
| 80 | 984 ms | 1.02 s | 274 ms | 11.6 MiB | 1 |
| 160 | 2.01 s | 2.04 s | 526 ms | 22.6 MiB | 0 |
| 320 | 3.94 s | 3.96 s | 1.01 s | 45.9 MiB | 0 |
| 640 | 7.84 s | 7.85 s | 2.01 s | 48.7 MiB | 0 |
| 1280 | 15.6 s | 15.8 s | 4.00 s | 9.0 MiB | 0 |
| 2560 | 31.1 s | 31.8 s | 7.75 s | 26.1 MiB | 0 |

#### Variant `with-reporting-hook`

The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 276 ms | 304 ms | 81.6 ms | 2.8 MiB | 4 |
| 40 | 498 ms | 538 ms | 163 ms | 6.5 MiB | 2 |
| 80 | 913 ms | 938 ms | 297 ms | 11.2 MiB | 1 |
| 160 | 1.78 s | 1.78 s | 576 ms | 22.3 MiB | 1 |
| 320 | 3.46 s | 3.50 s | 1.10 s | 44.6 MiB | 0 |
| 640 | 6.90 s | 6.97 s | 2.17 s | 43.7 MiB | 0 |
| 1280 | 13.8 s | 13.9 s | 4.42 s | 35.5 MiB | 0 |
| 2560 | 27.2 s | 27.4 s | 8.36 s | 47.0 MiB | 0 |

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

**Measured: O(n)** (exponent 0.92, 4 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 263 ms | 273 ms | 75.7 ms | 3.0 MiB | 4 |
| 40 | 474 ms | 481 ms | 158 ms | 5.9 MiB | 2 |
| 80 | 912 ms | 916 ms | 306 ms | 11.6 MiB | 1 |
| 160 | 1.77 s | 1.78 s | 587 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 2.48 s | 2.49 s | 241 ms | 11.6 MiB | 0 |
| 2 | 1.28 s | 1.32 s | 246 ms | 11.6 MiB | 1 |
| 4 | 939 ms | 944 ms | 282 ms | 11.6 MiB | 1 |
| 8 | 927 ms | 930 ms | 303 ms | 11.6 MiB | 1 |
| 16 | 911 ms | 925 ms | 295 ms | 11.6 MiB | 1 |

#### Variant `with-hooks`

Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.89, 4 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 279 ms | 284 ms | 76.3 ms | 3.0 MiB | 4 |
| 40 | 500 ms | 572 ms | 170 ms | 5.9 MiB | 2 |
| 80 | 911 ms | 924 ms | 297 ms | 11.6 MiB | 1 |
| 160 | 1.78 s | 1.80 s | 576 ms | 23.1 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 2.48 s | 2.49 s | 243 ms | 11.6 MiB | 0 |
| 2 | 1.30 s | 1.32 s | 248 ms | 11.6 MiB | 1 |
| 4 | 945 ms | 968 ms | 295 ms | 11.6 MiB | 1 |
| 8 | 918 ms | 928 ms | 302 ms | 11.6 MiB | 1 |
| 16 | 904 ms | 918 ms | 296 ms | 11.6 MiB | 1 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 873 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 897 ms | 897 ms | 103% |
| `run-repo-contract` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 27.2 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 27.6 s | 27.6 s | 101% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-11T12:51:56.349Z` → `2026-11-11T13:09:37.681Z` (1061 s), ci: CI (run 43021773948)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `14e1a573ee8492e838957ec10edf1dd89619e34e` on `docs/v1-claims-evidence`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


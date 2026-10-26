# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **no overhead this run could measure** (its median was at or below the baseline's, which is run-to-run noise, not a speed-up) per operation compared with a bare-minimum baseline (**0.0% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0 – $0.1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 0 | 722 ms |
| Added latency, relative to baseline | 0.0% | 3.9% |
| Added CPU time per operation | 25.0 ms | 1.85 s |
| Added memory per operation (heap delta) | 11.1 MiB | 24.7 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0 – $0.1 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | not measurable (no overhead measured) | 1 ops/s |

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
| 20 | 185 ms | 188 ms | 2.41 ms | 1.3% | 13.3 ms | $0.005 – $0.150 |
| 40 | 353 ms | 317 ms | 0 | 0.0% | 18.1 ms | $0 – $0.203 |
| 80 | 614 ms | 605 ms | 0 | 0.0% | 25.0 ms | $0 – $0.282 |
| 160 | 1.18 s | 1.20 s | 16.0 ms | 1.4% | 84.5 ms | $0.033 – $0.950 |
| 320 | 2.39 s | 2.36 s | 0 | 0.0% | 147 ms | $0 – $1.65 |
| 640 | 4.73 s | 4.90 s | 177 ms | 3.8% | 423 ms | $0.369 – $4.76 |
| 1280 | 9.32 s | 9.54 s | 219 ms | 2.3% | 891 ms | $0.456 – $10.02 |
| 2560 | 18.5 s | 19.2 s | 722 ms | 3.9% | 1.85 s | $1.51 – $20.78 |

**How the total grows:** O(n) (linear), exponent 1.00 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | check | O(n) | O(n) | ✅ matches | 607 ms | 18.8 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | check | O(n) | O(n) | ✅ matches | 602 ms | 19.2 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | check | O(n) | O(n) | ✅ matches | 668 ms | 21.8 s |
| `runChecks (scheduler and process orchestration)` (with-reporting-hook) | check | O(n) | O(n) | ✅ matches | 622 ms | 19.1 s |
| `runRepoContract` (plain) | check | O(n) | O(n) | ✅ matches | 612 ms | 1.21 s (at 160) |
| `runRepoContract` (plain) | concurrency | O(1) | n/a | ❔ not enough data | 623 ms (at 16) | 623 ms (at 16) |
| `runRepoContract` (with-hooks) | check | O(n) | O(n) | ✅ matches | 630 ms | 1.21 s (at 160) |
| `runRepoContract` (with-hooks) | concurrency | O(1) | n/a | ❔ not enough data | 617 ms (at 16) | 617 ms (at 16) |

> **Could not be determined.** The big-O of these could not be measured, so they are not checked against their documentation:
>
> - `run-repo-contract (plain)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.79, and a fit below 0.8 is not trusted; fitted exponent -0.35). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth
> - `run-repo-contract (with-hooks)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.78, and a fit below 0.8 is not trusted; fitted exponent -0.36). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth

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
| 20 | 158 ms | 159 ms | 45.8 ms | 3.3 MiB | 6 |
| 40 | 309 ms | 310 ms | 93.5 ms | 6.5 MiB | 3 |
| 80 | 607 ms | 608 ms | 169 ms | 11.2 MiB | 2 |
| 160 | 1.21 s | 1.25 s | 335 ms | 22.5 MiB | 1 |
| 320 | 2.39 s | 2.42 s | 644 ms | 44.9 MiB | 0 |
| 640 | 4.76 s | 4.96 s | 1.32 s | 44.3 MiB | 0 |
| 1280 | 9.64 s | 9.73 s | 2.63 s | 36.7 MiB | 0 |
| 2560 | 18.8 s | 19.1 s | 5.00 s | 48.1 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 187 ms | 187 ms | 43.7 ms | 3.3 MiB | 5 |
| 40 | 320 ms | 325 ms | 82.6 ms | 6.6 MiB | 3 |
| 80 | 602 ms | 621 ms | 163 ms | 11.4 MiB | 2 |
| 160 | 1.19 s | 1.22 s | 318 ms | 22.8 MiB | 1 |
| 320 | 2.39 s | 2.41 s | 646 ms | 45.7 MiB | 0 |
| 640 | 4.75 s | 4.77 s | 1.28 s | 45.8 MiB | 0 |
| 1280 | 9.48 s | 9.69 s | 2.62 s | 39.6 MiB | 0 |
| 2560 | 19.2 s | 19.4 s | 5.19 s | 32.1 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.01, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 177 ms | 177 ms | 51.4 ms | 3.3 MiB | 6 |
| 40 | 340 ms | 342 ms | 86.8 ms | 6.7 MiB | 3 |
| 80 | 668 ms | 677 ms | 159 ms | 11.8 MiB | 1 |
| 160 | 1.35 s | 1.35 s | 314 ms | 23.1 MiB | 1 |
| 320 | 2.73 s | 2.73 s | 631 ms | 46.9 MiB | 0 |
| 640 | 5.50 s | 5.54 s | 1.24 s | 51.0 MiB | 0 |
| 1280 | 11.2 s | 11.4 s | 2.64 s | 13.0 MiB | 0 |
| 2560 | 21.8 s | 22.1 s | 4.94 s | 36.8 MiB | 0 |

#### Variant `with-reporting-hook`

The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 187 ms | 187 ms | 46.3 ms | 2.9 MiB | 5 |
| 40 | 330 ms | 333 ms | 90.3 ms | 6.6 MiB | 3 |
| 80 | 622 ms | 632 ms | 172 ms | 11.4 MiB | 2 |
| 160 | 1.22 s | 1.22 s | 332 ms | 22.8 MiB | 1 |
| 320 | 2.41 s | 2.45 s | 652 ms | 45.6 MiB | 0 |
| 640 | 4.79 s | 4.84 s | 1.30 s | 45.5 MiB | 0 |
| 1280 | 9.46 s | 9.61 s | 2.61 s | 39.6 MiB | 0 |
| 2560 | 19.1 s | 19.2 s | 5.24 s | 51.0 MiB | 0 |

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
| 20 | 189 ms | 195 ms | 49.7 ms | 3.0 MiB | 5 |
| 40 | 331 ms | 331 ms | 91.4 ms | 6.0 MiB | 3 |
| 80 | 612 ms | 628 ms | 178 ms | 11.8 MiB | 2 |
| 160 | 1.21 s | 1.23 s | 336 ms | 23.6 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.70 s | 1.75 s | 147 ms | 11.8 MiB | 1 |
| 2 | 944 ms | 973 ms | 154 ms | 11.8 MiB | 1 |
| 4 | 663 ms | 669 ms | 174 ms | 11.8 MiB | 2 |
| 8 | 625 ms | 631 ms | 172 ms | 11.8 MiB | 2 |
| 16 | 623 ms | 628 ms | 170 ms | 11.8 MiB | 2 |

#### Variant `with-hooks`

Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.91, 4 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 183 ms | 184 ms | 47.1 ms | 3.0 MiB | 5 |
| 40 | 331 ms | 333 ms | 91.2 ms | 6.0 MiB | 3 |
| 80 | 630 ms | 633 ms | 182 ms | 11.9 MiB | 2 |
| 160 | 1.21 s | 1.21 s | 327 ms | 23.6 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.72 s | 1.79 s | 159 ms | 11.8 MiB | 1 |
| 2 | 946 ms | 948 ms | 154 ms | 11.8 MiB | 1 |
| 4 | 647 ms | 655 ms | 168 ms | 11.8 MiB | 2 |
| 8 | 624 ms | 667 ms | 175 ms | 11.8 MiB | 2 |
| 16 | 617 ms | 619 ms | 167 ms | 11.8 MiB | 2 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 605 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 602 ms | 602 ms | 100% |
| `run-repo-contract` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.37 ms | 0.4% |

**At 2560 checks** (whole operation: 19.2 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 19.2 s | 19.2 s | 100% |
| _unattributed_ |  |  | 4.69 ms | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-26T09:31:37.903Z` → `2026-10-26T09:44:03.224Z` (745 s), ci: CI (run 40300171082)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `01e446d8ae3f1d815cf4deb1ba15902ebdb1a598` on `dependabot/npm_and_yarn/dev-dependencies-6c9b387527`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


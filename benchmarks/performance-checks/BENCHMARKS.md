# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **31.6 ms** per operation compared with a bare-minimum baseline (**4.1% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.1 – $1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (2560 checks) |
| --- | --- | --- |
| Added latency per operation | 31.6 ms | 742 ms |
| Added latency, relative to baseline | 4.1% | 3.1% |
| Added CPU time per operation | 37.3 ms | 2.14 s |
| Added memory per operation (heap delta) | 11.0 MiB | 5.9 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $1 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | 32 ops/s | 1 ops/s |

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
| 20 | 213 ms | 246 ms | 32.8 ms | 15% | 15.2 ms | $0.068 – $0.171 |
| 40 | 390 ms | 420 ms | 29.7 ms | 7.6% | 21.5 ms | $0.062 – $0.242 |
| 80 | 772 ms | 804 ms | 31.6 ms | 4.1% | 37.3 ms | $0.066 – $0.419 |
| 160 | 1.53 s | 1.56 s | 28.1 ms | 1.8% | 101 ms | $0.059 – $1.13 |
| 320 | 3.04 s | 3.09 s | 41.4 ms | 1.4% | 205 ms | $0.086 – $2.30 |
| 640 | 6.07 s | 6.19 s | 114 ms | 1.9% | 463 ms | $0.237 – $5.20 |
| 1280 | 12.1 s | 12.4 s | 342 ms | 2.8% | 1.21 s | $0.711 – $13.58 |
| 2560 | 24.1 s | 24.8 s | 742 ms | 3.1% | 2.14 s | $1.55 – $24.12 |

**How the total grows:** O(n) (linear), exponent 1.00 over 8 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 80 | At 2560 |
| --- | --- | --- | --- | --- | --- | --- |
| `runChecks (scheduler and process orchestration)` (no-dependencies) | check | O(n) | O(n) | ✅ matches | 786 ms | 24.7 s |
| `runChecks (scheduler and process orchestration)` (few-dependencies) | check | O(n) | O(n) | ✅ matches | 805 ms | 24.7 s |
| `runChecks (scheduler and process orchestration)` (frequent-barriers) | check | O(n) | O(n) | ✅ matches | 896 ms | 28.5 s |
| `runChecks (scheduler and process orchestration)` (with-reporting-hook) | check | O(n) | O(n) | ✅ matches | 823 ms | 24.7 s |
| `runRepoContract` (plain) | check | O(n) | O(n) | ✅ matches | 817 ms | 1.59 s (at 160) |
| `runRepoContract` (plain) | concurrency | O(1) | n/a | ❔ not enough data | 822 ms (at 16) | 822 ms (at 16) |
| `runRepoContract` (with-hooks) | check | O(n) | O(n) | ✅ matches | 819 ms | 1.60 s (at 160) |
| `runRepoContract` (with-hooks) | concurrency | O(1) | n/a | ❔ not enough data | 845 ms (at 16) | 845 ms (at 16) |

> **Could not be determined.** The big-O of these could not be measured, so they are not checked against their documentation:
>
> - `run-repo-contract (plain)` (varying concurrency): over the largest 5 concurrency sizes the timings do not follow one growth rate (R² 0.77, and a fit below 0.8 is not trusted; fitted exponent -0.35). The cost probably changes regime between sizes (a cache, a threshold, a batch size) or run-to-run noise outweighs the growth
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
| 20 | 208 ms | 211 ms | 63.6 ms | 2.8 MiB | 5 |
| 40 | 396 ms | 403 ms | 121 ms | 6.5 MiB | 3 |
| 80 | 786 ms | 789 ms | 236 ms | 11.2 MiB | 1 |
| 160 | 1.57 s | 1.57 s | 457 ms | 22.4 MiB | 1 |
| 320 | 3.11 s | 3.13 s | 899 ms | 44.8 MiB | 0 |
| 640 | 6.18 s | 6.22 s | 1.80 s | 44.2 MiB | 0 |
| 1280 | 12.3 s | 12.4 s | 3.58 s | 36.5 MiB | 0 |
| 2560 | 24.7 s | 24.7 s | 7.01 s | 46.5 MiB | 0 |

#### Variant `few-dependencies`

Every fifth check depends on its predecessor and one check in the middle is an isolated barrier -- the shape of a real contract.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 249 ms | 250 ms | 66.9 ms | 3.3 MiB | 4 |
| 40 | 422 ms | 429 ms | 119 ms | 6.6 MiB | 2 |
| 80 | 805 ms | 810 ms | 232 ms | 11.4 MiB | 1 |
| 160 | 1.58 s | 1.59 s | 457 ms | 22.8 MiB | 1 |
| 320 | 3.12 s | 3.13 s | 899 ms | 45.5 MiB | 0 |
| 640 | 6.20 s | 6.20 s | 1.78 s | 45.4 MiB | 0 |
| 1280 | 12.4 s | 12.4 s | 3.63 s | 39.4 MiB | 0 |
| 2560 | 24.7 s | 24.7 s | 7.17 s | 52.9 MiB | 0 |

#### Variant `frequent-barriers`

Every twentieth check is isolated, which forces everything before it to finish and everything after it to wait: the most serialized realistic shape.

**Measured: O(n)** (exponent 1.00, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 223 ms | 224 ms | 68.9 ms | 3.3 MiB | 4 |
| 40 | 445 ms | 448 ms | 120 ms | 6.6 MiB | 2 |
| 80 | 896 ms | 908 ms | 228 ms | 11.8 MiB | 1 |
| 160 | 1.78 s | 1.79 s | 441 ms | 23.1 MiB | 1 |
| 320 | 3.60 s | 3.61 s | 882 ms | 46.8 MiB | 0 |
| 640 | 7.18 s | 7.19 s | 1.76 s | 50.9 MiB | 0 |
| 1280 | 14.3 s | 14.3 s | 3.50 s | 12.7 MiB | 0 |
| 2560 | 28.5 s | 28.6 s | 6.93 s | 69.0 MiB | 0 |

#### Variant `with-reporting-hook`

The shape of a real contract (few dependencies) with an `onEvidence` hook that reads each check's evidence, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.99, 8 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 247 ms | 249 ms | 70.6 ms | 2.9 MiB | 4 |
| 40 | 430 ms | 432 ms | 134 ms | 6.6 MiB | 2 |
| 80 | 823 ms | 824 ms | 249 ms | 11.4 MiB | 1 |
| 160 | 1.60 s | 1.60 s | 477 ms | 22.8 MiB | 1 |
| 320 | 3.15 s | 3.15 s | 932 ms | 45.6 MiB | 0 |
| 640 | 6.23 s | 6.26 s | 1.84 s | 45.5 MiB | 0 |
| 1280 | 12.4 s | 12.4 s | 3.68 s | 39.0 MiB | 0 |
| 2560 | 24.7 s | 24.8 s | 7.15 s | 11.2 MiB | 0 |

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
| 20 | 253 ms | 254 ms | 70.6 ms | 3.0 MiB | 4 |
| 40 | 437 ms | 438 ms | 137 ms | 6.0 MiB | 2 |
| 80 | 817 ms | 821 ms | 254 ms | 11.8 MiB | 1 |
| 160 | 1.59 s | 1.60 s | 485 ms | 23.6 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 2.24 s | 2.25 s | 205 ms | 11.8 MiB | 0 |
| 2 | 1.22 s | 1.23 s | 229 ms | 11.8 MiB | 1 |
| 4 | 859 ms | 861 ms | 246 ms | 11.8 MiB | 1 |
| 8 | 819 ms | 820 ms | 254 ms | 11.8 MiB | 1 |
| 16 | 822 ms | 823 ms | 250 ms | 11.8 MiB | 1 |

#### Variant `with-hooks`

Both `onEvidence` and `onVerdict` read their argument, as a progress printer or a log writer does.

**Measured: O(n)** (exponent 0.89, 4 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 250 ms | 252 ms | 67.9 ms | 3.0 MiB | 4 |
| 40 | 433 ms | 434 ms | 138 ms | 6.0 MiB | 2 |
| 80 | 819 ms | 829 ms | 254 ms | 11.8 MiB | 1 |
| 160 | 1.60 s | 1.60 s | 480 ms | 23.6 MiB | 1 |

##### Varying `concurrency`

How many checks run at a time.

**Expected: O(1).** More checks running at once never makes a run take longer; it shortens it until the machine's cores are busy, so the cost does not grow with it.

| concurrencys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 2.24 s | 2.25 s | 205 ms | 11.8 MiB | 0 |
| 2 | 1.21 s | 1.23 s | 230 ms | 11.8 MiB | 1 |
| 4 | 865 ms | 866 ms | 253 ms | 11.8 MiB | 1 |
| 8 | 830 ms | 866 ms | 257 ms | 11.8 MiB | 1 |
| 16 | 845 ms | 897 ms | 255 ms | 11.8 MiB | 1 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 804 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 805 ms | 805 ms | 100% |
| `run-repo-contract` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 2560 checks** (whole operation: 24.8 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `run-checks` | 1 | 24.7 s | 24.7 s | 100% |
| _unattributed_ |  |  | 87.2 ms | 0.4% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T22:14:04.310Z` → `2026-11-02T22:30:08.869Z` (965 s), ci: CI (run 41535281642)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `818eb8dd569874b8e9e0fabe99cd5c0ab52dce36` on `chore/deps-sync`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560 checks -- One configured check that spawns a process. 100 is a large real repository's contract (this one runs around forty); the ladder reaches 2,560 to expose how scheduling scales. It stops there, not at 10,240, because every check spawns a real process and larger sizes take minutes per sample.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


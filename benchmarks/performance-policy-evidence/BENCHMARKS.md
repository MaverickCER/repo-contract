# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **141 µs** per operation compared with a bare-minimum baseline (**130%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.03). At list prices that is on the order of **~$0.0001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 141 µs | 29.6 ms |
| Added latency, relative to baseline | 130% | 246% |
| Added CPU time per operation | 336 µs | 33.6 ms |
| Added memory per operation (heap delta) | 331.0 KiB | 42.6 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.0001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 7,079 ops/s | 34 ops/s |

## 1. End-to-end: the package's total impact

Shows what a contract run pays, after the checks have finished, for turning their raw results into structured evidence and a verdict, compared with the bare minimum of parsing each check's output and counting its findings. Neither side runs a process; this is pure CPU on data already in memory, paid once per contract run.

- **Baseline (no package):** Parse each check's JSON output and count its findings by hand -- the least anyone would do to know what the checks said.
- **With the package:** `buildEvidence` assembles the run's evidence record and `runPolicies` evaluates every check's policy against it, with dependency lookups.

Both sides use empty or minimal functions on purpose, so the difference is the package's own cost -- not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| checks evaluated | swept | The tier axis: how many check results are turned into evidence and judged. |
| output per check | fixed at "about 500 bytes" | Output volume is measured as a variant in each function below. |
| policy work | fixed at "reads its own parsed output and its dependencies' evidence" | A real, non-trivial policy; an application's own policy logic adds its own cost on top. |
| dependency lookups | fixed at "about 15% of checks depend on an earlier check" | Exercises the per-check dependency-evidence gathering loop. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

The baseline is an empty or minimal function, so it costs almost nothing and the _relative_ overhead can look enormous (shown as a multiple of the baseline). Read the absolute columns -- time, CPU and dollars added -- they are what a bill and a latency budget are made of.

| checks | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 30.7 µs | 87.9 µs | 57.2 µs | 186% | 243 µs | $0.00012 – $0.0027 |
| 40 | 54.9 µs | 133 µs | 78.2 µs | 143% | 222 µs | $0.00016 – $0.0025 |
| 80 | 109 µs | 250 µs | 141 µs | 130% | 336 µs | $0.00029 – $0.0038 |
| 160 | 208 µs | 482 µs | 273 µs | 131% | 536 µs | $0.00057 – $0.006 |
| 320 | 402 µs | 883 µs | 481 µs | 120% | 708 µs | $0.001 – $0.008 |
| 640 | 789 µs | 1.89 ms | 1.10 ms | 140% | 2.02 ms | $0.0023 – $0.023 |
| 1280 | 1.60 ms | 7.56 ms | 5.96 ms | 374% | 6.38 ms | $0.012 – $0.072 |
| 2560 | 3.09 ms | 10.8 ms | 7.75 ms | 251% | 8.04 ms | $0.016 – $0.090 |
| 5120 | 6.17 ms | 20.3 ms | 14.1 ms | 229% | 16.7 ms | $0.029 – $0.188 |
| 10240 | 12.0 ms | 41.6 ms | 29.6 ms | 246% | 33.6 ms | $0.062 – $0.378 |

**How the total grows:** O(n) (linear), exponent 1.03 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 151 µs | 21.3 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 1.63 ms | 244 ms |
| `runPolicies` (quiet-output) | O(n) | O(n log n) | 🟡 close (neighbouring class) | 59.5 µs | 15.8 ms |
| `runPolicies` (chatty-output) | O(n) | O(n log n) | 🟡 close (neighbouring class) | 80.7 µs | 24.3 ms |

### `buildEvidence`

**Why we benchmark it.** Every contract run assembles one evidence record from all its checks' results; it is the structured, shareable artifact the run produces.

**What poor performance would mean.** Slower contract runs after the tools have already finished, growing with the number of checks and with how much each prints; a super-linear regression would show first in repositories with chatty linters.

**Expected growth: O(n).** It processes each check's result once -- parsing its configured output format and recording one evidence entry -- so cost is proportional to the number of checks and the bytes of output they carry.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| checks evaluated | swept | The tier axis: how many check results are turned into evidence and judged. |
| output per check | variant | How many bytes of parsed JSON output each check produced: a quiet tool (500 B) versus a chatty linter (10 KB). |
| output format | fixed at "json" | Text and YAML outputs take other parsers and are not covered. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once per contract run, before policies are evaluated.

#### Variant `quiet-output`

Each check printed about 500 bytes of JSON.

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 48.1 µs | 57.6 µs | 159 µs | 52.8 KiB | 20,776 |
| 40 | 81.5 µs | 87.3 µs | 207 µs | 104.3 KiB | 12,264 |
| 80 | 151 µs | 204 µs | 348 µs | 211.1 KiB | 6,624 |
| 160 | 290 µs | 344 µs | 615 µs | 436.0 KiB | 3,450 |
| 320 | 645 µs | 928 µs | 1.67 ms | 938.9 KiB | 1,551 |
| 640 | 1.16 ms | 1.34 ms | 2.19 ms | 2.1 MiB | 863 |
| 1280 | 4.08 ms | 4.53 ms | 5.16 ms | 4.7 MiB | 245 |
| 2560 | 6.41 ms | 6.65 ms | 8.07 ms | 8.0 MiB | 156 |
| 5120 | 10.9 ms | 11.2 ms | 12.3 ms | 14.5 MiB | 92 |
| 10240 | 21.3 ms | 21.8 ms | 24.1 ms | 27.5 MiB | 47 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 446 µs | 457 µs | 961 µs | 294.9 KiB | 2,243 |
| 40 | 819 µs | 830 µs | 1.34 ms | 585.9 KiB | 1,221 |
| 80 | 1.63 ms | 1.98 ms | 2.74 ms | 1.1 MiB | 614 |
| 160 | 3.17 ms | 3.30 ms | 4.51 ms | 2.3 MiB | 316 |
| 320 | 6.26 ms | 6.34 ms | 7.91 ms | 4.7 MiB | 160 |
| 640 | 12.5 ms | 13.1 ms | 14.9 ms | 9.8 MiB | 80 |
| 1280 | 27.2 ms | 30.5 ms | 31.7 ms | 20.1 MiB | 37 |
| 2560 | 52.6 ms | 57.3 ms | 61.3 ms | 38.7 MiB | 19 |
| 5120 | 121 ms | 122 ms | 189 ms | 73.5 MiB | 8 |
| 10240 | 244 ms | 249 ms | 380 ms | 145.1 MiB | 4 |

### `runPolicies`

**Why we benchmark it.** It turns evidence into the verdict a contract run reports and exits with; it evaluates every check's policy, which is where a repository's own rules run.

**What poor performance would mean.** Slower verdicts in proportion to the number of checks, and a super-linear dependency lookup would make the largest contracts the slowest to judge.

**Expected growth: O(n).** Each check's policy runs once with a context built from its own result and its dependencies' evidence (looked up in a map), so cost is proportional to the number of checks.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| checks evaluated | swept | The tier axis: how many check results are turned into evidence and judged. |
| output per check | variant | How many bytes of parsed JSON output each check produced: a quiet tool (500 B) versus a chatty linter (10 KB). |
| policy work | fixed at "reads its own parsed output and its dependencies' evidence" | A real, non-trivial policy; an application's own policy logic adds its own cost on top. |
| dependency lookups | fixed at "about 15% of checks depend on an earlier check" | Exercises the per-check dependency-evidence gathering loop. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once per contract run, after evidence is built.

#### Variant `quiet-output`

Each check printed about 500 bytes of JSON.

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 27.0 µs | 36.5 µs | 28.0 µs | 44.6 KiB | 37,069 |
| 40 | 35.2 µs | 48.3 µs | 111 µs | 85.2 KiB | 28,398 |
| 80 | 59.5 µs | 83.3 µs | 166 µs | 172.9 KiB | 16,805 |
| 160 | 117 µs | 173 µs | 309 µs | 359.4 KiB | 8,524 |
| 320 | 252 µs | 369 µs | 676 µs | 792.1 KiB | 3,976 |
| 640 | 519 µs | 693 µs | 1.15 ms | 1.8 MiB | 1,928 |
| 1280 | 2.99 ms | 3.38 ms | 4.84 ms | 4.2 MiB | 335 |
| 2560 | 4.07 ms | 4.33 ms | 6.29 ms | 6.9 MiB | 246 |
| 5120 | 7.00 ms | 7.26 ms | 10.3 ms | 12.3 MiB | 143 |
| 10240 | 15.8 ms | 16.2 ms | 22.3 ms | 22.9 MiB | 63 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.13, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 26.2 µs | 29.8 µs | 26.4 µs | 50.5 KiB | 38,230 |
| 40 | 40.4 µs | 52.5 µs | 113 µs | 99.6 KiB | 24,760 |
| 80 | 80.7 µs | 107 µs | 214 µs | 202.6 KiB | 12,384 |
| 160 | 175 µs | 226 µs | 496 µs | 422.2 KiB | 5,725 |
| 320 | 389 µs | 484 µs | 1.23 ms | 912.5 KiB | 2,571 |
| 640 | 806 µs | 988 µs | 2.11 ms | 2.0 MiB | 1,240 |
| 1280 | 4.56 ms | 4.88 ms | 9.56 ms | 4.6 MiB | 219 |
| 2560 | 6.63 ms | 7.02 ms | 13.9 ms | 7.8 MiB | 151 |
| 5120 | 12.2 ms | 12.8 ms | 25.5 ms | 14.1 MiB | 82 |
| 10240 | 24.3 ms | 25.0 ms | 48.7 ms | 26.3 MiB | 41 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 250 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 151 µs | 151 µs | 60% |
| `run-policies` | 1 | 59.5 µs | 59.5 µs | 24% |
| _unattributed_ |  |  | 39.4 µs | 16% |

**At 10240 checks** (whole operation: 41.6 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 21.3 ms | 21.3 ms | 51% |
| `run-policies` | 1 | 15.8 ms | 15.8 ms | 38% |
| _unattributed_ |  |  | 4.48 ms | 11% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-11T12:55:49.988Z` → `2026-10-11T12:56:10.447Z` (20 s), ci: CI (run 38140543153)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `f31a637ba1b8e8f795006f96def29339f8cd075b` on `docs/accuracy-stage-1a`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


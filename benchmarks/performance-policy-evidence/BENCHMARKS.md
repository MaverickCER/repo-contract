# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **278 µs** per operation compared with a bare-minimum baseline (**130%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 0.99). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 278 µs | 42.8 ms |
| Added latency, relative to baseline | 130% | 194% |
| Added CPU time per operation | 649 µs | 47.8 ms |
| Added memory per operation (heap delta) | 331.6 KiB | 42.1 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,602 ops/s | 23 ops/s |

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
| 20 | 60.9 µs | 180 µs | 119 µs | 196% | 450 µs | $0.00025 – $0.0051 |
| 40 | 111 µs | 270 µs | 160 µs | 145% | 432 µs | $0.00033 – $0.0049 |
| 80 | 213 µs | 491 µs | 278 µs | 130% | 649 µs | $0.00058 – $0.0073 |
| 160 | 427 µs | 975 µs | 548 µs | 129% | 1.28 ms | $0.0011 – $0.014 |
| 320 | 760 µs | 1.72 ms | 963 µs | 127% | 1.69 ms | $0.002 – $0.019 |
| 640 | 1.53 ms | 3.42 ms | 1.89 ms | 124% | 2.40 ms | $0.0039 – $0.027 |
| 1280 | 2.85 ms | 12.6 ms | 9.71 ms | 340% | 10.4 ms | $0.020 – $0.117 |
| 2560 | 5.52 ms | 18.4 ms | 12.9 ms | 233% | 13.1 ms | $0.027 – $0.148 |
| 5120 | 10.9 ms | 32.7 ms | 21.8 ms | 200% | 23.7 ms | $0.045 – $0.267 |
| 10240 | 22.1 ms | 64.9 ms | 42.8 ms | 194% | 47.8 ms | $0.089 – $0.537 |

**How the total grows:** O(n) (linear), exponent 0.99 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 315 µs | 37.0 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.96 ms | 408 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 145 µs | 24.5 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 191 µs | 35.6 ms |

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

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 93.9 µs | 104 µs | 301 µs | 52.9 KiB | 10,645 |
| 40 | 167 µs | 172 µs | 463 µs | 104.5 KiB | 5,998 |
| 80 | 315 µs | 326 µs | 810 µs | 211.4 KiB | 3,175 |
| 160 | 594 µs | 610 µs | 1.35 ms | 436.2 KiB | 1,684 |
| 320 | 1.18 ms | 1.34 ms | 2.67 ms | 938.9 KiB | 848 |
| 640 | 2.13 ms | 2.24 ms | 3.69 ms | 2.1 MiB | 469 |
| 1280 | 7.23 ms | 7.48 ms | 8.88 ms | 4.7 MiB | 138 |
| 2560 | 11.1 ms | 11.4 ms | 13.4 ms | 8.0 MiB | 90 |
| 5120 | 19.4 ms | 21.6 ms | 21.3 ms | 14.5 MiB | 52 |
| 10240 | 37.0 ms | 38.4 ms | 41.1 ms | 27.5 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 794 µs | 807 µs | 1.53 ms | 294.9 KiB | 1,259 |
| 40 | 1.59 ms | 1.61 ms | 3.16 ms | 587.0 KiB | 629 |
| 80 | 2.96 ms | 3.50 ms | 4.69 ms | 1.1 MiB | 338 |
| 160 | 5.71 ms | 6.01 ms | 7.79 ms | 2.3 MiB | 175 |
| 320 | 11.2 ms | 11.2 ms | 13.7 ms | 4.7 MiB | 90 |
| 640 | 22.1 ms | 22.2 ms | 25.7 ms | 9.8 MiB | 45 |
| 1280 | 47.3 ms | 48.9 ms | 53.4 ms | 20.1 MiB | 21 |
| 2560 | 92.0 ms | 95.7 ms | 102 ms | 38.7 MiB | 11 |
| 5120 | 205 ms | 207 ms | 304 ms | 73.5 MiB | 5 |
| 10240 | 408 ms | 410 ms | 611 ms | 145.2 MiB | 2 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 53.7 µs | 68.0 µs | 61.4 µs | 44.5 KiB | 18,639 |
| 40 | 88.2 µs | 107 µs | 273 µs | 85.4 KiB | 11,340 |
| 80 | 145 µs | 190 µs | 468 µs | 174.1 KiB | 6,881 |
| 160 | 269 µs | 381 µs | 795 µs | 365.1 KiB | 3,712 |
| 320 | 529 µs | 569 µs | 1.50 ms | 795.6 KiB | 1,889 |
| 640 | 1.10 ms | 1.54 ms | 2.84 ms | 1.8 MiB | 913 |
| 1280 | 4.92 ms | 5.36 ms | 7.51 ms | 4.2 MiB | 203 |
| 2560 | 6.92 ms | 7.22 ms | 9.72 ms | 6.9 MiB | 145 |
| 5120 | 11.7 ms | 12.9 ms | 15.9 ms | 12.3 MiB | 86 |
| 10240 | 24.5 ms | 32.0 ms | 32.6 ms | 22.8 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 54.8 µs | 63.8 µs | 161 µs | 50.5 KiB | 18,250 |
| 40 | 97.3 µs | 118 µs | 327 µs | 99.8 KiB | 10,276 |
| 80 | 191 µs | 227 µs | 646 µs | 203.0 KiB | 5,243 |
| 160 | 344 µs | 454 µs | 1.10 ms | 422.7 KiB | 2,909 |
| 320 | 703 µs | 877 µs | 2.05 ms | 912.5 KiB | 1,422 |
| 640 | 1.76 ms | 2.13 ms | 5.35 ms | 2.1 MiB | 569 |
| 1280 | 6.67 ms | 6.90 ms | 12.7 ms | 4.6 MiB | 150 |
| 2560 | 9.73 ms | 10.2 ms | 19.9 ms | 7.8 MiB | 103 |
| 5120 | 17.3 ms | 17.8 ms | 35.9 ms | 14.1 MiB | 58 |
| 10240 | 35.6 ms | 36.0 ms | 70.7 ms | 26.0 MiB | 28 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 491 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 315 µs | 315 µs | 64% |
| `run-policies` | 1 | 145 µs | 145 µs | 30% |
| _unattributed_ |  |  | 30.5 µs | 6.2% |

**At 10240 checks** (whole operation: 64.9 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 37.0 ms | 37.0 ms | 57% |
| `run-policies` | 1 | 24.5 ms | 24.5 ms | 38% |
| _unattributed_ |  |  | 3.38 ms | 5.2% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-11T13:46:22.409Z` → `2026-10-11T13:46:50.495Z` (28 s), ci: CI (run 38143695155)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `39e26ace01c5dc958e2e9d884210c9b8c3b74c3d` on `docs/accuracy-stage-1a`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


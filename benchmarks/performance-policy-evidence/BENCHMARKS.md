# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **281 µs** per operation compared with a bare-minimum baseline (**132%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 281 µs | 44.9 ms |
| Added latency, relative to baseline | 132% | 207% |
| Added CPU time per operation | 654 µs | 49.2 ms |
| Added memory per operation (heap delta) | 331.6 KiB | 42.1 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,555 ops/s | 22 ops/s |

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
| 20 | 59.7 µs | 181 µs | 121 µs | 203% | 476 µs | $0.00025 – $0.0054 |
| 40 | 110 µs | 272 µs | 162 µs | 147% | 444 µs | $0.00034 – $0.005 |
| 80 | 213 µs | 494 µs | 281 µs | 132% | 654 µs | $0.00059 – $0.0074 |
| 160 | 424 µs | 857 µs | 433 µs | 102% | 467 µs | $0.0009 – $0.0053 |
| 320 | 755 µs | 1.74 ms | 987 µs | 131% | 1.79 ms | $0.0021 – $0.020 |
| 640 | 1.51 ms | 3.48 ms | 1.97 ms | 130% | 2.45 ms | $0.0041 – $0.028 |
| 1280 | 2.81 ms | 12.8 ms | 9.99 ms | 355% | 10.9 ms | $0.021 – $0.122 |
| 2560 | 5.48 ms | 19.4 ms | 13.9 ms | 254% | 14.6 ms | $0.029 – $0.164 |
| 5120 | 10.9 ms | 34.6 ms | 23.7 ms | 218% | 23.2 ms | $0.049 – $0.260 |
| 10240 | 21.7 ms | 66.6 ms | 44.9 ms | 207% | 49.2 ms | $0.093 – $0.554 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 314 µs | 38.7 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.94 ms | 409 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 144 µs | 23.4 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 169 µs | 35.0 ms |

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
| 20 | 98.7 µs | 107 µs | 343 µs | 52.9 KiB | 10,134 |
| 40 | 166 µs | 187 µs | 460 µs | 104.5 KiB | 6,012 |
| 80 | 314 µs | 327 µs | 804 µs | 211.4 KiB | 3,189 |
| 160 | 595 µs | 626 µs | 1.34 ms | 436.2 KiB | 1,682 |
| 320 | 1.19 ms | 1.25 ms | 2.72 ms | 938.9 KiB | 841 |
| 640 | 2.18 ms | 2.37 ms | 3.75 ms | 2.1 MiB | 459 |
| 1280 | 7.23 ms | 7.68 ms | 8.98 ms | 4.7 MiB | 138 |
| 2560 | 11.4 ms | 13.8 ms | 13.7 ms | 8.0 MiB | 88 |
| 5120 | 19.8 ms | 21.7 ms | 22.3 ms | 14.5 MiB | 50 |
| 10240 | 38.7 ms | 38.8 ms | 42.4 ms | 27.6 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 808 µs | 847 µs | 1.58 ms | 294.9 KiB | 1,237 |
| 40 | 1.58 ms | 1.61 ms | 3.15 ms | 587.0 KiB | 632 |
| 80 | 2.94 ms | 3.50 ms | 4.64 ms | 1.1 MiB | 340 |
| 160 | 5.65 ms | 5.72 ms | 7.60 ms | 2.3 MiB | 177 |
| 320 | 11.0 ms | 11.5 ms | 13.5 ms | 4.7 MiB | 91 |
| 640 | 21.9 ms | 22.1 ms | 25.2 ms | 9.8 MiB | 46 |
| 1280 | 46.8 ms | 49.1 ms | 52.6 ms | 20.1 MiB | 21 |
| 2560 | 91.0 ms | 101 ms | 102 ms | 38.7 MiB | 11 |
| 5120 | 205 ms | 206 ms | 304 ms | 73.5 MiB | 5 |
| 10240 | 409 ms | 411 ms | 612 ms | 145.1 MiB | 2 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 54.1 µs | 65.8 µs | 55.0 µs | 44.6 KiB | 18,489 |
| 40 | 90.7 µs | 106 µs | 299 µs | 85.4 KiB | 11,027 |
| 80 | 144 µs | 186 µs | 471 µs | 174.1 KiB | 6,960 |
| 160 | 273 µs | 378 µs | 784 µs | 365.1 KiB | 3,669 |
| 320 | 575 µs | 735 µs | 1.50 ms | 797.4 KiB | 1,740 |
| 640 | 1.15 ms | 1.50 ms | 2.89 ms | 1.8 MiB | 872 |
| 1280 | 5.21 ms | 5.54 ms | 7.57 ms | 4.2 MiB | 192 |
| 2560 | 7.68 ms | 8.06 ms | 10.4 ms | 6.9 MiB | 130 |
| 5120 | 12.1 ms | 13.8 ms | 16.8 ms | 12.3 MiB | 83 |
| 10240 | 23.4 ms | 25.8 ms | 31.8 ms | 23.0 MiB | 43 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 52.7 µs | 56.2 µs | 212 µs | 50.5 KiB | 18,987 |
| 40 | 88.5 µs | 109 µs | 295 µs | 99.7 KiB | 11,302 |
| 80 | 169 µs | 222 µs | 516 µs | 202.8 KiB | 5,902 |
| 160 | 358 µs | 442 µs | 1.08 ms | 422.7 KiB | 2,793 |
| 320 | 670 µs | 877 µs | 1.99 ms | 910.9 KiB | 1,492 |
| 640 | 1.64 ms | 2.06 ms | 5.15 ms | 2.1 MiB | 609 |
| 1280 | 6.29 ms | 6.51 ms | 12.3 ms | 4.6 MiB | 159 |
| 2560 | 9.76 ms | 10.3 ms | 19.8 ms | 7.8 MiB | 102 |
| 5120 | 17.9 ms | 18.9 ms | 36.5 ms | 14.1 MiB | 56 |
| 10240 | 35.0 ms | 35.2 ms | 69.6 ms | 26.1 MiB | 29 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 494 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 314 µs | 314 µs | 63% |
| `run-policies` | 1 | 144 µs | 144 µs | 29% |
| _unattributed_ |  |  | 36.6 µs | 7.4% |

**At 10240 checks** (whole operation: 66.6 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 38.7 ms | 38.7 ms | 58% |
| `run-policies` | 1 | 23.4 ms | 23.4 ms | 35% |
| _unattributed_ |  |  | 4.48 ms | 6.7% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-10T21:55:21.408Z` → `2026-10-10T21:55:49.711Z` (28 s), ci: CI (run 38088655062)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `efd08e1bd5a06407327490a44a87d4b6ea7b1e76` on `docs/accuracy-stage-1a`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


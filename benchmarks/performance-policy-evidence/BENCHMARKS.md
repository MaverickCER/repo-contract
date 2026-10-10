# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **283 µs** per operation compared with a bare-minimum baseline (**134%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 0.98). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 283 µs | 39.8 ms |
| Added latency, relative to baseline | 134% | 181% |
| Added CPU time per operation | 671 µs | 43.0 ms |
| Added memory per operation (heap delta) | 331.6 KiB | 42.2 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,539 ops/s | 25 ops/s |

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
| 20 | 59.6 µs | 183 µs | 123 µs | 207% | 481 µs | $0.00026 – $0.0054 |
| 40 | 115 µs | 274 µs | 159 µs | 139% | 411 µs | $0.00033 – $0.0046 |
| 80 | 210 µs | 493 µs | 283 µs | 134% | 671 µs | $0.00059 – $0.0075 |
| 160 | 429 µs | 864 µs | 436 µs | 102% | 439 µs | $0.00091 – $0.0049 |
| 320 | 763 µs | 1.75 ms | 989 µs | 130% | 1.78 ms | $0.0021 – $0.020 |
| 640 | 1.53 ms | 3.37 ms | 1.84 ms | 121% | 2.14 ms | $0.0038 – $0.024 |
| 1280 | 2.85 ms | 12.6 ms | 9.77 ms | 343% | 10.3 ms | $0.020 – $0.115 |
| 2560 | 5.57 ms | 18.9 ms | 13.3 ms | 239% | 14.0 ms | $0.028 – $0.157 |
| 5120 | 11.1 ms | 33.3 ms | 22.2 ms | 201% | 24.2 ms | $0.046 – $0.272 |
| 10240 | 21.9 ms | 61.7 ms | 39.8 ms | 181% | 43.0 ms | $0.083 – $0.483 |

**How the total grows:** O(n) (linear), exponent 0.98 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 325 µs | 37.8 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 3.01 ms | 408 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 132 µs | 24.3 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 174 µs | 35.2 ms |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 92.7 µs | 95.2 µs | 285 µs | 52.9 KiB | 10,793 |
| 40 | 175 µs | 188 µs | 511 µs | 104.6 KiB | 5,707 |
| 80 | 325 µs | 344 µs | 819 µs | 211.4 KiB | 3,081 |
| 160 | 608 µs | 630 µs | 1.35 ms | 436.2 KiB | 1,643 |
| 320 | 1.21 ms | 1.29 ms | 2.72 ms | 938.9 KiB | 825 |
| 640 | 2.21 ms | 2.47 ms | 3.75 ms | 2.1 MiB | 452 |
| 1280 | 7.19 ms | 10.1 ms | 8.76 ms | 4.7 MiB | 139 |
| 2560 | 11.6 ms | 11.8 ms | 13.7 ms | 8.0 MiB | 86 |
| 5120 | 19.9 ms | 22.1 ms | 21.9 ms | 14.5 MiB | 50 |
| 10240 | 37.8 ms | 38.2 ms | 40.9 ms | 27.6 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 791 µs | 802 µs | 1.55 ms | 294.9 KiB | 1,264 |
| 40 | 1.62 ms | 1.64 ms | 3.19 ms | 587.0 KiB | 618 |
| 80 | 3.01 ms | 3.53 ms | 4.70 ms | 1.1 MiB | 332 |
| 160 | 5.82 ms | 5.88 ms | 7.74 ms | 2.3 MiB | 172 |
| 320 | 11.3 ms | 14.9 ms | 13.6 ms | 4.7 MiB | 88 |
| 640 | 22.5 ms | 22.7 ms | 25.7 ms | 9.8 MiB | 44 |
| 1280 | 48.2 ms | 49.6 ms | 53.3 ms | 20.1 MiB | 21 |
| 2560 | 93.1 ms | 99.0 ms | 103 ms | 38.7 MiB | 11 |
| 5120 | 211 ms | 211 ms | 309 ms | 73.5 MiB | 5 |
| 10240 | 408 ms | 409 ms | 610 ms | 145.2 MiB | 2 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 50.9 µs | 59.4 µs | 53.8 µs | 43.6 KiB | 19,633 |
| 40 | 87.4 µs | 95.8 µs | 275 µs | 85.4 KiB | 11,447 |
| 80 | 132 µs | 159 µs | 409 µs | 174.0 KiB | 7,562 |
| 160 | 271 µs | 304 µs | 859 µs | 365.1 KiB | 3,689 |
| 320 | 515 µs | 626 µs | 1.42 ms | 782.9 KiB | 1,943 |
| 640 | 1.09 ms | 1.26 ms | 2.77 ms | 1.8 MiB | 920 |
| 1280 | 4.96 ms | 5.34 ms | 7.17 ms | 4.2 MiB | 201 |
| 2560 | 6.79 ms | 7.17 ms | 9.70 ms | 6.9 MiB | 147 |
| 5120 | 11.2 ms | 11.9 ms | 15.1 ms | 12.3 MiB | 89 |
| 10240 | 24.3 ms | 27.8 ms | 32.4 ms | 23.0 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 55.1 µs | 59.2 µs | 214 µs | 50.5 KiB | 18,155 |
| 40 | 95.4 µs | 114 µs | 327 µs | 99.8 KiB | 10,477 |
| 80 | 174 µs | 225 µs | 533 µs | 202.8 KiB | 5,761 |
| 160 | 399 µs | 456 µs | 1.39 ms | 423.8 KiB | 2,504 |
| 320 | 672 µs | 884 µs | 1.99 ms | 912.5 KiB | 1,487 |
| 640 | 1.55 ms | 1.87 ms | 4.98 ms | 2.1 MiB | 644 |
| 1280 | 6.20 ms | 6.57 ms | 12.2 ms | 4.6 MiB | 161 |
| 2560 | 10.2 ms | 12.2 ms | 20.9 ms | 7.8 MiB | 98 |
| 5120 | 17.7 ms | 18.3 ms | 36.1 ms | 14.1 MiB | 56 |
| 10240 | 35.2 ms | 36.1 ms | 69.7 ms | 26.3 MiB | 28 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 493 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 325 µs | 325 µs | 66% |
| `run-policies` | 1 | 132 µs | 132 µs | 27% |
| _unattributed_ |  |  | 35.9 µs | 7.3% |

**At 10240 checks** (whole operation: 61.7 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 37.8 ms | 37.8 ms | 61% |
| `run-policies` | 1 | 24.3 ms | 24.3 ms | 39% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-10T20:38:37.784Z` → `2026-10-10T20:39:05.869Z` (28 s), ci: CI (run 38083678195)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `0785f97f00513ca9944ed5c751d58a918a7a5492` on `docs/accuracy-stage-1a`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


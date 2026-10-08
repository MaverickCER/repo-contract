# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **289 µs** per operation compared with a bare-minimum baseline (**134%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 0.97). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 289 µs | 45.7 ms |
| Added latency, relative to baseline | 134% | 203% |
| Added CPU time per operation | 679 µs | 50.0 ms |
| Added memory per operation (heap delta) | 320.1 KiB | 40.9 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,456 ops/s | 22 ops/s |

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
| 20 | 64.7 µs | 182 µs | 117 µs | 181% | 459 µs | $0.00024 – $0.0052 |
| 40 | 118 µs | 279 µs | 161 µs | 137% | 424 µs | $0.00034 – $0.0048 |
| 80 | 215 µs | 505 µs | 289 µs | 134% | 679 µs | $0.0006 – $0.0076 |
| 160 | 436 µs | 1.01 ms | 574 µs | 132% | 1.32 ms | $0.0012 – $0.015 |
| 320 | 774 µs | 1.88 ms | 1.11 ms | 143% | 1.90 ms | $0.0023 – $0.021 |
| 640 | 1.56 ms | 3.81 ms | 2.25 ms | 144% | 2.71 ms | $0.0047 – $0.030 |
| 1280 | 2.94 ms | 13.9 ms | 11.0 ms | 374% | 11.9 ms | $0.023 – $0.134 |
| 2560 | 5.79 ms | 21.2 ms | 15.4 ms | 265% | 16.3 ms | $0.032 – $0.183 |
| 5120 | 11.9 ms | 37.0 ms | 25.1 ms | 211% | 27.1 ms | $0.052 – $0.305 |
| 10240 | 22.5 ms | 68.2 ms | 45.7 ms | 203% | 50.0 ms | $0.095 – $0.563 |

**How the total grows:** O(n) (linear), exponent 0.97 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 303 µs | 38.5 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.93 ms | 405 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 141 µs | 26.8 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 254 µs | 37.7 ms |

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
| 20 | 95.5 µs | 105 µs | 353 µs | 49.3 KiB | 10,466 |
| 40 | 171 µs | 185 µs | 558 µs | 97.5 KiB | 5,843 |
| 80 | 303 µs | 319 µs | 819 µs | 197.7 KiB | 3,302 |
| 160 | 576 µs | 616 µs | 1.37 ms | 409.1 KiB | 1,737 |
| 320 | 1.17 ms | 1.23 ms | 2.78 ms | 884.8 KiB | 856 |
| 640 | 2.17 ms | 2.30 ms | 3.88 ms | 2.0 MiB | 461 |
| 1280 | 7.40 ms | 7.71 ms | 9.33 ms | 4.5 MiB | 135 |
| 2560 | 11.6 ms | 13.3 ms | 13.9 ms | 7.7 MiB | 86 |
| 5120 | 20.8 ms | 22.3 ms | 22.8 ms | 13.7 MiB | 48 |
| 10240 | 38.5 ms | 39.1 ms | 42.3 ms | 26.0 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 790 µs | 808 µs | 1.62 ms | 290.7 KiB | 1,266 |
| 40 | 1.57 ms | 1.60 ms | 3.30 ms | 578.7 KiB | 638 |
| 80 | 2.93 ms | 3.56 ms | 4.94 ms | 1.1 MiB | 341 |
| 160 | 5.61 ms | 5.86 ms | 7.90 ms | 2.3 MiB | 178 |
| 320 | 10.9 ms | 11.2 ms | 13.7 ms | 4.7 MiB | 92 |
| 640 | 21.7 ms | 21.9 ms | 25.6 ms | 9.7 MiB | 46 |
| 1280 | 46.7 ms | 49.1 ms | 53.3 ms | 19.9 MiB | 21 |
| 2560 | 89.4 ms | 96.0 ms | 101 ms | 38.2 MiB | 11 |
| 5120 | 205 ms | 205 ms | 306 ms | 72.6 MiB | 5 |
| 10240 | 405 ms | 408 ms | 612 ms | 143.6 MiB | 2 |

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
| 20 | 53.4 µs | 77.5 µs | 59.0 µs | 45.1 KiB | 18,718 |
| 40 | 73.1 µs | 106 µs | 250 µs | 86.3 KiB | 13,677 |
| 80 | 141 µs | 183 µs | 448 µs | 176.0 KiB | 7,071 |
| 160 | 269 µs | 378 µs | 792 µs | 368.8 KiB | 3,714 |
| 320 | 585 µs | 814 µs | 1.60 ms | 794.9 KiB | 1,710 |
| 640 | 1.42 ms | 1.87 ms | 3.36 ms | 1.8 MiB | 705 |
| 1280 | 5.26 ms | 5.89 ms | 7.98 ms | 4.2 MiB | 190 |
| 2560 | 8.30 ms | 9.12 ms | 11.4 ms | 7.0 MiB | 120 |
| 5120 | 14.1 ms | 14.6 ms | 19.0 ms | 12.4 MiB | 71 |
| 10240 | 26.8 ms | 27.5 ms | 35.4 ms | 23.1 MiB | 37 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 65.9 µs | 78.9 µs | 75.4 µs | 51.3 KiB | 15,176 |
| 40 | 108 µs | 129 µs | 380 µs | 100.9 KiB | 9,248 |
| 80 | 254 µs | 288 µs | 873 µs | 205.2 KiB | 3,932 |
| 160 | 473 µs | 594 µs | 1.61 ms | 427.4 KiB | 2,116 |
| 320 | 1.13 ms | 1.31 ms | 3.93 ms | 925.5 KiB | 884 |
| 640 | 2.15 ms | 2.58 ms | 6.14 ms | 2.1 MiB | 465 |
| 1280 | 7.28 ms | 8.29 ms | 13.5 ms | 4.7 MiB | 137 |
| 2560 | 10.4 ms | 11.3 ms | 21.1 ms | 7.8 MiB | 96 |
| 5120 | 19.4 ms | 20.3 ms | 38.2 ms | 14.2 MiB | 52 |
| 10240 | 37.7 ms | 38.9 ms | 74.1 ms | 26.7 MiB | 27 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 505 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 303 µs | 303 µs | 60% |
| `run-policies` | 1 | 141 µs | 141 µs | 28% |
| _unattributed_ |  |  | 60.6 µs | 12% |

**At 10240 checks** (whole operation: 68.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 38.5 ms | 38.5 ms | 56% |
| `run-policies` | 1 | 26.8 ms | 26.8 ms | 39% |
| _unattributed_ |  |  | 2.96 ms | 4.3% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-08T07:05:46.348Z` → `2026-10-08T07:06:15.182Z` (29 s), ci: CI (run 37740006426)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `d83c5e1e5278cff51f73097658ca69730b004ef0` on `chore/vitest-5`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


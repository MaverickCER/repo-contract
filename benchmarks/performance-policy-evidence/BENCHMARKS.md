# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **286 µs** per operation compared with a bare-minimum baseline (**141%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 0.99). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 286 µs | 43.2 ms |
| Added latency, relative to baseline | 141% | 197% |
| Added CPU time per operation | 738 µs | 48.3 ms |
| Added memory per operation (heap delta) | 331.7 KiB | 42.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,498 ops/s | 23 ops/s |

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
| 20 | 61.0 µs | 179 µs | 118 µs | 194% | 464 µs | $0.00025 – $0.0052 |
| 40 | 115 µs | 267 µs | 152 µs | 132% | 375 µs | $0.00032 – $0.0042 |
| 80 | 202 µs | 488 µs | 286 µs | 141% | 738 µs | $0.0006 – $0.0083 |
| 160 | 423 µs | 976 µs | 553 µs | 131% | 1.33 ms | $0.0012 – $0.015 |
| 320 | 761 µs | 1.74 ms | 976 µs | 128% | 1.74 ms | $0.002 – $0.020 |
| 640 | 1.53 ms | 3.42 ms | 1.89 ms | 123% | 2.23 ms | $0.0039 – $0.025 |
| 1280 | 2.84 ms | 12.5 ms | 9.63 ms | 339% | 10.2 ms | $0.020 – $0.115 |
| 2560 | 5.53 ms | 18.6 ms | 13.1 ms | 236% | 13.5 ms | $0.027 – $0.151 |
| 5120 | 10.9 ms | 33.5 ms | 22.6 ms | 207% | 27.1 ms | $0.047 – $0.304 |
| 10240 | 21.9 ms | 65.1 ms | 43.2 ms | 197% | 48.3 ms | $0.090 – $0.543 |

**How the total grows:** O(n) (linear), exponent 0.99 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 309 µs | 36.6 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.95 ms | 407 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 131 µs | 24.9 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 188 µs | 33.9 ms |

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
| 20 | 91.5 µs | 99.4 µs | 294 µs | 52.9 KiB | 10,934 |
| 40 | 162 µs | 180 µs | 442 µs | 104.5 KiB | 6,167 |
| 80 | 309 µs | 326 µs | 763 µs | 211.4 KiB | 3,238 |
| 160 | 593 µs | 611 µs | 1.35 ms | 436.2 KiB | 1,688 |
| 320 | 1.18 ms | 1.21 ms | 2.70 ms | 938.9 KiB | 851 |
| 640 | 2.14 ms | 2.30 ms | 3.61 ms | 2.1 MiB | 467 |
| 1280 | 7.08 ms | 7.56 ms | 8.71 ms | 4.7 MiB | 141 |
| 2560 | 11.1 ms | 14.3 ms | 12.5 ms | 8.0 MiB | 90 |
| 5120 | 19.8 ms | 21.3 ms | 21.8 ms | 14.5 MiB | 50 |
| 10240 | 36.6 ms | 37.0 ms | 40.6 ms | 27.6 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 800 µs | 818 µs | 1.57 ms | 294.9 KiB | 1,250 |
| 40 | 1.59 ms | 2.01 ms | 3.19 ms | 587.0 KiB | 627 |
| 80 | 2.95 ms | 3.49 ms | 4.67 ms | 1.1 MiB | 339 |
| 160 | 5.64 ms | 5.75 ms | 7.57 ms | 2.3 MiB | 177 |
| 320 | 11.0 ms | 11.3 ms | 13.4 ms | 4.7 MiB | 91 |
| 640 | 21.9 ms | 22.3 ms | 25.2 ms | 9.8 MiB | 46 |
| 1280 | 46.8 ms | 49.0 ms | 52.2 ms | 20.1 MiB | 21 |
| 2560 | 90.3 ms | 96.5 ms | 99.7 ms | 38.7 MiB | 11 |
| 5120 | 205 ms | 207 ms | 303 ms | 73.5 MiB | 5 |
| 10240 | 407 ms | 410 ms | 607 ms | 145.2 MiB | 2 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 45.4 µs | 53.7 µs | 48.0 µs | 43.4 KiB | 22,039 |
| 40 | 81.2 µs | 92.6 µs | 245 µs | 85.3 KiB | 12,310 |
| 80 | 131 µs | 180 µs | 389 µs | 174.0 KiB | 7,637 |
| 160 | 269 µs | 374 µs | 820 µs | 365.1 KiB | 3,715 |
| 320 | 534 µs | 727 µs | 1.49 ms | 795.6 KiB | 1,873 |
| 640 | 1.09 ms | 1.52 ms | 2.79 ms | 1.8 MiB | 922 |
| 1280 | 4.86 ms | 5.30 ms | 7.50 ms | 4.2 MiB | 206 |
| 2560 | 6.98 ms | 7.39 ms | 9.92 ms | 6.9 MiB | 143 |
| 5120 | 11.7 ms | 12.8 ms | 15.9 ms | 12.3 MiB | 85 |
| 10240 | 24.9 ms | 25.2 ms | 32.9 ms | 22.9 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 53.4 µs | 57.5 µs | 212 µs | 50.5 KiB | 18,710 |
| 40 | 89.9 µs | 98.5 µs | 295 µs | 99.7 KiB | 11,124 |
| 80 | 188 µs | 221 µs | 637 µs | 203.0 KiB | 5,331 |
| 160 | 342 µs | 446 µs | 1.07 ms | 422.7 KiB | 2,921 |
| 320 | 670 µs | 874 µs | 2.01 ms | 912.5 KiB | 1,492 |
| 640 | 1.58 ms | 1.87 ms | 5.10 ms | 2.1 MiB | 632 |
| 1280 | 6.20 ms | 6.52 ms | 12.2 ms | 4.6 MiB | 161 |
| 2560 | 9.34 ms | 10.1 ms | 19.7 ms | 7.8 MiB | 107 |
| 5120 | 17.1 ms | 18.7 ms | 35.4 ms | 14.1 MiB | 58 |
| 10240 | 33.9 ms | 34.5 ms | 68.2 ms | 26.2 MiB | 29 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 488 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 309 µs | 309 µs | 63% |
| `run-policies` | 1 | 131 µs | 131 µs | 27% |
| _unattributed_ |  |  | 48.5 µs | 9.9% |

**At 10240 checks** (whole operation: 65.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 36.6 ms | 36.6 ms | 56% |
| `run-policies` | 1 | 24.9 ms | 24.9 ms | 38% |
| _unattributed_ |  |  | 3.58 ms | 5.5% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-09T18:43:26.870Z` → `2026-10-09T18:43:54.939Z` (28 s), ci: CI (run 37973820326)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `480224ed5db4992705b22a1ac333d06fcf8fcc8e` on `fix/verify-builds-the-generated-docs`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


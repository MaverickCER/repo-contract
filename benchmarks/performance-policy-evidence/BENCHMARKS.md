# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **261 µs** per operation compared with a bare-minimum baseline (**122%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 0.99). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 261 µs | 46.5 ms |
| Added latency, relative to baseline | 122% | 212% |
| Added CPU time per operation | 622 µs | 51.1 ms |
| Added memory per operation (heap delta) | 320.1 KiB | 40.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,831 ops/s | 22 ops/s |

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
| 20 | 60.4 µs | 171 µs | 111 µs | 184% | 471 µs | $0.00023 – $0.0053 |
| 40 | 111 µs | 264 µs | 153 µs | 138% | 432 µs | $0.00032 – $0.0049 |
| 80 | 213 µs | 474 µs | 261 µs | 122% | 622 µs | $0.00054 – $0.007 |
| 160 | 400 µs | 838 µs | 438 µs | 109% | 694 µs | $0.00091 – $0.0078 |
| 320 | 861 µs | 1.69 ms | 833 µs | 97% | 901 µs | $0.0017 – $0.010 |
| 640 | 1.52 ms | 3.49 ms | 1.97 ms | 129% | 2.45 ms | $0.0041 – $0.028 |
| 1280 | 2.87 ms | 13.3 ms | 10.4 ms | 363% | 11.0 ms | $0.022 – $0.124 |
| 2560 | 5.58 ms | 18.9 ms | 13.3 ms | 238% | 14.4 ms | $0.028 – $0.162 |
| 5120 | 11.1 ms | 33.6 ms | 22.5 ms | 203% | 25.4 ms | $0.047 – $0.285 |
| 10240 | 21.9 ms | 68.3 ms | 46.5 ms | 212% | 51.1 ms | $0.097 – $0.575 |

**How the total grows:** O(n) (linear), exponent 0.99 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 299 µs | 36.9 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.91 ms | 411 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 148 µs | 26.5 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 191 µs | 37.9 ms |

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
| 20 | 85.8 µs | 92.3 µs | 269 µs | 49.3 KiB | 11,655 |
| 40 | 157 µs | 171 µs | 450 µs | 97.5 KiB | 6,351 |
| 80 | 299 µs | 305 µs | 788 µs | 197.7 KiB | 3,349 |
| 160 | 559 µs | 589 µs | 1.30 ms | 409.1 KiB | 1,789 |
| 320 | 1.12 ms | 1.22 ms | 2.65 ms | 884.8 KiB | 893 |
| 640 | 2.06 ms | 2.18 ms | 3.63 ms | 2.0 MiB | 486 |
| 1280 | 7.00 ms | 7.43 ms | 8.63 ms | 4.5 MiB | 143 |
| 2560 | 11.0 ms | 11.4 ms | 13.1 ms | 7.7 MiB | 91 |
| 5120 | 19.4 ms | 19.7 ms | 20.8 ms | 13.7 MiB | 51 |
| 10240 | 36.9 ms | 37.3 ms | 41.0 ms | 25.9 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 782 µs | 794 µs | 1.55 ms | 290.7 KiB | 1,278 |
| 40 | 1.56 ms | 1.67 ms | 3.14 ms | 578.7 KiB | 640 |
| 80 | 2.91 ms | 3.46 ms | 4.63 ms | 1.1 MiB | 343 |
| 160 | 5.56 ms | 5.74 ms | 7.53 ms | 2.3 MiB | 180 |
| 320 | 10.9 ms | 11.0 ms | 13.3 ms | 4.7 MiB | 92 |
| 640 | 21.7 ms | 21.8 ms | 25.1 ms | 9.7 MiB | 46 |
| 1280 | 46.4 ms | 48.3 ms | 52.3 ms | 19.9 MiB | 22 |
| 2560 | 89.4 ms | 94.4 ms | 99.1 ms | 38.2 MiB | 11 |
| 5120 | 206 ms | 208 ms | 312 ms | 72.6 MiB | 5 |
| 10240 | 411 ms | 418 ms | 632 ms | 143.6 MiB | 2 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 52.6 µs | 66.0 µs | 56.3 µs | 45.1 KiB | 19,026 |
| 40 | 78.2 µs | 101 µs | 250 µs | 86.3 KiB | 12,788 |
| 80 | 148 µs | 188 µs | 471 µs | 176.0 KiB | 6,744 |
| 160 | 271 µs | 366 µs | 780 µs | 368.8 KiB | 3,696 |
| 320 | 543 µs | 746 µs | 1.53 ms | 803.8 KiB | 1,842 |
| 640 | 1.17 ms | 1.57 ms | 2.89 ms | 1.8 MiB | 853 |
| 1280 | 5.26 ms | 5.75 ms | 7.69 ms | 4.2 MiB | 190 |
| 2560 | 7.77 ms | 8.24 ms | 10.7 ms | 7.0 MiB | 129 |
| 5120 | 13.7 ms | 14.6 ms | 18.1 ms | 12.4 MiB | 73 |
| 10240 | 26.5 ms | 29.3 ms | 36.1 ms | 23.1 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 55.2 µs | 65.0 µs | 59.0 µs | 51.2 KiB | 18,119 |
| 40 | 98.6 µs | 113 µs | 325 µs | 100.8 KiB | 10,138 |
| 80 | 191 µs | 237 µs | 643 µs | 204.9 KiB | 5,241 |
| 160 | 361 µs | 456 µs | 1.11 ms | 426.3 KiB | 2,770 |
| 320 | 749 µs | 969 µs | 2.06 ms | 909.9 KiB | 1,335 |
| 640 | 1.86 ms | 2.32 ms | 5.45 ms | 2.1 MiB | 538 |
| 1280 | 7.14 ms | 7.54 ms | 13.3 ms | 4.7 MiB | 140 |
| 2560 | 10.6 ms | 11.7 ms | 21.5 ms | 7.8 MiB | 94 |
| 5120 | 18.7 ms | 19.6 ms | 38.1 ms | 14.2 MiB | 53 |
| 10240 | 37.9 ms | 40.0 ms | 74.1 ms | 26.7 MiB | 26 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 474 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 299 µs | 299 µs | 63% |
| `run-policies` | 1 | 148 µs | 148 µs | 31% |
| _unattributed_ |  |  | 27.5 µs | 5.8% |

**At 10240 checks** (whole operation: 68.3 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 36.9 ms | 36.9 ms | 54% |
| `run-policies` | 1 | 26.5 ms | 26.5 ms | 39% |
| _unattributed_ |  |  | 4.91 ms | 7.2% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-06T16:21:03.131Z` → `2026-10-06T16:21:31.440Z` (28 s), ci: CI (run 37493164518)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `be604bb86592b8a22b30a3696d9616dbfee0db0a` on `fix/v1-audit`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


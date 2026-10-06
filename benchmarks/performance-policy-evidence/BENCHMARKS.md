# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **255 µs** per operation compared with a bare-minimum baseline (**119%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 0.99). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 255 µs | 38.3 ms |
| Added latency, relative to baseline | 119% | 176% |
| Added CPU time per operation | 629 µs | 43.0 ms |
| Added memory per operation (heap delta) | 320.1 KiB | 41.1 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,925 ops/s | 26 ops/s |

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
| 20 | 61.7 µs | 150 µs | 88.6 µs | 143% | 303 µs | $0.00018 – $0.0034 |
| 40 | 116 µs | 261 µs | 145 µs | 125% | 390 µs | $0.0003 – $0.0044 |
| 80 | 215 µs | 470 µs | 255 µs | 119% | 629 µs | $0.00053 – $0.0071 |
| 160 | 433 µs | 936 µs | 502 µs | 116% | 1.20 ms | $0.001 – $0.014 |
| 320 | 776 µs | 1.66 ms | 887 µs | 114% | 1.67 ms | $0.0018 – $0.019 |
| 640 | 1.55 ms | 3.19 ms | 1.64 ms | 105% | 1.99 ms | $0.0034 – $0.022 |
| 1280 | 2.89 ms | 12.2 ms | 9.26 ms | 320% | 9.73 ms | $0.019 – $0.109 |
| 2560 | 5.59 ms | 17.8 ms | 12.2 ms | 219% | 12.5 ms | $0.025 – $0.140 |
| 5120 | 11.0 ms | 31.6 ms | 20.7 ms | 188% | 23.2 ms | $0.043 – $0.261 |
| 10240 | 21.8 ms | 60.1 ms | 38.3 ms | 176% | 43.0 ms | $0.080 – $0.483 |

**How the total grows:** O(n) (linear), exponent 0.99 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 296 µs | 34.8 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.93 ms | 410 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 152 µs | 24.2 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 168 µs | 34.5 ms |

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
| 20 | 81.0 µs | 84.2 µs | 242 µs | 49.2 KiB | 12,347 |
| 40 | 155 µs | 159 µs | 444 µs | 97.5 KiB | 6,466 |
| 80 | 296 µs | 301 µs | 779 µs | 197.7 KiB | 3,383 |
| 160 | 548 µs | 620 µs | 1.27 ms | 409.1 KiB | 1,826 |
| 320 | 1.11 ms | 1.23 ms | 2.60 ms | 884.8 KiB | 904 |
| 640 | 2.02 ms | 2.15 ms | 3.60 ms | 2.0 MiB | 495 |
| 1280 | 6.87 ms | 7.22 ms | 8.47 ms | 4.5 MiB | 146 |
| 2560 | 11.5 ms | 12.5 ms | 13.2 ms | 7.7 MiB | 87 |
| 5120 | 18.5 ms | 18.7 ms | 19.8 ms | 13.7 MiB | 54 |
| 10240 | 34.8 ms | 35.2 ms | 38.1 ms | 26.0 MiB | 29 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 792 µs | 804 µs | 1.53 ms | 290.7 KiB | 1,263 |
| 40 | 1.57 ms | 1.59 ms | 3.14 ms | 578.7 KiB | 637 |
| 80 | 2.93 ms | 3.41 ms | 4.61 ms | 1.1 MiB | 342 |
| 160 | 5.64 ms | 5.72 ms | 7.55 ms | 2.3 MiB | 177 |
| 320 | 11.0 ms | 11.2 ms | 13.4 ms | 4.7 MiB | 91 |
| 640 | 21.8 ms | 21.8 ms | 25.0 ms | 9.7 MiB | 46 |
| 1280 | 46.6 ms | 48.5 ms | 52.1 ms | 19.9 MiB | 21 |
| 2560 | 90.1 ms | 97.9 ms | 99.8 ms | 38.2 MiB | 11 |
| 5120 | 205 ms | 207 ms | 301 ms | 72.6 MiB | 5 |
| 10240 | 410 ms | 410 ms | 611 ms | 143.6 MiB | 2 |

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
| 20 | 50.6 µs | 59.0 µs | 80.7 µs | 45.0 KiB | 19,769 |
| 40 | 87.0 µs | 96.5 µs | 250 µs | 86.3 KiB | 11,490 |
| 80 | 152 µs | 183 µs | 433 µs | 175.9 KiB | 6,587 |
| 160 | 268 µs | 366 µs | 850 µs | 368.8 KiB | 3,730 |
| 320 | 510 µs | 687 µs | 1.37 ms | 805.6 KiB | 1,961 |
| 640 | 1.09 ms | 1.45 ms | 2.74 ms | 1.8 MiB | 916 |
| 1280 | 4.93 ms | 5.31 ms | 7.10 ms | 4.2 MiB | 203 |
| 2560 | 6.68 ms | 6.94 ms | 9.43 ms | 7.0 MiB | 150 |
| 5120 | 11.4 ms | 12.0 ms | 15.3 ms | 12.4 MiB | 87 |
| 10240 | 24.2 ms | 24.5 ms | 32.2 ms | 22.9 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 54.7 µs | 61.8 µs | 59.3 µs | 51.1 KiB | 18,270 |
| 40 | 86.3 µs | 106 µs | 281 µs | 100.8 KiB | 11,592 |
| 80 | 168 µs | 214 µs | 516 µs | 204.8 KiB | 5,957 |
| 160 | 329 µs | 435 µs | 1.07 ms | 426.3 KiB | 3,037 |
| 320 | 663 µs | 854 µs | 1.97 ms | 909.9 KiB | 1,509 |
| 640 | 1.53 ms | 1.81 ms | 5.00 ms | 2.1 MiB | 653 |
| 1280 | 6.17 ms | 6.52 ms | 11.8 ms | 4.7 MiB | 162 |
| 2560 | 10.1 ms | 11.4 ms | 20.2 ms | 7.8 MiB | 99 |
| 5120 | 17.8 ms | 18.4 ms | 36.5 ms | 14.2 MiB | 56 |
| 10240 | 34.5 ms | 36.6 ms | 68.5 ms | 26.6 MiB | 29 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 470 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 296 µs | 296 µs | 63% |
| `run-policies` | 1 | 152 µs | 152 µs | 32% |
| _unattributed_ |  |  | 22.4 µs | 4.8% |

**At 10240 checks** (whole operation: 60.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 34.8 ms | 34.8 ms | 58% |
| `run-policies` | 1 | 24.2 ms | 24.2 ms | 40% |
| _unattributed_ |  |  | 1.16 ms | 1.9% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-06T22:03:41.250Z` → `2026-10-06T22:04:09.050Z` (28 s), ci: CI (run 37536792493)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15994 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `a6dae09d65cda4550cd2581164e7a0c9b1f6a780` on `chore/update-non-ts-deps`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


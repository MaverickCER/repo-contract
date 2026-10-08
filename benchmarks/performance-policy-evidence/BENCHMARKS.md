# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **262 µs** per operation compared with a bare-minimum baseline (**123%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 0.99). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 262 µs | 40.0 ms |
| Added latency, relative to baseline | 123% | 184% |
| Added CPU time per operation | 633 µs | 43.6 ms |
| Added memory per operation (heap delta) | 320.1 KiB | 41.2 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,817 ops/s | 25 ops/s |

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
| 20 | 60.5 µs | 173 µs | 113 µs | 186% | 476 µs | $0.00023 – $0.0053 |
| 40 | 116 µs | 266 µs | 150 µs | 129% | 393 µs | $0.00031 – $0.0044 |
| 80 | 214 µs | 476 µs | 262 µs | 123% | 633 µs | $0.00055 – $0.0071 |
| 160 | 432 µs | 832 µs | 400 µs | 93% | 449 µs | $0.00083 – $0.005 |
| 320 | 770 µs | 1.68 ms | 913 µs | 119% | 1.71 ms | $0.0019 – $0.019 |
| 640 | 1.54 ms | 3.22 ms | 1.68 ms | 109% | 2.04 ms | $0.0035 – $0.023 |
| 1280 | 2.86 ms | 12.6 ms | 9.70 ms | 339% | 10.3 ms | $0.020 – $0.115 |
| 2560 | 5.56 ms | 18.1 ms | 12.6 ms | 226% | 13.1 ms | $0.026 – $0.147 |
| 5120 | 11.0 ms | 31.9 ms | 20.9 ms | 191% | 23.3 ms | $0.044 – $0.262 |
| 10240 | 21.7 ms | 61.7 ms | 40.0 ms | 184% | 43.6 ms | $0.083 – $0.490 |

**How the total grows:** O(n) (linear), exponent 0.99 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 296 µs | 36.6 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.91 ms | 402 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 147 µs | 24.9 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 171 µs | 34.5 ms |

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
| 20 | 82.5 µs | 86.5 µs | 253 µs | 49.3 KiB | 12,117 |
| 40 | 154 µs | 159 µs | 427 µs | 97.5 KiB | 6,486 |
| 80 | 296 µs | 309 µs | 749 µs | 197.7 KiB | 3,383 |
| 160 | 577 µs | 616 µs | 1.34 ms | 409.1 KiB | 1,733 |
| 320 | 1.13 ms | 1.18 ms | 2.66 ms | 884.8 KiB | 886 |
| 640 | 2.06 ms | 2.17 ms | 3.65 ms | 2.0 MiB | 486 |
| 1280 | 6.93 ms | 7.28 ms | 8.58 ms | 4.5 MiB | 144 |
| 2560 | 11.9 ms | 12.9 ms | 13.2 ms | 7.7 MiB | 84 |
| 5120 | 19.7 ms | 20.8 ms | 21.6 ms | 13.7 MiB | 51 |
| 10240 | 36.6 ms | 36.9 ms | 40.0 ms | 25.9 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 784 µs | 798 µs | 1.57 ms | 290.7 KiB | 1,275 |
| 40 | 1.57 ms | 1.61 ms | 3.19 ms | 578.7 KiB | 638 |
| 80 | 2.91 ms | 3.43 ms | 4.66 ms | 1.1 MiB | 343 |
| 160 | 5.56 ms | 5.64 ms | 7.58 ms | 2.3 MiB | 180 |
| 320 | 10.9 ms | 11.0 ms | 13.4 ms | 4.7 MiB | 92 |
| 640 | 21.6 ms | 21.7 ms | 25.1 ms | 9.7 MiB | 46 |
| 1280 | 47.1 ms | 47.8 ms | 52.7 ms | 19.9 MiB | 21 |
| 2560 | 89.4 ms | 95.6 ms | 98.6 ms | 38.2 MiB | 11 |
| 5120 | 203 ms | 204 ms | 300 ms | 72.6 MiB | 5 |
| 10240 | 402 ms | 406 ms | 607 ms | 143.5 MiB | 2 |

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
| 20 | 65.6 µs | 78.0 µs | 69.3 µs | 45.5 KiB | 15,239 |
| 40 | 90.5 µs | 113 µs | 276 µs | 86.4 KiB | 11,054 |
| 80 | 147 µs | 188 µs | 480 µs | 176.0 KiB | 6,810 |
| 160 | 295 µs | 400 µs | 853 µs | 368.8 KiB | 3,390 |
| 320 | 581 µs | 744 µs | 1.61 ms | 805.6 KiB | 1,720 |
| 640 | 1.27 ms | 1.56 ms | 3.03 ms | 1.8 MiB | 789 |
| 1280 | 5.37 ms | 5.82 ms | 7.79 ms | 4.2 MiB | 186 |
| 2560 | 7.15 ms | 8.00 ms | 10.3 ms | 7.0 MiB | 140 |
| 5120 | 13.1 ms | 15.0 ms | 17.1 ms | 12.4 MiB | 76 |
| 10240 | 24.9 ms | 25.6 ms | 33.0 ms | 23.1 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 57.1 µs | 63.5 µs | 204 µs | 51.1 KiB | 17,528 |
| 40 | 96.0 µs | 115 µs | 334 µs | 100.8 KiB | 10,414 |
| 80 | 171 µs | 223 µs | 513 µs | 204.8 KiB | 5,838 |
| 160 | 425 µs | 495 µs | 1.46 ms | 427.4 KiB | 2,353 |
| 320 | 734 µs | 949 µs | 2.09 ms | 919.7 KiB | 1,363 |
| 640 | 1.70 ms | 1.99 ms | 5.24 ms | 2.1 MiB | 587 |
| 1280 | 6.60 ms | 6.98 ms | 12.5 ms | 4.7 MiB | 151 |
| 2560 | 9.95 ms | 10.5 ms | 20.0 ms | 7.8 MiB | 100 |
| 5120 | 17.6 ms | 18.0 ms | 35.8 ms | 14.2 MiB | 57 |
| 10240 | 34.5 ms | 35.0 ms | 69.3 ms | 26.7 MiB | 29 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 476 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 296 µs | 296 µs | 62% |
| `run-policies` | 1 | 147 µs | 147 µs | 31% |
| _unattributed_ |  |  | 33.4 µs | 7.0% |

**At 10240 checks** (whole operation: 61.7 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 36.6 ms | 36.6 ms | 59% |
| `run-policies` | 1 | 24.9 ms | 24.9 ms | 40% |
| _unattributed_ |  |  | 143 µs | 0.2% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-08T06:20:55.342Z` → `2026-10-08T06:21:23.403Z` (28 s), ci: CI (run 37735982326)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `0408ead62f08f5de6c7371ed45e9df503690a85a` on `chore/vitest-5`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **177 µs** per operation compared with a bare-minimum baseline (**116%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.01). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 177 µs | 34.3 ms |
| Added latency, relative to baseline | 116% | 209% |
| Added CPU time per operation | 337 µs | 38.3 ms |
| Added memory per operation (heap delta) | 330.9 KiB | 42.6 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 5,643 ops/s | 29 ops/s |

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
| 20 | 42.3 µs | 108 µs | 65.3 µs | 154% | 219 µs | $0.00014 – $0.0025 |
| 40 | 79.5 µs | 183 µs | 103 µs | 130% | 256 µs | $0.00022 – $0.0029 |
| 80 | 152 µs | 329 µs | 177 µs | 116% | 337 µs | $0.00037 – $0.0038 |
| 160 | 296 µs | 632 µs | 337 µs | 114% | 549 µs | $0.0007 – $0.0062 |
| 320 | 574 µs | 1.27 ms | 698 µs | 122% | 1.34 ms | $0.0015 – $0.015 |
| 640 | 1.14 ms | 2.45 ms | 1.30 ms | 114% | 1.61 ms | $0.0027 – $0.018 |
| 1280 | 2.15 ms | 9.87 ms | 7.72 ms | 359% | 7.98 ms | $0.016 – $0.090 |
| 2560 | 4.19 ms | 15.0 ms | 10.8 ms | 259% | 11.3 ms | $0.023 – $0.127 |
| 5120 | 8.29 ms | 25.9 ms | 17.6 ms | 212% | 19.7 ms | $0.037 – $0.222 |
| 10240 | 16.4 ms | 50.7 ms | 34.3 ms | 209% | 38.3 ms | $0.071 – $0.431 |

**How the total grows:** O(n) (linear), exponent 1.01 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 221 µs | 29.2 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.21 ms | 316 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 87.4 µs | 20.6 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 131 µs | 29.4 ms |

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
| 20 | 63.5 µs | 68.7 µs | 183 µs | 52.8 KiB | 15,738 |
| 40 | 119 µs | 131 µs | 319 µs | 104.4 KiB | 8,405 |
| 80 | 221 µs | 257 µs | 522 µs | 211.2 KiB | 4,519 |
| 160 | 444 µs | 466 µs | 1.05 ms | 436.2 KiB | 2,254 |
| 320 | 808 µs | 841 µs | 1.44 ms | 938.5 KiB | 1,238 |
| 640 | 1.64 ms | 1.70 ms | 2.92 ms | 2.1 MiB | 611 |
| 1280 | 5.73 ms | 6.13 ms | 7.09 ms | 4.7 MiB | 174 |
| 2560 | 8.88 ms | 9.14 ms | 10.7 ms | 8.0 MiB | 113 |
| 5120 | 15.9 ms | 17.4 ms | 18.3 ms | 14.5 MiB | 63 |
| 10240 | 29.2 ms | 29.5 ms | 32.5 ms | 27.6 MiB | 34 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 590 µs | 599 µs | 1.21 ms | 294.9 KiB | 1,694 |
| 40 | 1.19 ms | 1.28 ms | 2.47 ms | 587.0 KiB | 842 |
| 80 | 2.21 ms | 2.73 ms | 3.58 ms | 1.1 MiB | 453 |
| 160 | 4.24 ms | 4.27 ms | 5.82 ms | 2.3 MiB | 236 |
| 320 | 8.34 ms | 8.40 ms | 10.3 ms | 4.7 MiB | 120 |
| 640 | 16.6 ms | 16.8 ms | 19.3 ms | 9.8 MiB | 60 |
| 1280 | 36.0 ms | 40.5 ms | 40.7 ms | 20.1 MiB | 28 |
| 2560 | 69.7 ms | 75.1 ms | 78.4 ms | 38.7 MiB | 14 |
| 5120 | 160 ms | 162 ms | 241 ms | 73.5 MiB | 6 |
| 10240 | 316 ms | 318 ms | 482 ms | 145.2 MiB | 3 |

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

**Measured: O(n)** (exponent 1.10, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 34.3 µs | 41.9 µs | 36.0 µs | 43.6 KiB | 29,125 |
| 40 | 58.0 µs | 61.5 µs | 155 µs | 85.2 KiB | 17,232 |
| 80 | 87.4 µs | 96.9 µs | 260 µs | 173.8 KiB | 11,436 |
| 160 | 179 µs | 252 µs | 530 µs | 363.4 KiB | 5,575 |
| 320 | 379 µs | 502 µs | 1.16 ms | 795.9 KiB | 2,636 |
| 640 | 693 µs | 877 µs | 1.46 ms | 1.8 MiB | 1,443 |
| 1280 | 4.03 ms | 4.29 ms | 5.93 ms | 4.2 MiB | 248 |
| 2560 | 5.64 ms | 5.79 ms | 7.83 ms | 6.9 MiB | 177 |
| 5120 | 9.25 ms | 9.81 ms | 12.7 ms | 12.3 MiB | 108 |
| 10240 | 20.6 ms | 21.0 ms | 26.6 ms | 22.6 MiB | 48 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.09, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 36.5 µs | 38.7 µs | 135 µs | 50.5 KiB | 27,392 |
| 40 | 58.6 µs | 76.0 µs | 176 µs | 99.7 KiB | 17,055 |
| 80 | 131 µs | 154 µs | 377 µs | 202.7 KiB | 7,656 |
| 160 | 251 µs | 313 µs | 782 µs | 422.7 KiB | 3,978 |
| 320 | 499 µs | 649 µs | 1.49 ms | 912.5 KiB | 2,003 |
| 640 | 1.17 ms | 1.29 ms | 3.93 ms | 2.1 MiB | 856 |
| 1280 | 5.29 ms | 5.64 ms | 10.3 ms | 4.6 MiB | 189 |
| 2560 | 7.70 ms | 8.07 ms | 16.1 ms | 7.8 MiB | 130 |
| 5120 | 15.7 ms | 16.1 ms | 30.5 ms | 14.1 MiB | 64 |
| 10240 | 29.4 ms | 29.7 ms | 57.7 ms | 26.1 MiB | 34 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 329 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 221 µs | 221 µs | 67% |
| `run-policies` | 1 | 87.4 µs | 87.4 µs | 27% |
| _unattributed_ |  |  | 20.6 µs | 6.3% |

**At 10240 checks** (whole operation: 50.7 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 29.2 ms | 29.2 ms | 58% |
| `run-policies` | 1 | 20.6 ms | 20.6 ms | 41% |
| _unattributed_ |  |  | 790 µs | 1.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-11T11:50:48.223Z` → `2026-10-11T11:51:11.641Z` (23 s), ci: CI (run 38136458619)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `88d626d7241edbd0d913246737119da86c279a52` on `docs/accuracy-stage-1a`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


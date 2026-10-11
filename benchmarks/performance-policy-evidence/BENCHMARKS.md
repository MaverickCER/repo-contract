# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **135 µs** per operation compared with a bare-minimum baseline (**121%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.03). At list prices that is on the order of **~$0.0001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 135 µs | 30.3 ms |
| Added latency, relative to baseline | 121% | 250% |
| Added CPU time per operation | 313 µs | 35.2 ms |
| Added memory per operation (heap delta) | 331.0 KiB | 42.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.0001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 7,393 ops/s | 33 ops/s |

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
| 20 | 31.9 µs | 82.0 µs | 50.1 µs | 157% | 187 µs | $0.0001 – $0.0021 |
| 40 | 55.0 µs | 129 µs | 73.8 µs | 134% | 202 µs | $0.00015 – $0.0023 |
| 80 | 111 µs | 247 µs | 135 µs | 121% | 313 µs | $0.00028 – $0.0035 |
| 160 | 213 µs | 470 µs | 257 µs | 121% | 520 µs | $0.00054 – $0.0058 |
| 320 | 427 µs | 892 µs | 465 µs | 109% | 544 µs | $0.00097 – $0.0061 |
| 640 | 796 µs | 1.99 ms | 1.20 ms | 150% | 2.15 ms | $0.0025 – $0.024 |
| 1280 | 1.60 ms | 7.81 ms | 6.22 ms | 390% | 6.72 ms | $0.013 – $0.076 |
| 2560 | 3.08 ms | 11.2 ms | 8.16 ms | 265% | 8.65 ms | $0.017 – $0.097 |
| 5120 | 6.09 ms | 21.7 ms | 15.7 ms | 257% | 19.2 ms | $0.033 – $0.216 |
| 10240 | 12.1 ms | 42.4 ms | 30.3 ms | 250% | 35.2 ms | $0.063 – $0.396 |

**How the total grows:** O(n) (linear), exponent 1.03 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 158 µs | 21.9 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 1.73 ms | 248 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 65.2 µs | 15.8 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 90.8 µs | 27.6 ms |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 46.9 µs | 48.9 µs | 140 µs | 52.8 KiB | 21,315 |
| 40 | 84.1 µs | 93.9 µs | 214 µs | 104.3 KiB | 11,888 |
| 80 | 158 µs | 179 µs | 364 µs | 211.1 KiB | 6,324 |
| 160 | 307 µs | 383 µs | 655 µs | 436.0 KiB | 3,262 |
| 320 | 593 µs | 664 µs | 1.13 ms | 938.5 KiB | 1,685 |
| 640 | 1.21 ms | 1.34 ms | 2.31 ms | 2.1 MiB | 824 |
| 1280 | 4.23 ms | 4.67 ms | 5.37 ms | 4.7 MiB | 236 |
| 2560 | 6.73 ms | 7.04 ms | 8.55 ms | 8.0 MiB | 149 |
| 5120 | 12.0 ms | 12.9 ms | 14.2 ms | 14.5 MiB | 83 |
| 10240 | 21.9 ms | 22.3 ms | 24.8 ms | 27.6 MiB | 46 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 459 µs | 472 µs | 991 µs | 294.9 KiB | 2,178 |
| 40 | 843 µs | 858 µs | 1.37 ms | 585.9 KiB | 1,187 |
| 80 | 1.73 ms | 2.15 ms | 2.92 ms | 1.1 MiB | 579 |
| 160 | 3.28 ms | 3.49 ms | 4.67 ms | 2.3 MiB | 305 |
| 320 | 6.40 ms | 6.61 ms | 8.15 ms | 4.7 MiB | 156 |
| 640 | 12.7 ms | 12.9 ms | 15.3 ms | 9.8 MiB | 79 |
| 1280 | 27.2 ms | 30.6 ms | 32.0 ms | 20.1 MiB | 37 |
| 2560 | 52.9 ms | 57.5 ms | 61.9 ms | 38.7 MiB | 19 |
| 5120 | 125 ms | 127 ms | 194 ms | 73.5 MiB | 8 |
| 10240 | 248 ms | 251 ms | 389 ms | 145.2 MiB | 4 |

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

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 23.3 µs | 29.3 µs | 24.0 µs | 43.4 KiB | 42,965 |
| 40 | 32.9 µs | 43.4 µs | 93.7 µs | 85.2 KiB | 30,393 |
| 80 | 65.2 µs | 87.6 µs | 184 µs | 173.8 KiB | 15,329 |
| 160 | 133 µs | 192 µs | 366 µs | 364.4 KiB | 7,501 |
| 320 | 276 µs | 385 µs | 741 µs | 796.0 KiB | 3,618 |
| 640 | 593 µs | 821 µs | 1.30 ms | 1.8 MiB | 1,686 |
| 1280 | 3.26 ms | 3.62 ms | 5.25 ms | 4.2 MiB | 306 |
| 2560 | 4.60 ms | 4.94 ms | 6.99 ms | 6.9 MiB | 217 |
| 5120 | 7.78 ms | 8.53 ms | 11.6 ms | 12.3 MiB | 128 |
| 10240 | 15.8 ms | 16.5 ms | 21.9 ms | 22.7 MiB | 63 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 27.5 µs | 32.7 µs | 30.0 µs | 50.5 KiB | 36,352 |
| 40 | 50.9 µs | 57.6 µs | 149 µs | 99.7 KiB | 19,632 |
| 80 | 90.8 µs | 118 µs | 280 µs | 202.7 KiB | 11,016 |
| 160 | 217 µs | 270 µs | 693 µs | 422.7 KiB | 4,600 |
| 320 | 516 µs | 609 µs | 1.46 ms | 912.5 KiB | 1,936 |
| 640 | 1.34 ms | 1.57 ms | 4.18 ms | 2.1 MiB | 744 |
| 1280 | 4.86 ms | 5.04 ms | 9.92 ms | 4.6 MiB | 206 |
| 2560 | 6.91 ms | 7.40 ms | 14.2 ms | 7.8 MiB | 145 |
| 5120 | 12.9 ms | 13.3 ms | 26.5 ms | 14.1 MiB | 77 |
| 10240 | 27.6 ms | 48.1 ms | 52.0 ms | 26.2 MiB | 36 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 247 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 158 µs | 158 µs | 64% |
| `run-policies` | 1 | 65.2 µs | 65.2 µs | 26% |
| _unattributed_ |  |  | 23.2 µs | 9.4% |

**At 10240 checks** (whole operation: 42.4 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 21.9 ms | 21.9 ms | 52% |
| `run-policies` | 1 | 15.8 ms | 15.8 ms | 37% |
| _unattributed_ |  |  | 4.68 ms | 11% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-11T15:21:52.000Z` → `2026-10-11T15:22:13.104Z` (21 s), ci: CI (run 38150313297)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `33b4ba2d1432d5238584541f310f7d46e0fc3b94` on `docs/accuracy-stage-1a`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


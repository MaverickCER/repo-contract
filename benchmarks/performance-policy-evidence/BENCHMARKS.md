# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **239 µs** per operation compared with a bare-minimum baseline (**112%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 0.98). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 239 µs | 42.1 ms |
| Added latency, relative to baseline | 112% | 195% |
| Added CPU time per operation | 364 µs | 46.5 ms |
| Added memory per operation (heap delta) | 330.9 KiB | 42.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 4,190 ops/s | 24 ops/s |

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
| 20 | 60.7 µs | 179 µs | 118 µs | 194% | 471 µs | $0.00025 – $0.0053 |
| 40 | 110 µs | 274 µs | 163 µs | 148% | 437 µs | $0.00034 – $0.0049 |
| 80 | 213 µs | 451 µs | 239 µs | 112% | 364 µs | $0.0005 – $0.0041 |
| 160 | 428 µs | 978 µs | 550 µs | 128% | 1.29 ms | $0.0011 – $0.015 |
| 320 | 762 µs | 1.73 ms | 970 µs | 127% | 1.76 ms | $0.002 – $0.020 |
| 640 | 1.52 ms | 3.39 ms | 1.87 ms | 123% | 2.22 ms | $0.0039 – $0.025 |
| 1280 | 2.84 ms | 13.0 ms | 10.1 ms | 356% | 10.7 ms | $0.021 – $0.120 |
| 2560 | 5.50 ms | 18.4 ms | 12.9 ms | 234% | 13.6 ms | $0.027 – $0.153 |
| 5120 | 10.9 ms | 33.1 ms | 22.2 ms | 203% | 23.5 ms | $0.046 – $0.264 |
| 10240 | 21.6 ms | 63.7 ms | 42.1 ms | 195% | 46.5 ms | $0.088 – $0.523 |

**How the total grows:** O(n) (linear), exponent 0.98 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 312 µs | 37.4 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.98 ms | 414 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 158 µs | 24.1 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 170 µs | 36.2 ms |

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
| 20 | 103 µs | 114 µs | 379 µs | 53.0 KiB | 9,673 |
| 40 | 163 µs | 181 µs | 428 µs | 104.5 KiB | 6,128 |
| 80 | 312 µs | 334 µs | 755 µs | 211.3 KiB | 3,201 |
| 160 | 598 µs | 690 µs | 1.35 ms | 436.2 KiB | 1,672 |
| 320 | 1.19 ms | 1.26 ms | 2.71 ms | 938.9 KiB | 841 |
| 640 | 2.13 ms | 2.26 ms | 3.28 ms | 2.1 MiB | 470 |
| 1280 | 7.13 ms | 7.52 ms | 8.63 ms | 4.7 MiB | 140 |
| 2560 | 11.8 ms | 12.6 ms | 13.7 ms | 8.0 MiB | 85 |
| 5120 | 19.5 ms | 20.1 ms | 21.7 ms | 14.5 MiB | 51 |
| 10240 | 37.4 ms | 37.7 ms | 41.1 ms | 27.6 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 799 µs | 836 µs | 1.54 ms | 294.9 KiB | 1,251 |
| 40 | 1.60 ms | 1.62 ms | 3.19 ms | 587.0 KiB | 623 |
| 80 | 2.98 ms | 3.51 ms | 4.67 ms | 1.1 MiB | 336 |
| 160 | 5.70 ms | 5.84 ms | 7.61 ms | 2.3 MiB | 175 |
| 320 | 11.2 ms | 12.0 ms | 13.6 ms | 4.7 MiB | 90 |
| 640 | 22.3 ms | 30.8 ms | 25.8 ms | 9.8 MiB | 45 |
| 1280 | 47.3 ms | 49.6 ms | 53.6 ms | 20.1 MiB | 21 |
| 2560 | 93.2 ms | 96.7 ms | 103 ms | 38.7 MiB | 11 |
| 5120 | 208 ms | 209 ms | 306 ms | 73.5 MiB | 5 |
| 10240 | 414 ms | 416 ms | 620 ms | 145.2 MiB | 2 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 56.7 µs | 71.3 µs | 58.5 µs | 44.7 KiB | 17,638 |
| 40 | 80.4 µs | 106 µs | 253 µs | 85.3 KiB | 12,432 |
| 80 | 158 µs | 193 µs | 484 µs | 174.1 KiB | 6,322 |
| 160 | 270 µs | 370 µs | 771 µs | 365.1 KiB | 3,701 |
| 320 | 540 µs | 721 µs | 1.52 ms | 795.6 KiB | 1,852 |
| 640 | 1.26 ms | 1.69 ms | 3.00 ms | 1.8 MiB | 796 |
| 1280 | 5.13 ms | 6.38 ms | 7.74 ms | 4.2 MiB | 195 |
| 2560 | 7.14 ms | 7.62 ms | 10.0 ms | 6.9 MiB | 140 |
| 5120 | 12.7 ms | 14.1 ms | 17.0 ms | 12.3 MiB | 79 |
| 10240 | 24.1 ms | 24.6 ms | 32.1 ms | 22.8 MiB | 42 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 55.0 µs | 60.8 µs | 172 µs | 50.5 KiB | 18,196 |
| 40 | 95.2 µs | 111 µs | 319 µs | 99.8 KiB | 10,505 |
| 80 | 170 µs | 219 µs | 512 µs | 202.8 KiB | 5,879 |
| 160 | 340 µs | 446 µs | 1.07 ms | 422.7 KiB | 2,942 |
| 320 | 687 µs | 902 µs | 2.01 ms | 912.5 KiB | 1,455 |
| 640 | 1.64 ms | 1.98 ms | 5.12 ms | 2.1 MiB | 608 |
| 1280 | 6.50 ms | 6.90 ms | 12.2 ms | 4.6 MiB | 154 |
| 2560 | 10.2 ms | 10.4 ms | 20.1 ms | 7.8 MiB | 98 |
| 5120 | 17.5 ms | 18.9 ms | 35.9 ms | 14.1 MiB | 57 |
| 10240 | 36.2 ms | 36.9 ms | 71.7 ms | 26.2 MiB | 28 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 451 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 312 µs | 312 µs | 69% |
| `run-policies` | 1 | 158 µs | 158 µs | 35% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 10240 checks** (whole operation: 63.7 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 37.4 ms | 37.4 ms | 59% |
| `run-policies` | 1 | 24.1 ms | 24.1 ms | 38% |
| _unattributed_ |  |  | 2.28 ms | 3.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-08T21:05:40.289Z` → `2026-10-08T21:06:08.573Z` (28 s), ci: CI (run 37842740819)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `b16344eb53dee976c3c2d65bb2d947552780216d` on `chore/clear-mutation-exceptions`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


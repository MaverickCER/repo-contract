# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **287 µs** per operation compared with a bare-minimum baseline (**133%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 0.97). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 287 µs | 41.4 ms |
| Added latency, relative to baseline | 133% | 191% |
| Added CPU time per operation | 653 µs | 44.9 ms |
| Added memory per operation (heap delta) | 345.9 KiB | 44.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,487 ops/s | 24 ops/s |

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
| 20 | 60.5 µs | 164 µs | 103 µs | 171% | 334 µs | $0.00022 – $0.0038 |
| 40 | 112 µs | 279 µs | 167 µs | 149% | 452 µs | $0.00035 – $0.0051 |
| 80 | 216 µs | 502 µs | 287 µs | 133% | 653 µs | $0.0006 – $0.0073 |
| 160 | 428 µs | 989 µs | 561 µs | 131% | 1.26 ms | $0.0012 – $0.014 |
| 320 | 770 µs | 1.76 ms | 990 µs | 129% | 1.65 ms | $0.0021 – $0.019 |
| 640 | 1.54 ms | 3.46 ms | 1.91 ms | 124% | 2.24 ms | $0.004 – $0.025 |
| 1280 | 2.88 ms | 12.9 ms | 9.99 ms | 347% | 10.4 ms | $0.021 – $0.117 |
| 2560 | 5.57 ms | 18.6 ms | 13.1 ms | 234% | 13.4 ms | $0.027 – $0.151 |
| 5120 | 11.0 ms | 32.6 ms | 21.6 ms | 197% | 23.9 ms | $0.045 – $0.269 |
| 10240 | 21.7 ms | 63.1 ms | 41.4 ms | 191% | 44.9 ms | $0.086 – $0.505 |

**How the total grows:** O(n) (linear), exponent 0.97 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 312 µs | 36.8 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.93 ms | 407 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 183 µs | 25.6 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 178 µs | 34.2 ms |

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
| 20 | 93.7 µs | 96.7 µs | 302 µs | 52.9 KiB | 10,675 |
| 40 | 167 µs | 179 µs | 460 µs | 104.5 KiB | 6,005 |
| 80 | 312 µs | 333 µs | 799 µs | 211.4 KiB | 3,209 |
| 160 | 585 µs | 641 µs | 1.28 ms | 436.2 KiB | 1,711 |
| 320 | 1.16 ms | 1.25 ms | 2.49 ms | 938.9 KiB | 865 |
| 640 | 2.14 ms | 2.30 ms | 3.58 ms | 2.1 MiB | 466 |
| 1280 | 7.22 ms | 7.63 ms | 8.63 ms | 4.7 MiB | 138 |
| 2560 | 11.3 ms | 13.2 ms | 12.8 ms | 8.0 MiB | 89 |
| 5120 | 19.4 ms | 20.8 ms | 21.2 ms | 14.5 MiB | 51 |
| 10240 | 36.8 ms | 37.8 ms | 40.1 ms | 27.6 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 792 µs | 846 µs | 1.54 ms | 294.9 KiB | 1,263 |
| 40 | 1.58 ms | 1.60 ms | 3.14 ms | 587.0 KiB | 634 |
| 80 | 2.93 ms | 3.42 ms | 4.63 ms | 1.1 MiB | 341 |
| 160 | 5.62 ms | 5.75 ms | 7.56 ms | 2.3 MiB | 178 |
| 320 | 11.0 ms | 11.2 ms | 13.3 ms | 4.7 MiB | 91 |
| 640 | 21.9 ms | 22.8 ms | 25.2 ms | 9.8 MiB | 46 |
| 1280 | 46.4 ms | 48.5 ms | 51.7 ms | 20.1 MiB | 22 |
| 2560 | 89.9 ms | 95.3 ms | 99.7 ms | 38.7 MiB | 11 |
| 5120 | 205 ms | 207 ms | 303 ms | 73.5 MiB | 5 |
| 10240 | 407 ms | 408 ms | 611 ms | 145.2 MiB | 2 |

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
| 20 | 60.2 µs | 71.3 µs | 62.8 µs | 48.3 KiB | 16,604 |
| 40 | 93.2 µs | 117 µs | 298 µs | 92.6 KiB | 10,729 |
| 80 | 183 µs | 205 µs | 501 µs | 188.5 KiB | 5,452 |
| 160 | 326 µs | 415 µs | 895 µs | 393.8 KiB | 3,070 |
| 320 | 557 µs | 764 µs | 1.43 ms | 849.7 KiB | 1,795 |
| 640 | 1.20 ms | 1.59 ms | 2.94 ms | 1.9 MiB | 834 |
| 1280 | 5.01 ms | 5.38 ms | 7.56 ms | 4.4 MiB | 200 |
| 2560 | 7.05 ms | 7.41 ms | 9.87 ms | 7.3 MiB | 142 |
| 5120 | 12.2 ms | 13.7 ms | 16.6 ms | 13.2 MiB | 82 |
| 10240 | 25.6 ms | 26.4 ms | 33.1 ms | 24.5 MiB | 39 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 58.8 µs | 66.0 µs | 217 µs | 54.1 KiB | 17,011 |
| 40 | 95.7 µs | 118 µs | 320 µs | 107.0 KiB | 10,446 |
| 80 | 178 µs | 238 µs | 553 µs | 217.3 KiB | 5,612 |
| 160 | 363 µs | 484 µs | 1.09 ms | 451.7 KiB | 2,751 |
| 320 | 785 µs | 1.03 ms | 2.21 ms | 970.6 KiB | 1,274 |
| 640 | 1.66 ms | 1.81 ms | 5.09 ms | 2.2 MiB | 603 |
| 1280 | 6.54 ms | 7.05 ms | 12.6 ms | 4.9 MiB | 153 |
| 2560 | 9.87 ms | 10.2 ms | 20.1 ms | 8.3 MiB | 101 |
| 5120 | 17.9 ms | 18.0 ms | 36.4 ms | 15.1 MiB | 56 |
| 10240 | 34.2 ms | 34.6 ms | 69.5 ms | 28.4 MiB | 29 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 502 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 312 µs | 312 µs | 62% |
| `run-policies` | 1 | 183 µs | 183 µs | 37% |
| _unattributed_ |  |  | 7.30 µs | 1.5% |

**At 10240 checks** (whole operation: 63.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 36.8 ms | 36.8 ms | 58% |
| `run-policies` | 1 | 25.6 ms | 25.6 ms | 41% |
| _unattributed_ |  |  | 634 µs | 1.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-15T15:09:14.147Z` → `2026-10-15T15:09:42.151Z` (28 s), ci: CI (run 38755964414)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `af65e102db14817dfb2c7e77df4a11158c6ec1aa` on `release-lib`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


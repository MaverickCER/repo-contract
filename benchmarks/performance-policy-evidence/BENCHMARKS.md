# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **179 µs** per operation compared with a bare-minimum baseline (**116%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.01). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 179 µs | 37.8 ms |
| Added latency, relative to baseline | 116% | 226% |
| Added CPU time per operation | 349 µs | 41.6 ms |
| Added memory per operation (heap delta) | 330.9 KiB | 42.4 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 5,575 ops/s | 26 ops/s |

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
| 20 | 43.5 µs | 119 µs | 75.3 µs | 173% | 286 µs | $0.00016 – $0.0032 |
| 40 | 79.0 µs | 187 µs | 108 µs | 137% | 281 µs | $0.00023 – $0.0032 |
| 80 | 155 µs | 334 µs | 179 µs | 116% | 349 µs | $0.00037 – $0.0039 |
| 160 | 299 µs | 653 µs | 354 µs | 118% | 588 µs | $0.00074 – $0.0066 |
| 320 | 573 µs | 1.29 ms | 717 µs | 125% | 1.29 ms | $0.0015 – $0.014 |
| 640 | 1.16 ms | 2.60 ms | 1.45 ms | 125% | 1.73 ms | $0.003 – $0.019 |
| 1280 | 2.18 ms | 10.0 ms | 7.85 ms | 360% | 8.24 ms | $0.016 – $0.093 |
| 2560 | 4.24 ms | 15.3 ms | 11.1 ms | 261% | 11.4 ms | $0.023 – $0.128 |
| 5120 | 8.43 ms | 26.0 ms | 17.6 ms | 208% | 18.8 ms | $0.037 – $0.211 |
| 10240 | 16.7 ms | 54.5 ms | 37.8 ms | 226% | 41.6 ms | $0.079 – $0.468 |

**How the total grows:** O(n) (linear), exponent 1.01 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 223 µs | 31.4 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.23 ms | 323 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 95.2 µs | 21.9 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 121 µs | 30.1 ms |

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
| 20 | 65.0 µs | 68.7 µs | 201 µs | 52.8 KiB | 15,394 |
| 40 | 120 µs | 126 µs | 328 µs | 104.4 KiB | 8,364 |
| 80 | 223 µs | 280 µs | 539 µs | 211.2 KiB | 4,474 |
| 160 | 447 µs | 463 µs | 1.07 ms | 436.2 KiB | 2,239 |
| 320 | 823 µs | 875 µs | 1.48 ms | 938.5 KiB | 1,216 |
| 640 | 1.69 ms | 1.79 ms | 2.98 ms | 2.1 MiB | 593 |
| 1280 | 6.02 ms | 6.34 ms | 7.53 ms | 4.7 MiB | 166 |
| 2560 | 9.58 ms | 11.5 ms | 11.5 ms | 8.0 MiB | 104 |
| 5120 | 16.0 ms | 17.1 ms | 17.9 ms | 14.5 MiB | 63 |
| 10240 | 31.4 ms | 32.3 ms | 34.8 ms | 27.5 MiB | 32 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 604 µs | 611 µs | 1.25 ms | 294.9 KiB | 1,657 |
| 40 | 1.19 ms | 1.22 ms | 2.51 ms | 587.0 KiB | 841 |
| 80 | 2.23 ms | 2.74 ms | 3.70 ms | 1.1 MiB | 449 |
| 160 | 4.30 ms | 4.36 ms | 6.10 ms | 2.3 MiB | 233 |
| 320 | 8.42 ms | 8.51 ms | 10.7 ms | 4.7 MiB | 119 |
| 640 | 16.8 ms | 17.2 ms | 20.0 ms | 9.8 MiB | 60 |
| 1280 | 36.7 ms | 40.6 ms | 42.3 ms | 20.1 MiB | 27 |
| 2560 | 70.3 ms | 76.2 ms | 79.4 ms | 38.7 MiB | 14 |
| 5120 | 160 ms | 162 ms | 242 ms | 73.5 MiB | 6 |
| 10240 | 323 ms | 324 ms | 492 ms | 145.3 MiB | 3 |

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

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 33.5 µs | 43.6 µs | 35.0 µs | 43.5 KiB | 29,844 |
| 40 | 52.8 µs | 62.2 µs | 166 µs | 85.3 KiB | 18,934 |
| 80 | 95.2 µs | 126 µs | 290 µs | 173.9 KiB | 10,501 |
| 160 | 193 µs | 263 µs | 565 µs | 364.5 KiB | 5,184 |
| 320 | 372 µs | 524 µs | 860 µs | 783.0 KiB | 2,686 |
| 640 | 859 µs | 1.11 ms | 1.83 ms | 1.8 MiB | 1,164 |
| 1280 | 4.52 ms | 5.01 ms | 6.77 ms | 4.2 MiB | 221 |
| 2560 | 6.98 ms | 7.50 ms | 9.61 ms | 6.9 MiB | 143 |
| 5120 | 10.5 ms | 12.9 ms | 14.2 ms | 12.3 MiB | 95 |
| 10240 | 21.9 ms | 22.2 ms | 28.9 ms | 22.6 MiB | 46 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 37.8 µs | 39.9 µs | 117 µs | 50.5 KiB | 26,485 |
| 40 | 64.3 µs | 78.1 µs | 214 µs | 99.7 KiB | 15,558 |
| 80 | 121 µs | 156 µs | 383 µs | 202.7 KiB | 8,237 |
| 160 | 257 µs | 318 µs | 790 µs | 422.7 KiB | 3,895 |
| 320 | 519 µs | 659 µs | 1.57 ms | 912.5 KiB | 1,926 |
| 640 | 1.23 ms | 1.44 ms | 4.00 ms | 2.1 MiB | 816 |
| 1280 | 5.46 ms | 5.66 ms | 10.5 ms | 4.6 MiB | 183 |
| 2560 | 8.47 ms | 9.65 ms | 17.1 ms | 7.8 MiB | 118 |
| 5120 | 16.1 ms | 17.2 ms | 31.8 ms | 14.1 MiB | 62 |
| 10240 | 30.1 ms | 30.2 ms | 58.7 ms | 26.5 MiB | 33 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 334 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 223 µs | 223 µs | 67% |
| `run-policies` | 1 | 95.2 µs | 95.2 µs | 29% |
| _unattributed_ |  |  | 15.3 µs | 4.6% |

**At 10240 checks** (whole operation: 54.5 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 31.4 ms | 31.4 ms | 58% |
| `run-policies` | 1 | 21.9 ms | 21.9 ms | 40% |
| _unattributed_ |  |  | 1.11 ms | 2.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-09T17:38:01.865Z` → `2026-10-09T17:38:25.742Z` (24 s), ci: CI (run 37966449480)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `4e7f685ce656e1492319814692a4eb31fceb7986` on `fix/version-script-regenerates-sbom`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


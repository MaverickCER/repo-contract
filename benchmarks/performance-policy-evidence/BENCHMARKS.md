# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **261 µs** per operation compared with a bare-minimum baseline (**121%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 0.99). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 261 µs | 40.8 ms |
| Added latency, relative to baseline | 121% | 186% |
| Added CPU time per operation | 640 µs | 45.0 ms |
| Added memory per operation (heap delta) | 320.1 KiB | 41.0 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,831 ops/s | 25 ops/s |

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
| 20 | 60.0 µs | 175 µs | 115 µs | 191% | 460 µs | $0.00024 – $0.0052 |
| 40 | 110 µs | 263 µs | 152 µs | 138% | 428 µs | $0.00032 – $0.0048 |
| 80 | 216 µs | 477 µs | 261 µs | 121% | 640 µs | $0.00054 – $0.0072 |
| 160 | 430 µs | 838 µs | 407 µs | 95% | 415 µs | $0.00085 – $0.0047 |
| 320 | 769 µs | 1.68 ms | 915 µs | 119% | 1.70 ms | $0.0019 – $0.019 |
| 640 | 1.54 ms | 3.27 ms | 1.73 ms | 112% | 2.15 ms | $0.0036 – $0.024 |
| 1280 | 2.86 ms | 12.9 ms | 10.0 ms | 351% | 10.6 ms | $0.021 – $0.119 |
| 2560 | 5.57 ms | 18.0 ms | 12.5 ms | 224% | 13.4 ms | $0.026 – $0.150 |
| 5120 | 11.1 ms | 32.5 ms | 21.4 ms | 193% | 24.1 ms | $0.045 – $0.271 |
| 10240 | 22.0 ms | 62.7 ms | 40.8 ms | 186% | 45.0 ms | $0.085 – $0.506 |

**How the total grows:** O(n) (linear), exponent 0.99 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 300 µs | 36.0 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.97 ms | 407 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 140 µs | 24.6 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 211 µs | 34.0 ms |

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
| 20 | 84.3 µs | 87.6 µs | 264 µs | 49.3 KiB | 11,859 |
| 40 | 158 µs | 163 µs | 455 µs | 97.5 KiB | 6,325 |
| 80 | 300 µs | 359 µs | 788 µs | 197.7 KiB | 3,338 |
| 160 | 563 µs | 572 µs | 1.31 ms | 409.1 KiB | 1,777 |
| 320 | 1.12 ms | 1.25 ms | 2.63 ms | 884.8 KiB | 890 |
| 640 | 2.07 ms | 2.30 ms | 3.61 ms | 2.0 MiB | 483 |
| 1280 | 6.99 ms | 7.26 ms | 8.55 ms | 4.5 MiB | 143 |
| 2560 | 11.0 ms | 12.6 ms | 13.1 ms | 7.7 MiB | 91 |
| 5120 | 19.0 ms | 19.5 ms | 21.5 ms | 13.7 MiB | 53 |
| 10240 | 36.0 ms | 36.6 ms | 39.6 ms | 26.0 MiB | 28 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 787 µs | 798 µs | 1.55 ms | 290.7 KiB | 1,270 |
| 40 | 1.57 ms | 1.59 ms | 3.15 ms | 578.7 KiB | 638 |
| 80 | 2.97 ms | 3.45 ms | 4.69 ms | 1.1 MiB | 337 |
| 160 | 5.60 ms | 5.65 ms | 7.53 ms | 2.3 MiB | 179 |
| 320 | 11.0 ms | 11.1 ms | 13.3 ms | 4.7 MiB | 91 |
| 640 | 21.8 ms | 21.9 ms | 25.1 ms | 9.7 MiB | 46 |
| 1280 | 46.4 ms | 48.4 ms | 51.8 ms | 19.9 MiB | 22 |
| 2560 | 89.7 ms | 96.2 ms | 99.4 ms | 38.2 MiB | 11 |
| 5120 | 204 ms | 205 ms | 303 ms | 72.6 MiB | 5 |
| 10240 | 407 ms | 412 ms | 611 ms | 143.6 MiB | 2 |

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
| 20 | 51.3 µs | 64.7 µs | 54.7 µs | 45.0 KiB | 19,497 |
| 40 | 81.2 µs | 102 µs | 277 µs | 86.4 KiB | 12,309 |
| 80 | 140 µs | 185 µs | 444 µs | 176.0 KiB | 7,138 |
| 160 | 264 µs | 383 µs | 754 µs | 368.8 KiB | 3,788 |
| 320 | 558 µs | 737 µs | 1.47 ms | 805.6 KiB | 1,793 |
| 640 | 1.10 ms | 1.21 ms | 2.83 ms | 1.8 MiB | 905 |
| 1280 | 5.16 ms | 5.57 ms | 7.59 ms | 4.2 MiB | 194 |
| 2560 | 7.01 ms | 7.57 ms | 9.87 ms | 7.0 MiB | 143 |
| 5120 | 12.1 ms | 12.7 ms | 16.5 ms | 12.4 MiB | 83 |
| 10240 | 24.6 ms | 26.0 ms | 32.9 ms | 23.1 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 53.6 µs | 56.9 µs | 210 µs | 51.1 KiB | 18,673 |
| 40 | 88.1 µs | 108 µs | 293 µs | 100.8 KiB | 11,349 |
| 80 | 211 µs | 221 µs | 593 µs | 204.8 KiB | 4,751 |
| 160 | 378 µs | 444 µs | 1.11 ms | 426.3 KiB | 2,642 |
| 320 | 673 µs | 896 µs | 1.99 ms | 909.9 KiB | 1,487 |
| 640 | 1.63 ms | 1.91 ms | 5.11 ms | 2.1 MiB | 613 |
| 1280 | 6.46 ms | 6.64 ms | 12.5 ms | 4.7 MiB | 155 |
| 2560 | 9.69 ms | 10.4 ms | 20.0 ms | 7.8 MiB | 103 |
| 5120 | 17.4 ms | 18.4 ms | 36.0 ms | 14.2 MiB | 57 |
| 10240 | 34.0 ms | 35.1 ms | 69.2 ms | 26.9 MiB | 29 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 477 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 300 µs | 300 µs | 63% |
| `run-policies` | 1 | 140 µs | 140 µs | 29% |
| _unattributed_ |  |  | 37.8 µs | 7.9% |

**At 10240 checks** (whole operation: 62.7 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 36.0 ms | 36.0 ms | 57% |
| `run-policies` | 1 | 24.6 ms | 24.6 ms | 39% |
| _unattributed_ |  |  | 2.11 ms | 3.4% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-08T05:07:28.043Z` → `2026-10-08T05:07:55.996Z` (28 s), ci: CI (run 37729655798)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `a70bbc43eeb70e5da7bb6489fac84875ca02c745` on `chore/vitest-5`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


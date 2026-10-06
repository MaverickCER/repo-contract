# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **126 µs** per operation compared with a bare-minimum baseline (**115%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.0001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 126 µs | 30.2 ms |
| Added latency, relative to baseline | 115% | 254% |
| Added CPU time per operation | 306 µs | 35.2 ms |
| Added memory per operation (heap delta) | 319.5 KiB | 41.5 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.0001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 7,924 ops/s | 33 ops/s |

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
| 20 | 30.8 µs | 84.5 µs | 53.8 µs | 175% | 233 µs | $0.00011 – $0.0026 |
| 40 | 55.1 µs | 121 µs | 66.4 µs | 121% | 179 µs | $0.00014 – $0.002 |
| 80 | 109 µs | 236 µs | 126 µs | 115% | 306 µs | $0.00026 – $0.0034 |
| 160 | 221 µs | 474 µs | 253 µs | 115% | 478 µs | $0.00053 – $0.0054 |
| 320 | 438 µs | 1.01 ms | 568 µs | 130% | 1.05 ms | $0.0012 – $0.012 |
| 640 | 815 µs | 2.14 ms | 1.32 ms | 162% | 2.14 ms | $0.0028 – $0.024 |
| 1280 | 1.61 ms | 7.61 ms | 6.00 ms | 372% | 6.78 ms | $0.012 – $0.076 |
| 2560 | 3.09 ms | 12.1 ms | 9.03 ms | 293% | 9.77 ms | $0.019 – $0.110 |
| 5120 | 6.14 ms | 22.7 ms | 16.6 ms | 270% | 17.7 ms | $0.035 – $0.199 |
| 10240 | 11.9 ms | 42.1 ms | 30.2 ms | 254% | 35.2 ms | $0.063 – $0.395 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 148 µs | 21.4 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 1.59 ms | 237 ms |
| `runPolicies` (quiet-output) | O(n) | O(n log n) | 🟡 close (neighbouring class) | 66.9 µs | 16.2 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 92.6 µs | 26.2 ms |

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
| 20 | 42.6 µs | 45.2 µs | 131 µs | 49.2 KiB | 23,468 |
| 40 | 76.3 µs | 91.8 µs | 188 µs | 97.4 KiB | 13,098 |
| 80 | 148 µs | 166 µs | 349 µs | 197.5 KiB | 6,740 |
| 160 | 283 µs | 312 µs | 619 µs | 409.0 KiB | 3,529 |
| 320 | 560 µs | 621 µs | 1.09 ms | 884.4 KiB | 1,787 |
| 640 | 1.13 ms | 1.19 ms | 2.18 ms | 2.0 MiB | 882 |
| 1280 | 4.08 ms | 4.32 ms | 5.21 ms | 4.5 MiB | 245 |
| 2560 | 6.50 ms | 7.15 ms | 8.10 ms | 7.7 MiB | 154 |
| 5120 | 11.3 ms | 12.7 ms | 13.7 ms | 13.7 MiB | 89 |
| 10240 | 21.4 ms | 22.0 ms | 24.8 ms | 25.9 MiB | 47 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 441 µs | 454 µs | 963 µs | 290.7 KiB | 2,269 |
| 40 | 817 µs | 1.48 ms | 1.35 ms | 578.4 KiB | 1,224 |
| 80 | 1.59 ms | 1.95 ms | 2.76 ms | 1.1 MiB | 630 |
| 160 | 3.08 ms | 3.22 ms | 4.54 ms | 2.3 MiB | 325 |
| 320 | 6.36 ms | 6.71 ms | 8.59 ms | 4.7 MiB | 157 |
| 640 | 12.7 ms | 12.8 ms | 15.9 ms | 9.7 MiB | 79 |
| 1280 | 27.3 ms | 30.6 ms | 32.5 ms | 19.9 MiB | 37 |
| 2560 | 50.7 ms | 55.9 ms | 59.1 ms | 38.2 MiB | 20 |
| 5120 | 121 ms | 124 ms | 187 ms | 72.6 MiB | 8 |
| 10240 | 237 ms | 246 ms | 375 ms | 143.6 MiB | 4 |

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

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 26.1 µs | 30.7 µs | 85.7 µs | 43.8 KiB | 38,296 |
| 40 | 41.6 µs | 49.0 µs | 128 µs | 86.3 KiB | 24,011 |
| 80 | 66.9 µs | 89.8 µs | 197 µs | 175.7 KiB | 14,955 |
| 160 | 156 µs | 190 µs | 407 µs | 368.0 KiB | 6,392 |
| 320 | 293 µs | 391 µs | 758 µs | 803.4 KiB | 3,414 |
| 640 | 554 µs | 739 µs | 1.25 ms | 1.8 MiB | 1,804 |
| 1280 | 3.14 ms | 3.40 ms | 4.96 ms | 4.2 MiB | 318 |
| 2560 | 4.52 ms | 4.95 ms | 6.96 ms | 7.0 MiB | 221 |
| 5120 | 8.34 ms | 10.0 ms | 12.1 ms | 12.4 MiB | 120 |
| 10240 | 16.2 ms | 16.8 ms | 22.9 ms | 22.9 MiB | 62 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 27.1 µs | 32.1 µs | 27.9 µs | 51.1 KiB | 36,854 |
| 40 | 42.0 µs | 52.8 µs | 129 µs | 100.6 KiB | 23,783 |
| 80 | 92.6 µs | 108 µs | 287 µs | 204.6 KiB | 10,802 |
| 160 | 178 µs | 235 µs | 515 µs | 425.8 KiB | 5,627 |
| 320 | 447 µs | 579 µs | 1.34 ms | 919.7 KiB | 2,236 |
| 640 | 1.29 ms | 1.64 ms | 3.99 ms | 2.1 MiB | 773 |
| 1280 | 4.69 ms | 5.20 ms | 9.81 ms | 4.7 MiB | 213 |
| 2560 | 7.28 ms | 9.91 ms | 14.4 ms | 7.8 MiB | 137 |
| 5120 | 13.7 ms | 25.5 ms | 26.9 ms | 14.2 MiB | 73 |
| 10240 | 26.2 ms | 27.0 ms | 49.5 ms | 26.4 MiB | 38 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 236 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 148 µs | 148 µs | 63% |
| `run-policies` | 1 | 66.9 µs | 66.9 µs | 28% |
| _unattributed_ |  |  | 20.3 µs | 8.6% |

**At 10240 checks** (whole operation: 42.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 21.4 ms | 21.4 ms | 51% |
| `run-policies` | 1 | 16.2 ms | 16.2 ms | 38% |
| _unattributed_ |  |  | 4.44 ms | 11% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-06T18:38:08.788Z` → `2026-10-06T18:38:29.692Z` (21 s), ci: CI (run 37511408701)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `72c385088c98acfa7a8db302a4b0a24d8bd01769` on `fix/v1-audit`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


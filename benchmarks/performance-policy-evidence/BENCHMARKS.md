# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **158 µs** per operation compared with a bare-minimum baseline (**136%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 0.98). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 158 µs | 29.0 ms |
| Added latency, relative to baseline | 136% | 230% |
| Added CPU time per operation | 441 µs | 31.9 ms |
| Added memory per operation (heap delta) | 319.5 KiB | 41.4 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 6,314 ops/s | 35 ops/s |

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
| 20 | 33.0 µs | 94.9 µs | 61.9 µs | 188% | 275 µs | $0.00013 – $0.0031 |
| 40 | 62.4 µs | 148 µs | 86.1 µs | 138% | 244 µs | $0.00018 – $0.0027 |
| 80 | 117 µs | 275 µs | 158 µs | 136% | 441 µs | $0.00033 – $0.005 |
| 160 | 245 µs | 585 µs | 340 µs | 139% | 671 µs | $0.00071 – $0.0075 |
| 320 | 467 µs | 1.20 ms | 728 µs | 156% | 1.62 ms | $0.0015 – $0.018 |
| 640 | 839 µs | 2.22 ms | 1.38 ms | 165% | 2.52 ms | $0.0029 – $0.028 |
| 1280 | 1.69 ms | 8.22 ms | 6.52 ms | 385% | 6.90 ms | $0.014 – $0.078 |
| 2560 | 3.15 ms | 12.0 ms | 8.88 ms | 281% | 9.24 ms | $0.018 – $0.104 |
| 5120 | 6.19 ms | 20.9 ms | 14.7 ms | 238% | 13.4 ms | $0.031 – $0.151 |
| 10240 | 12.6 ms | 41.5 ms | 29.0 ms | 230% | 31.9 ms | $0.060 – $0.358 |

**How the total grows:** O(n) (linear), exponent 0.98 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 166 µs | 24.6 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.13 ms | 295 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 93.6 µs | 15.0 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 120 µs | 28.5 ms |

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

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 51.6 µs | 56.1 µs | 182 µs | 49.2 KiB | 19,370 |
| 40 | 88.6 µs | 92.5 µs | 266 µs | 97.4 KiB | 11,283 |
| 80 | 166 µs | 175 µs | 455 µs | 197.5 KiB | 6,039 |
| 160 | 316 µs | 333 µs | 789 µs | 409.0 KiB | 3,163 |
| 320 | 611 µs | 715 µs | 1.35 ms | 884.4 KiB | 1,636 |
| 640 | 1.25 ms | 1.35 ms | 2.77 ms | 2.0 MiB | 799 |
| 1280 | 4.63 ms | 4.87 ms | 6.14 ms | 4.5 MiB | 216 |
| 2560 | 7.52 ms | 8.07 ms | 9.71 ms | 7.7 MiB | 133 |
| 5120 | 13.3 ms | 14.0 ms | 14.7 ms | 13.7 MiB | 75 |
| 10240 | 24.6 ms | 26.8 ms | 27.2 ms | 26.0 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 561 µs | 612 µs | 1.41 ms | 290.7 KiB | 1,782 |
| 40 | 910 µs | 996 µs | 1.69 ms | 578.4 KiB | 1,099 |
| 80 | 2.13 ms | 2.38 ms | 4.09 ms | 1.1 MiB | 471 |
| 160 | 3.94 ms | 4.63 ms | 6.32 ms | 2.3 MiB | 254 |
| 320 | 8.02 ms | 8.98 ms | 10.9 ms | 4.7 MiB | 125 |
| 640 | 15.1 ms | 16.1 ms | 19.0 ms | 9.7 MiB | 66 |
| 1280 | 32.2 ms | 36.7 ms | 39.2 ms | 19.9 MiB | 31 |
| 2560 | 63.8 ms | 64.7 ms | 76.4 ms | 38.2 MiB | 16 |
| 5120 | 143 ms | 144 ms | 228 ms | 72.6 MiB | 7 |
| 10240 | 295 ms | 297 ms | 478 ms | 143.5 MiB | 3 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 31.3 µs | 39.3 µs | 32.5 µs | 44.0 KiB | 31,936 |
| 40 | 49.9 µs | 58.3 µs | 177 µs | 86.3 KiB | 20,059 |
| 80 | 93.6 µs | 104 µs | 327 µs | 175.8 KiB | 10,688 |
| 160 | 177 µs | 211 µs | 561 µs | 368.0 KiB | 5,661 |
| 320 | 342 µs | 458 µs | 901 µs | 793.0 KiB | 2,923 |
| 640 | 673 µs | 851 µs | 1.52 ms | 1.8 MiB | 1,486 |
| 1280 | 3.74 ms | 4.08 ms | 6.11 ms | 4.2 MiB | 267 |
| 2560 | 5.54 ms | 5.92 ms | 8.59 ms | 7.0 MiB | 180 |
| 5120 | 9.39 ms | 10.6 ms | 13.1 ms | 12.4 MiB | 107 |
| 10240 | 15.0 ms | 16.5 ms | 22.2 ms | 23.1 MiB | 67 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 31.0 µs | 35.5 µs | 33.6 µs | 51.1 KiB | 32,297 |
| 40 | 58.7 µs | 65.1 µs | 201 µs | 100.7 KiB | 17,043 |
| 80 | 120 µs | 133 µs | 418 µs | 204.6 KiB | 8,359 |
| 160 | 276 µs | 308 µs | 963 µs | 426.3 KiB | 3,619 |
| 320 | 570 µs | 616 µs | 1.83 ms | 919.7 KiB | 1,755 |
| 640 | 1.25 ms | 1.41 ms | 4.66 ms | 2.1 MiB | 801 |
| 1280 | 4.72 ms | 5.01 ms | 10.6 ms | 4.7 MiB | 212 |
| 2560 | 6.60 ms | 7.15 ms | 15.4 ms | 7.8 MiB | 151 |
| 5120 | 15.2 ms | 16.3 ms | 38.9 ms | 13.6 MiB | 66 |
| 10240 | 28.5 ms | 28.7 ms | 69.4 ms | 26.4 MiB | 35 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 275 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 166 µs | 166 µs | 60% |
| `run-policies` | 1 | 93.6 µs | 93.6 µs | 34% |
| _unattributed_ |  |  | 15.9 µs | 5.8% |

**At 10240 checks** (whole operation: 41.5 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 24.6 ms | 24.6 ms | 59% |
| `run-policies` | 1 | 15.0 ms | 15.0 ms | 36% |
| _unattributed_ |  |  | 2.00 ms | 4.8% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-06T22:43:21.413Z` → `2026-10-06T22:43:45.282Z` (24 s), ci: CI (run 37541465788)
- Machine: Intel(R) Xeon(R) 6973P-C, 4 logical core(s) (2 physical), 15989 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `51e51786cdad9de9988b1c9ee0fcaaa0c5eba85a` on `chore/update-non-ts-deps`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


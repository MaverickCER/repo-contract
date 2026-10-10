# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **138 µs** per operation compared with a bare-minimum baseline (**120%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.05). At list prices that is on the order of **~$0.0001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 138 µs | 31.6 ms |
| Added latency, relative to baseline | 120% | 256% |
| Added CPU time per operation | 310 µs | 35.1 ms |
| Added memory per operation (heap delta) | 331.0 KiB | 42.9 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.0001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 7,235 ops/s | 32 ops/s |

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
| 20 | 32.1 µs | 83.6 µs | 51.4 µs | 160% | 192 µs | $0.00011 – $0.0022 |
| 40 | 56.8 µs | 133 µs | 76.2 µs | 134% | 192 µs | $0.00016 – $0.0022 |
| 80 | 115 µs | 253 µs | 138 µs | 120% | 310 µs | $0.00029 – $0.0035 |
| 160 | 214 µs | 490 µs | 276 µs | 129% | 548 µs | $0.00058 – $0.0062 |
| 320 | 410 µs | 923 µs | 513 µs | 125% | 732 µs | $0.0011 – $0.0082 |
| 640 | 816 µs | 1.94 ms | 1.12 ms | 138% | 1.99 ms | $0.0023 – $0.022 |
| 1280 | 1.63 ms | 7.88 ms | 6.24 ms | 382% | 6.84 ms | $0.013 – $0.077 |
| 2560 | 3.16 ms | 11.9 ms | 8.70 ms | 275% | 9.14 ms | $0.018 – $0.103 |
| 5120 | 6.28 ms | 22.6 ms | 16.3 ms | 260% | 19.1 ms | $0.034 – $0.215 |
| 10240 | 12.3 ms | 43.9 ms | 31.6 ms | 256% | 35.1 ms | $0.066 – $0.395 |

**How the total grows:** O(n) (linear), exponent 1.05 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 168 µs | 22.8 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 1.72 ms | 250 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 70.2 µs | 16.4 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 93.1 µs | 25.1 ms |

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
| 20 | 53.4 µs | 59.6 µs | 187 µs | 52.8 KiB | 18,728 |
| 40 | 86.0 µs | 95.5 µs | 216 µs | 104.3 KiB | 11,635 |
| 80 | 168 µs | 202 µs | 428 µs | 211.2 KiB | 5,939 |
| 160 | 313 µs | 340 µs | 661 µs | 436.0 KiB | 3,195 |
| 320 | 606 µs | 648 µs | 1.14 ms | 938.5 KiB | 1,651 |
| 640 | 1.24 ms | 1.34 ms | 2.37 ms | 2.1 MiB | 804 |
| 1280 | 4.32 ms | 5.30 ms | 5.49 ms | 4.7 MiB | 232 |
| 2560 | 6.66 ms | 6.86 ms | 8.51 ms | 8.0 MiB | 150 |
| 5120 | 11.5 ms | 12.0 ms | 13.4 ms | 14.5 MiB | 87 |
| 10240 | 22.8 ms | 23.4 ms | 26.0 ms | 27.5 MiB | 44 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 468 µs | 480 µs | 1.00e+3 µs | 294.9 KiB | 2,138 |
| 40 | 852 µs | 871 µs | 1.40 ms | 585.9 KiB | 1,174 |
| 80 | 1.72 ms | 2.12 ms | 2.90 ms | 1.1 MiB | 582 |
| 160 | 3.24 ms | 3.46 ms | 4.62 ms | 2.3 MiB | 309 |
| 320 | 6.29 ms | 6.44 ms | 8.05 ms | 4.7 MiB | 159 |
| 640 | 12.5 ms | 12.8 ms | 15.1 ms | 9.8 MiB | 80 |
| 1280 | 30.8 ms | 42.8 ms | 35.3 ms | 20.1 MiB | 32 |
| 2560 | 53.5 ms | 58.9 ms | 62.7 ms | 38.7 MiB | 19 |
| 5120 | 125 ms | 125 ms | 193 ms | 73.5 MiB | 8 |
| 10240 | 250 ms | 252 ms | 395 ms | 145.2 MiB | 4 |

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
| 20 | 24.9 µs | 29.9 µs | 25.4 µs | 43.4 KiB | 40,212 |
| 40 | 36.0 µs | 46.2 µs | 104 µs | 85.2 KiB | 27,748 |
| 80 | 70.2 µs | 93.9 µs | 198 µs | 173.8 KiB | 14,250 |
| 160 | 137 µs | 183 µs | 372 µs | 364.4 KiB | 7,318 |
| 320 | 288 µs | 406 µs | 753 µs | 796.0 KiB | 3,477 |
| 640 | 584 µs | 790 µs | 1.24 ms | 1.8 MiB | 1,713 |
| 1280 | 3.05 ms | 3.39 ms | 5.19 ms | 4.2 MiB | 327 |
| 2560 | 4.46 ms | 4.92 ms | 6.75 ms | 6.9 MiB | 224 |
| 5120 | 7.82 ms | 8.35 ms | 11.5 ms | 12.3 MiB | 128 |
| 10240 | 16.4 ms | 17.5 ms | 22.7 ms | 22.7 MiB | 61 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 28.4 µs | 34.6 µs | 28.9 µs | 50.5 KiB | 35,235 |
| 40 | 47.5 µs | 56.8 µs | 140 µs | 99.6 KiB | 21,066 |
| 80 | 93.1 µs | 118 µs | 273 µs | 202.7 KiB | 10,743 |
| 160 | 232 µs | 272 µs | 628 µs | 422.2 KiB | 4,308 |
| 320 | 433 µs | 535 µs | 1.38 ms | 912.5 KiB | 2,308 |
| 640 | 1.17 ms | 1.37 ms | 3.92 ms | 2.1 MiB | 852 |
| 1280 | 4.58 ms | 4.73 ms | 9.69 ms | 4.6 MiB | 218 |
| 2560 | 6.94 ms | 7.23 ms | 14.6 ms | 7.8 MiB | 144 |
| 5120 | 12.8 ms | 13.7 ms | 26.5 ms | 14.1 MiB | 78 |
| 10240 | 25.1 ms | 26.0 ms | 50.1 ms | 26.2 MiB | 40 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 253 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 168 µs | 168 µs | 66% |
| `run-policies` | 1 | 70.2 µs | 70.2 µs | 28% |
| _unattributed_ |  |  | 14.9 µs | 5.9% |

**At 10240 checks** (whole operation: 43.9 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 22.8 ms | 22.8 ms | 52% |
| `run-policies` | 1 | 16.4 ms | 16.4 ms | 37% |
| _unattributed_ |  |  | 4.80 ms | 11% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-10T22:45:04.931Z` → `2026-10-10T22:45:25.897Z` (21 s), ci: CI (run 38092012203)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `da80093aebf458f036d338ee7a9815294d601337` on `docs/accuracy-stage-1a`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


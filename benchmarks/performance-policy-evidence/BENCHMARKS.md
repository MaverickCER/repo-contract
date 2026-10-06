# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **262 µs** per operation compared with a bare-minimum baseline (**123%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 0.97). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 262 µs | 39.6 ms |
| Added latency, relative to baseline | 123% | 181% |
| Added CPU time per operation | 634 µs | 43.1 ms |
| Added memory per operation (heap delta) | 320.1 KiB | 41.2 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,816 ops/s | 25 ops/s |

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
| 20 | 61.1 µs | 153 µs | 92.1 µs | 151% | 312 µs | $0.00019 – $0.0035 |
| 40 | 117 µs | 266 µs | 150 µs | 128% | 392 µs | $0.00031 – $0.0044 |
| 80 | 213 µs | 475 µs | 262 µs | 123% | 634 µs | $0.00055 – $0.0071 |
| 160 | 431 µs | 961 µs | 530 µs | 123% | 1.29 ms | $0.0011 – $0.015 |
| 320 | 765 µs | 1.70 ms | 936 µs | 122% | 1.69 ms | $0.0019 – $0.019 |
| 640 | 1.54 ms | 3.34 ms | 1.80 ms | 117% | 2.23 ms | $0.0037 – $0.025 |
| 1280 | 2.87 ms | 12.6 ms | 9.77 ms | 341% | 10.4 ms | $0.020 – $0.117 |
| 2560 | 5.55 ms | 18.2 ms | 12.7 ms | 229% | 13.3 ms | $0.026 – $0.150 |
| 5120 | 11.0 ms | 31.8 ms | 20.8 ms | 190% | 24.0 ms | $0.043 – $0.269 |
| 10240 | 21.9 ms | 61.5 ms | 39.6 ms | 181% | 43.1 ms | $0.082 – $0.485 |

**How the total grows:** O(n) (linear), exponent 0.97 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 300 µs | 36.8 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 3.01 ms | 419 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 129 µs | 24.4 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 187 µs | 35.4 ms |

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
| 20 | 89.2 µs | 93.4 µs | 299 µs | 49.3 KiB | 11,212 |
| 40 | 159 µs | 174 µs | 458 µs | 97.5 KiB | 6,301 |
| 80 | 300 µs | 310 µs | 794 µs | 197.7 KiB | 3,330 |
| 160 | 569 µs | 589 µs | 1.34 ms | 409.1 KiB | 1,756 |
| 320 | 1.13 ms | 1.16 ms | 2.64 ms | 884.8 KiB | 888 |
| 640 | 2.11 ms | 2.18 ms | 3.71 ms | 2.0 MiB | 474 |
| 1280 | 7.03 ms | 7.73 ms | 8.63 ms | 4.5 MiB | 142 |
| 2560 | 12.6 ms | 16.3 ms | 14.7 ms | 7.7 MiB | 79 |
| 5120 | 19.6 ms | 21.3 ms | 21.9 ms | 13.7 MiB | 51 |
| 10240 | 36.8 ms | 37.5 ms | 39.9 ms | 26.0 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 811 µs | 826 µs | 1.59 ms | 290.7 KiB | 1,234 |
| 40 | 1.60 ms | 1.62 ms | 3.16 ms | 578.7 KiB | 625 |
| 80 | 3.01 ms | 3.55 ms | 4.72 ms | 1.1 MiB | 332 |
| 160 | 5.77 ms | 5.98 ms | 7.69 ms | 2.3 MiB | 173 |
| 320 | 11.3 ms | 11.5 ms | 13.7 ms | 4.7 MiB | 88 |
| 640 | 22.5 ms | 22.6 ms | 25.8 ms | 9.7 MiB | 44 |
| 1280 | 47.7 ms | 50.6 ms | 53.0 ms | 19.9 MiB | 21 |
| 2560 | 92.7 ms | 100 ms | 103 ms | 38.2 MiB | 11 |
| 5120 | 211 ms | 211 ms | 308 ms | 72.6 MiB | 5 |
| 10240 | 419 ms | 431 ms | 627 ms | 143.6 MiB | 2 |

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
| 20 | 48.4 µs | 59.2 µs | 51.5 µs | 44.2 KiB | 20,680 |
| 40 | 70.5 µs | 92.4 µs | 235 µs | 86.3 KiB | 14,193 |
| 80 | 129 µs | 179 µs | 381 µs | 175.9 KiB | 7,729 |
| 160 | 263 µs | 369 µs | 767 µs | 368.8 KiB | 3,799 |
| 320 | 542 µs | 723 µs | 1.47 ms | 805.6 KiB | 1,844 |
| 640 | 1.10 ms | 1.20 ms | 2.83 ms | 1.8 MiB | 912 |
| 1280 | 4.95 ms | 5.31 ms | 7.51 ms | 4.2 MiB | 202 |
| 2560 | 7.11 ms | 7.60 ms | 9.88 ms | 7.0 MiB | 141 |
| 5120 | 11.9 ms | 12.3 ms | 16.3 ms | 12.4 MiB | 84 |
| 10240 | 24.4 ms | 24.8 ms | 32.0 ms | 23.2 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 53.8 µs | 58.6 µs | 114 µs | 51.1 KiB | 18,600 |
| 40 | 87.9 µs | 111 µs | 303 µs | 100.8 KiB | 11,380 |
| 80 | 187 µs | 222 µs | 651 µs | 204.9 KiB | 5,358 |
| 160 | 332 µs | 447 µs | 1.08 ms | 426.3 KiB | 3,012 |
| 320 | 675 µs | 893 µs | 1.99 ms | 919.7 KiB | 1,482 |
| 640 | 1.65 ms | 1.95 ms | 5.24 ms | 2.1 MiB | 606 |
| 1280 | 6.71 ms | 7.04 ms | 13.0 ms | 4.7 MiB | 149 |
| 2560 | 9.84 ms | 10.4 ms | 20.0 ms | 7.8 MiB | 102 |
| 5120 | 19.2 ms | 19.8 ms | 38.3 ms | 13.6 MiB | 52 |
| 10240 | 35.4 ms | 35.6 ms | 70.8 ms | 26.7 MiB | 28 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 475 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 300 µs | 300 µs | 63% |
| `run-policies` | 1 | 129 µs | 129 µs | 27% |
| _unattributed_ |  |  | 45.6 µs | 9.6% |

**At 10240 checks** (whole operation: 61.5 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 36.8 ms | 36.8 ms | 60% |
| `run-policies` | 1 | 24.4 ms | 24.4 ms | 40% |
| _unattributed_ |  |  | 348 µs | 0.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-06T21:12:24.380Z` → `2026-10-06T21:12:52.479Z` (28 s), ci: CI (run 37530674727)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `5a054b1210e3b30c357fedc5825da412b572c05d` on `dependabot/npm_and_yarn/source-map-js-1.2.2`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


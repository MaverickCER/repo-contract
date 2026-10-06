# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **258 µs** per operation compared with a bare-minimum baseline (**122%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 0.98). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 258 µs | 39.5 ms |
| Added latency, relative to baseline | 122% | 183% |
| Added CPU time per operation | 632 µs | 43.8 ms |
| Added memory per operation (heap delta) | 320.1 KiB | 40.9 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,873 ops/s | 25 ops/s |

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
| 20 | 61.4 µs | 152 µs | 90.4 µs | 147% | 310 µs | $0.00019 – $0.0035 |
| 40 | 111 µs | 259 µs | 148 µs | 134% | 430 µs | $0.00031 – $0.0048 |
| 80 | 212 µs | 470 µs | 258 µs | 122% | 632 µs | $0.00054 – $0.0071 |
| 160 | 426 µs | 821 µs | 395 µs | 93% | 412 µs | $0.00082 – $0.0046 |
| 320 | 857 µs | 1.66 ms | 798 µs | 93% | 822 µs | $0.0017 – $0.0092 |
| 640 | 1.52 ms | 3.28 ms | 1.75 ms | 115% | 2.19 ms | $0.0037 – $0.025 |
| 1280 | 2.83 ms | 12.8 ms | 9.94 ms | 351% | 10.5 ms | $0.021 – $0.118 |
| 2560 | 5.50 ms | 17.9 ms | 12.4 ms | 226% | 12.9 ms | $0.026 – $0.145 |
| 5120 | 11.0 ms | 31.7 ms | 20.8 ms | 190% | 23.0 ms | $0.043 – $0.258 |
| 10240 | 21.6 ms | 61.1 ms | 39.5 ms | 183% | 43.8 ms | $0.082 – $0.492 |

**How the total grows:** O(n) (linear), exponent 0.98 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 296 µs | 36.7 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.92 ms | 405 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 154 µs | 23.5 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 167 µs | 35.0 ms |

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
| 20 | 84.6 µs | 87.3 µs | 266 µs | 49.3 KiB | 11,816 |
| 40 | 154 µs | 179 µs | 445 µs | 97.5 KiB | 6,482 |
| 80 | 296 µs | 307 µs | 779 µs | 197.7 KiB | 3,382 |
| 160 | 553 µs | 584 µs | 1.23 ms | 409.1 KiB | 1,810 |
| 320 | 1.12 ms | 1.18 ms | 2.63 ms | 884.8 KiB | 893 |
| 640 | 2.04 ms | 2.29 ms | 3.57 ms | 2.0 MiB | 491 |
| 1280 | 6.99 ms | 7.23 ms | 8.52 ms | 4.5 MiB | 143 |
| 2560 | 12.1 ms | 12.9 ms | 13.9 ms | 7.7 MiB | 83 |
| 5120 | 18.5 ms | 19.3 ms | 20.3 ms | 13.7 MiB | 54 |
| 10240 | 36.7 ms | 37.1 ms | 39.9 ms | 26.0 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 782 µs | 856 µs | 1.54 ms | 290.7 KiB | 1,279 |
| 40 | 1.57 ms | 1.60 ms | 3.16 ms | 578.7 KiB | 636 |
| 80 | 2.92 ms | 3.51 ms | 4.67 ms | 1.1 MiB | 342 |
| 160 | 5.59 ms | 5.72 ms | 7.51 ms | 2.3 MiB | 179 |
| 320 | 10.9 ms | 11.0 ms | 13.2 ms | 4.7 MiB | 92 |
| 640 | 21.6 ms | 21.8 ms | 24.9 ms | 9.7 MiB | 46 |
| 1280 | 46.3 ms | 48.4 ms | 51.8 ms | 19.9 MiB | 22 |
| 2560 | 90.3 ms | 96.1 ms | 99.6 ms | 38.2 MiB | 11 |
| 5120 | 205 ms | 206 ms | 304 ms | 72.6 MiB | 5 |
| 10240 | 405 ms | 407 ms | 608 ms | 143.5 MiB | 2 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 57.7 µs | 73.1 µs | 60.3 µs | 45.3 KiB | 17,337 |
| 40 | 88.3 µs | 110 µs | 279 µs | 86.4 KiB | 11,330 |
| 80 | 154 µs | 187 µs | 429 µs | 175.9 KiB | 6,509 |
| 160 | 278 µs | 372 µs | 861 µs | 368.8 KiB | 3,596 |
| 320 | 523 µs | 689 µs | 1.43 ms | 805.6 KiB | 1,911 |
| 640 | 1.11 ms | 1.50 ms | 2.83 ms | 1.8 MiB | 897 |
| 1280 | 5.06 ms | 5.63 ms | 7.53 ms | 4.2 MiB | 197 |
| 2560 | 6.99 ms | 7.49 ms | 9.90 ms | 7.0 MiB | 143 |
| 5120 | 11.8 ms | 13.3 ms | 16.8 ms | 12.4 MiB | 85 |
| 10240 | 23.5 ms | 24.1 ms | 30.9 ms | 22.9 MiB | 42 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 53.9 µs | 58.5 µs | 116 µs | 51.1 KiB | 18,559 |
| 40 | 88.6 µs | 109 µs | 287 µs | 100.8 KiB | 11,288 |
| 80 | 167 µs | 217 µs | 511 µs | 204.8 KiB | 5,997 |
| 160 | 330 µs | 445 µs | 1.06 ms | 426.3 KiB | 3,026 |
| 320 | 676 µs | 882 µs | 2.01 ms | 919.7 KiB | 1,478 |
| 640 | 1.72 ms | 2.06 ms | 5.12 ms | 2.1 MiB | 582 |
| 1280 | 6.84 ms | 7.48 ms | 12.7 ms | 4.7 MiB | 146 |
| 2560 | 10.3 ms | 11.0 ms | 20.6 ms | 7.8 MiB | 97 |
| 5120 | 18.0 ms | 18.5 ms | 36.5 ms | 14.2 MiB | 56 |
| 10240 | 35.0 ms | 35.7 ms | 69.6 ms | 26.3 MiB | 29 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 470 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 296 µs | 296 µs | 63% |
| `run-policies` | 1 | 154 µs | 154 µs | 33% |
| _unattributed_ |  |  | 21.0 µs | 4.5% |

**At 10240 checks** (whole operation: 61.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 36.7 ms | 36.7 ms | 60% |
| `run-policies` | 1 | 23.5 ms | 23.5 ms | 39% |
| _unattributed_ |  |  | 846 µs | 1.4% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-06T21:12:18.687Z` → `2026-10-06T21:12:46.725Z` (28 s), ci: CI (run 37530624232)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `2b97c448d11baf44aec4e8d54d0aaeaa596a8201` on `dependabot/npm_and_yarn/http-cache-semantics-4.3.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


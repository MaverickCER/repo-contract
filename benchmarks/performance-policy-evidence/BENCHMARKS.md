# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **272 µs** per operation compared with a bare-minimum baseline (**128%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 0.97). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 272 µs | 43.8 ms |
| Added latency, relative to baseline | 128% | 200% |
| Added CPU time per operation | 625 µs | 49.8 ms |
| Added memory per operation (heap delta) | 331.6 KiB | 42.4 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,678 ops/s | 23 ops/s |

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
| 20 | 62.1 µs | 159 µs | 96.5 µs | 155% | 315 µs | $0.0002 – $0.0035 |
| 40 | 110 µs | 271 µs | 161 µs | 146% | 437 µs | $0.00034 – $0.0049 |
| 80 | 213 µs | 485 µs | 272 µs | 128% | 625 µs | $0.00057 – $0.007 |
| 160 | 433 µs | 999 µs | 565 µs | 130% | 1.31 ms | $0.0012 – $0.015 |
| 320 | 774 µs | 1.77 ms | 994 µs | 128% | 1.77 ms | $0.0021 – $0.020 |
| 640 | 1.55 ms | 3.64 ms | 2.09 ms | 135% | 2.59 ms | $0.0044 – $0.029 |
| 1280 | 2.88 ms | 13.2 ms | 10.3 ms | 359% | 11.0 ms | $0.022 – $0.124 |
| 2560 | 5.61 ms | 18.9 ms | 13.2 ms | 236% | 13.9 ms | $0.028 – $0.157 |
| 5120 | 11.0 ms | 34.4 ms | 23.4 ms | 212% | 26.8 ms | $0.049 – $0.301 |
| 10240 | 21.8 ms | 65.6 ms | 43.8 ms | 200% | 49.8 ms | $0.091 – $0.560 |

**How the total grows:** O(n) (linear), exponent 0.97 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 310 µs | 38.2 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.95 ms | 406 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 137 µs | 25.3 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 191 µs | 33.5 ms |

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
| 20 | 94.2 µs | 100 µs | 301 µs | 52.9 KiB | 10,614 |
| 40 | 164 µs | 173 µs | 446 µs | 104.5 KiB | 6,106 |
| 80 | 310 µs | 400 µs | 757 µs | 211.4 KiB | 3,229 |
| 160 | 595 µs | 627 µs | 1.33 ms | 436.2 KiB | 1,680 |
| 320 | 1.19 ms | 1.23 ms | 2.73 ms | 938.9 KiB | 838 |
| 640 | 2.17 ms | 2.47 ms | 3.74 ms | 2.1 MiB | 460 |
| 1280 | 7.14 ms | 7.35 ms | 8.85 ms | 4.7 MiB | 140 |
| 2560 | 11.8 ms | 12.0 ms | 14.0 ms | 8.0 MiB | 85 |
| 5120 | 19.7 ms | 20.7 ms | 21.4 ms | 14.5 MiB | 51 |
| 10240 | 38.2 ms | 38.7 ms | 41.6 ms | 27.5 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 797 µs | 815 µs | 1.57 ms | 294.9 KiB | 1,255 |
| 40 | 1.57 ms | 1.60 ms | 3.15 ms | 587.0 KiB | 637 |
| 80 | 2.95 ms | 3.51 ms | 4.65 ms | 1.1 MiB | 339 |
| 160 | 5.61 ms | 5.76 ms | 7.55 ms | 2.3 MiB | 178 |
| 320 | 11.0 ms | 11.3 ms | 13.4 ms | 4.7 MiB | 91 |
| 640 | 21.8 ms | 22.1 ms | 25.1 ms | 9.8 MiB | 46 |
| 1280 | 46.7 ms | 48.6 ms | 52.1 ms | 20.1 MiB | 21 |
| 2560 | 89.9 ms | 96.6 ms | 99.0 ms | 38.7 MiB | 11 |
| 5120 | 204 ms | 205 ms | 301 ms | 73.4 MiB | 5 |
| 10240 | 406 ms | 410 ms | 611 ms | 145.2 MiB | 2 |

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
| 20 | 51.9 µs | 64.4 µs | 61.9 µs | 44.5 KiB | 19,278 |
| 40 | 73.8 µs | 106 µs | 249 µs | 85.3 KiB | 13,558 |
| 80 | 137 µs | 186 µs | 412 µs | 174.0 KiB | 7,292 |
| 160 | 272 µs | 377 µs | 792 µs | 365.1 KiB | 3,671 |
| 320 | 548 µs | 727 µs | 1.50 ms | 797.4 KiB | 1,823 |
| 640 | 1.19 ms | 1.63 ms | 2.92 ms | 1.8 MiB | 839 |
| 1280 | 5.22 ms | 5.70 ms | 7.82 ms | 4.2 MiB | 192 |
| 2560 | 7.58 ms | 8.16 ms | 10.5 ms | 6.9 MiB | 132 |
| 5120 | 12.9 ms | 13.5 ms | 17.4 ms | 12.3 MiB | 78 |
| 10240 | 25.3 ms | 25.8 ms | 33.3 ms | 22.7 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 57.0 µs | 62.0 µs | 189 µs | 50.5 KiB | 17,550 |
| 40 | 98.4 µs | 120 µs | 341 µs | 99.8 KiB | 10,159 |
| 80 | 191 µs | 234 µs | 627 µs | 203.0 KiB | 5,245 |
| 160 | 407 µs | 459 µs | 1.38 ms | 423.8 KiB | 2,455 |
| 320 | 703 µs | 917 µs | 2.05 ms | 912.5 KiB | 1,422 |
| 640 | 1.73 ms | 2.19 ms | 5.17 ms | 2.1 MiB | 578 |
| 1280 | 6.50 ms | 6.78 ms | 12.4 ms | 4.6 MiB | 154 |
| 2560 | 9.61 ms | 10.2 ms | 19.9 ms | 7.8 MiB | 104 |
| 5120 | 17.8 ms | 18.3 ms | 36.8 ms | 14.1 MiB | 56 |
| 10240 | 33.5 ms | 34.3 ms | 67.1 ms | 26.1 MiB | 30 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 485 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 310 µs | 310 µs | 64% |
| `run-policies` | 1 | 137 µs | 137 µs | 28% |
| _unattributed_ |  |  | 38.1 µs | 7.9% |

**At 10240 checks** (whole operation: 65.6 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 38.2 ms | 38.2 ms | 58% |
| `run-policies` | 1 | 25.3 ms | 25.3 ms | 38% |
| _unattributed_ |  |  | 2.14 ms | 3.3% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-11T10:59:31.254Z` → `2026-10-11T10:59:59.337Z` (28 s), ci: CI (run 38133169542)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `8d43d7d6309390ceaded10213ffea0d238092ecd` on `docs/accuracy-stage-1a`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


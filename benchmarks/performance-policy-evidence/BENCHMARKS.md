# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **266 µs** per operation compared with a bare-minimum baseline (**124%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.05). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 266 µs | 52.2 ms |
| Added latency, relative to baseline | 124% | 241% |
| Added CPU time per operation | 647 µs | 56.0 ms |
| Added memory per operation (heap delta) | 320.1 KiB | 41.2 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,761 ops/s | 19 ops/s |

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
| 20 | 60.5 µs | 153 µs | 92.6 µs | 153% | 333 µs | $0.00019 – $0.0037 |
| 40 | 110 µs | 265 µs | 155 µs | 140% | 455 µs | $0.00032 – $0.0051 |
| 80 | 215 µs | 481 µs | 266 µs | 124% | 647 µs | $0.00055 – $0.0073 |
| 160 | 429 µs | 967 µs | 537 µs | 125% | 1.31 ms | $0.0011 – $0.015 |
| 320 | 767 µs | 1.70 ms | 936 µs | 122% | 1.71 ms | $0.0019 – $0.019 |
| 640 | 1.54 ms | 3.32 ms | 1.78 ms | 116% | 2.12 ms | $0.0037 – $0.024 |
| 1280 | 2.86 ms | 12.7 ms | 9.87 ms | 346% | 10.4 ms | $0.021 – $0.117 |
| 2560 | 5.52 ms | 20.2 ms | 14.7 ms | 266% | 15.3 ms | $0.031 – $0.173 |
| 5120 | 10.9 ms | 36.4 ms | 25.5 ms | 233% | 27.4 ms | $0.053 – $0.308 |
| 10240 | 21.7 ms | 73.9 ms | 52.2 ms | 241% | 56.0 ms | $0.109 – $0.629 |

**How the total grows:** O(n) (linear), exponent 1.05 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 300 µs | 41.7 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.92 ms | 438 ms |
| `runPolicies` (quiet-output) | O(n) | O(n log n) | 🟡 close (neighbouring class) | 133 µs | 32.2 ms |
| `runPolicies` (chatty-output) | O(n) | O(n log n) | 🟡 close (neighbouring class) | 191 µs | 49.3 ms |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 85.8 µs | 90.1 µs | 277 µs | 49.3 KiB | 11,652 |
| 40 | 159 µs | 170 µs | 463 µs | 97.5 KiB | 6,285 |
| 80 | 300 µs | 306 µs | 806 µs | 197.7 KiB | 3,336 |
| 160 | 555 µs | 579 µs | 1.26 ms | 409.1 KiB | 1,802 |
| 320 | 1.13 ms | 1.28 ms | 2.70 ms | 884.8 KiB | 882 |
| 640 | 2.03 ms | 2.30 ms | 3.53 ms | 2.0 MiB | 493 |
| 1280 | 7.01 ms | 7.30 ms | 8.67 ms | 4.5 MiB | 143 |
| 2560 | 12.3 ms | 12.9 ms | 14.0 ms | 7.7 MiB | 81 |
| 5120 | 20.5 ms | 21.2 ms | 23.1 ms | 13.7 MiB | 49 |
| 10240 | 41.7 ms | 44.0 ms | 46.8 ms | 25.9 MiB | 24 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 792 µs | 1.10 ms | 1.57 ms | 290.7 KiB | 1,262 |
| 40 | 1.57 ms | 1.61 ms | 3.22 ms | 578.7 KiB | 635 |
| 80 | 2.92 ms | 3.45 ms | 4.66 ms | 1.1 MiB | 342 |
| 160 | 5.60 ms | 5.74 ms | 7.56 ms | 2.3 MiB | 178 |
| 320 | 11.0 ms | 11.2 ms | 13.4 ms | 4.7 MiB | 91 |
| 640 | 22.0 ms | 22.9 ms | 25.4 ms | 9.7 MiB | 45 |
| 1280 | 47.4 ms | 48.1 ms | 54.0 ms | 19.9 MiB | 21 |
| 2560 | 92.6 ms | 99.7 ms | 106 ms | 38.2 MiB | 11 |
| 5120 | 220 ms | 220 ms | 337 ms | 72.6 MiB | 5 |
| 10240 | 438 ms | 440 ms | 687 ms | 143.5 MiB | 2 |

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
| 20 | 49.0 µs | 62.5 µs | 50.3 µs | 44.4 KiB | 20,401 |
| 40 | 69.9 µs | 92.7 µs | 231 µs | 86.3 KiB | 14,313 |
| 80 | 133 µs | 187 µs | 423 µs | 175.9 KiB | 7,503 |
| 160 | 274 µs | 373 µs | 835 µs | 368.8 KiB | 3,653 |
| 320 | 527 µs | 712 µs | 1.45 ms | 805.6 KiB | 1,896 |
| 640 | 1.14 ms | 1.38 ms | 2.92 ms | 1.8 MiB | 877 |
| 1280 | 5.09 ms | 5.45 ms | 7.44 ms | 4.2 MiB | 196 |
| 2560 | 7.35 ms | 8.26 ms | 10.3 ms | 7.0 MiB | 136 |
| 5120 | 13.9 ms | 15.7 ms | 18.6 ms | 12.4 MiB | 72 |
| 10240 | 32.2 ms | 33.5 ms | 43.6 ms | 23.2 MiB | 31 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.10, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 52.5 µs | 59.1 µs | 71.0 µs | 51.1 KiB | 19,058 |
| 40 | 85.1 µs | 114 µs | 265 µs | 100.7 KiB | 11,748 |
| 80 | 191 µs | 231 µs | 659 µs | 204.9 KiB | 5,248 |
| 160 | 415 µs | 474 µs | 1.46 ms | 427.4 KiB | 2,407 |
| 320 | 935 µs | 1.03 ms | 3.38 ms | 925.5 KiB | 1,070 |
| 640 | 1.96 ms | 2.34 ms | 5.54 ms | 2.1 MiB | 511 |
| 1280 | 8.26 ms | 9.02 ms | 15.1 ms | 4.7 MiB | 121 |
| 2560 | 13.2 ms | 14.2 ms | 25.2 ms | 7.8 MiB | 76 |
| 5120 | 27.3 ms | 28.9 ms | 50.7 ms | 14.0 MiB | 37 |
| 10240 | 49.3 ms | 50.0 ms | 91.1 ms | 26.5 MiB | 20 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 481 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 300 µs | 300 µs | 62% |
| `run-policies` | 1 | 133 µs | 133 µs | 28% |
| _unattributed_ |  |  | 47.7 µs | 9.9% |

**At 10240 checks** (whole operation: 73.9 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 41.7 ms | 41.7 ms | 56% |
| `run-policies` | 1 | 32.2 ms | 32.2 ms | 44% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-06T01:30:42.719Z` → `2026-10-06T01:31:11.791Z` (29 s), ci: CI (run 37398342781)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `00c49e0f51aed0c48718e00aa50ad06ec040d37f` on `fix/v1-audit`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


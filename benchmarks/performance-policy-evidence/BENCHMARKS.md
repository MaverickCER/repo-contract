# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **287 µs** per operation compared with a bare-minimum baseline (**127%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 0.96). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 287 µs | 45.8 ms |
| Added latency, relative to baseline | 127% | 206% |
| Added CPU time per operation | 555 µs | 48.6 ms |
| Added memory per operation (heap delta) | 331.5 KiB | 42.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 3,490 ops/s | 22 ops/s |

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
| 20 | 63.4 µs | 184 µs | 121 µs | 190% | 457 µs | $0.00025 – $0.0051 |
| 40 | 110 µs | 288 µs | 178 µs | 163% | 492 µs | $0.00037 – $0.0055 |
| 80 | 226 µs | 513 µs | 287 µs | 127% | 555 µs | $0.0006 – $0.0062 |
| 160 | 428 µs | 1.08 ms | 655 µs | 153% | 1.54 ms | $0.0014 – $0.017 |
| 320 | 758 µs | 1.95 ms | 1.19 ms | 157% | 2.02 ms | $0.0025 – $0.023 |
| 640 | 1.53 ms | 3.98 ms | 2.45 ms | 160% | 3.15 ms | $0.0051 – $0.035 |
| 1280 | 2.89 ms | 14.2 ms | 11.3 ms | 389% | 12.1 ms | $0.023 – $0.136 |
| 2560 | 5.68 ms | 21.3 ms | 15.7 ms | 276% | 17.3 ms | $0.033 – $0.194 |
| 5120 | 11.4 ms | 36.6 ms | 25.2 ms | 221% | 26.9 ms | $0.052 – $0.303 |
| 10240 | 22.3 ms | 68.1 ms | 45.8 ms | 206% | 48.6 ms | $0.095 – $0.546 |

**How the total grows:** O(n) (linear), exponent 0.96 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 322 µs | 39.0 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 3.00 ms | 413 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 167 µs | 26.1 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 215 µs | 35.6 ms |

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
| 20 | 96.4 µs | 103 µs | 313 µs | 52.9 KiB | 10,371 |
| 40 | 169 µs | 179 µs | 473 µs | 104.5 KiB | 5,930 |
| 80 | 322 µs | 383 µs | 832 µs | 211.4 KiB | 3,108 |
| 160 | 610 µs | 753 µs | 1.40 ms | 436.2 KiB | 1,641 |
| 320 | 1.24 ms | 1.47 ms | 2.85 ms | 938.9 KiB | 808 |
| 640 | 2.25 ms | 2.33 ms | 3.95 ms | 2.1 MiB | 444 |
| 1280 | 7.67 ms | 7.95 ms | 9.74 ms | 4.7 MiB | 130 |
| 2560 | 12.0 ms | 12.9 ms | 14.7 ms | 8.0 MiB | 83 |
| 5120 | 21.5 ms | 24.2 ms | 23.8 ms | 14.5 MiB | 47 |
| 10240 | 39.0 ms | 39.2 ms | 43.1 ms | 27.6 MiB | 26 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 809 µs | 837 µs | 1.60 ms | 294.9 KiB | 1,235 |
| 40 | 1.63 ms | 1.66 ms | 3.29 ms | 587.0 KiB | 615 |
| 80 | 3.00 ms | 3.56 ms | 4.84 ms | 1.1 MiB | 333 |
| 160 | 5.77 ms | 5.95 ms | 7.91 ms | 2.3 MiB | 173 |
| 320 | 11.2 ms | 11.4 ms | 13.7 ms | 4.7 MiB | 89 |
| 640 | 22.3 ms | 22.4 ms | 25.9 ms | 9.8 MiB | 45 |
| 1280 | 47.9 ms | 49.9 ms | 54.0 ms | 20.1 MiB | 21 |
| 2560 | 91.5 ms | 96.7 ms | 102 ms | 38.7 MiB | 11 |
| 5120 | 208 ms | 208 ms | 308 ms | 73.5 MiB | 5 |
| 10240 | 413 ms | 414 ms | 621 ms | 145.2 MiB | 2 |

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

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 56.0 µs | 74.3 µs | 60.0 µs | 43.8 KiB | 17,858 |
| 40 | 79.6 µs | 99.1 µs | 279 µs | 85.4 KiB | 12,558 |
| 80 | 167 µs | 192 µs | 481 µs | 174.1 KiB | 5,989 |
| 160 | 286 µs | 421 µs | 844 µs | 365.1 KiB | 3,493 |
| 320 | 584 µs | 797 µs | 1.59 ms | 795.3 KiB | 1,711 |
| 640 | 1.35 ms | 1.73 ms | 3.21 ms | 1.8 MiB | 741 |
| 1280 | 5.83 ms | 6.12 ms | 8.68 ms | 4.2 MiB | 172 |
| 2560 | 7.31 ms | 7.63 ms | 10.2 ms | 6.9 MiB | 137 |
| 5120 | 12.7 ms | 13.3 ms | 17.2 ms | 12.3 MiB | 79 |
| 10240 | 26.1 ms | 26.5 ms | 34.5 ms | 22.7 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.95, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 57.3 µs | 64.5 µs | 120 µs | 50.6 KiB | 17,443 |
| 40 | 91.6 µs | 116 µs | 299 µs | 99.7 KiB | 10,920 |
| 80 | 215 µs | 241 µs | 666 µs | 203.0 KiB | 4,659 |
| 160 | 356 µs | 501 µs | 1.12 ms | 422.7 KiB | 2,812 |
| 320 | 725 µs | 934 µs | 2.13 ms | 912.5 KiB | 1,380 |
| 640 | 2.10 ms | 2.54 ms | 6.12 ms | 2.1 MiB | 475 |
| 1280 | 6.87 ms | 7.29 ms | 13.1 ms | 4.6 MiB | 146 |
| 2560 | 9.98 ms | 10.5 ms | 20.4 ms | 7.8 MiB | 100 |
| 5120 | 17.9 ms | 19.2 ms | 36.4 ms | 14.1 MiB | 56 |
| 10240 | 35.6 ms | 36.1 ms | 70.9 ms | 26.2 MiB | 28 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 80 checks** (whole operation: 513 µs)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 322 µs | 322 µs | 63% |
| `run-policies` | 1 | 167 µs | 167 µs | 33% |
| _unattributed_ |  |  | 24.2 µs | 4.7% |

**At 10240 checks** (whole operation: 68.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 39.0 ms | 39.0 ms | 57% |
| `run-policies` | 1 | 26.1 ms | 26.1 ms | 38% |
| _unattributed_ |  |  | 3.03 ms | 4.4% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-13T03:24:11.519Z` → `2026-10-13T03:24:40.163Z` (29 s), ci: CI (run 38340502018)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `afc119595c76905727addb1060a494707befa93e` on `dependabot/npm_and_yarn/dev-dependencies-2e1aa81237`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


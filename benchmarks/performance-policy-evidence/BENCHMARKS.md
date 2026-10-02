# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **244 µs** per operation compared with a bare-minimum baseline (113%), about **$0.00051 – $0.0073 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 1.01).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 244 µs | 41.1 ms |
| Added latency, relative to baseline | 113% | 188% |
| Added CPU time per operation | 650 µs | 44.1 ms |
| Added memory per operation (heap delta) | 320.0 KiB | 40.9 MiB |
| Estimated compute cost per 1M operations | $0.00051 – $0.0073 | $0.086 – $0.496 |
| Single-core throughput ceiling of the overhead alone | 4,103 ops/s | 24 ops/s |

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
| 20 | 60.3 µs | 147 µs | 87.0 µs | 144% | 334 µs | $0.00018 – $0.0038 |
| 40 | 113 µs | 250 µs | 137 µs | 121% | 434 µs | $0.00028 – $0.0049 |
| 80 | 216 µs | 460 µs | 244 µs | 113% | 650 µs | $0.00051 – $0.0073 |
| 160 | 436 µs | 918 µs | 481 µs | 110% | 1.27 ms | $0.001 – $0.014 |
| 320 | 778 µs | 1.62 ms | 846 µs | 109% | 1.68 ms | $0.0018 – $0.019 |
| 640 | 1.57 ms | 3.11 ms | 1.54 ms | 98% | 1.89 ms | $0.0032 – $0.021 |
| 1280 | 2.90 ms | 12.7 ms | 9.83 ms | 338% | 10.1 ms | $0.020 – $0.114 |
| 2560 | 5.63 ms | 18.7 ms | 13.0 ms | 232% | 13.8 ms | $0.027 – $0.156 |
| 5120 | 11.1 ms | 32.8 ms | 21.7 ms | 196% | 24.8 ms | $0.045 – $0.279 |
| 10240 | 21.9 ms | 63.1 ms | 41.1 ms | 188% | 44.1 ms | $0.086 – $0.496 |

**How the total grows:** O(n) (linear), exponent 1.01 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 294 µs | 36.4 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 3.09 ms | 415 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 121 µs | 24.6 ms |
| `runPolicies` (chatty-output) | O(n) | O(n log n) | 🟡 close (neighbouring class) | 167 µs | 37.4 ms |

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
| 20 | 79.9 µs | 83.9 µs | 252 µs | 49.2 KiB | 12,515 |
| 40 | 155 µs | 162 µs | 465 µs | 97.4 KiB | 6,450 |
| 80 | 294 µs | 300 µs | 824 µs | 197.5 KiB | 3,404 |
| 160 | 552 µs | 612 µs | 1.36 ms | 409.0 KiB | 1,813 |
| 320 | 1.11 ms | 1.15 ms | 2.74 ms | 884.8 KiB | 901 |
| 640 | 2.04 ms | 2.20 ms | 3.68 ms | 2.0 MiB | 490 |
| 1280 | 7.35 ms | 7.46 ms | 9.03 ms | 4.5 MiB | 136 |
| 2560 | 11.3 ms | 11.6 ms | 13.2 ms | 7.7 MiB | 89 |
| 5120 | 19.8 ms | 21.6 ms | 23.0 ms | 13.7 MiB | 50 |
| 10240 | 36.4 ms | 37.6 ms | 40.5 ms | 25.9 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 799 µs | 811 µs | 1.62 ms | 290.6 KiB | 1,251 |
| 40 | 1.58 ms | 1.61 ms | 3.23 ms | 578.5 KiB | 634 |
| 80 | 3.09 ms | 3.59 ms | 4.88 ms | 1.1 MiB | 324 |
| 160 | 5.73 ms | 5.83 ms | 7.81 ms | 2.3 MiB | 175 |
| 320 | 11.2 ms | 11.3 ms | 13.9 ms | 4.7 MiB | 89 |
| 640 | 22.1 ms | 22.3 ms | 25.7 ms | 9.7 MiB | 45 |
| 1280 | 47.0 ms | 49.1 ms | 53.3 ms | 19.9 MiB | 21 |
| 2560 | 91.8 ms | 101 ms | 102 ms | 38.2 MiB | 11 |
| 5120 | 209 ms | 210 ms | 310 ms | 72.6 MiB | 5 |
| 10240 | 415 ms | 419 ms | 624 ms | 143.5 MiB | 2 |

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

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 50.5 µs | 61.4 µs | 51.8 µs | 45.2 KiB | 19,813 |
| 40 | 68.4 µs | 87.5 µs | 222 µs | 86.2 KiB | 14,618 |
| 80 | 121 µs | 154 µs | 388 µs | 175.8 KiB | 8,288 |
| 160 | 262 µs | 320 µs | 821 µs | 368.7 KiB | 3,818 |
| 320 | 485 µs | 644 µs | 1.40 ms | 804.4 KiB | 2,064 |
| 640 | 1.07 ms | 1.35 ms | 2.93 ms | 1.8 MiB | 938 |
| 1280 | 5.43 ms | 5.79 ms | 8.08 ms | 4.2 MiB | 184 |
| 2560 | 7.16 ms | 7.47 ms | 10.3 ms | 7.0 MiB | 140 |
| 5120 | 12.0 ms | 12.4 ms | 16.4 ms | 12.4 MiB | 83 |
| 10240 | 24.6 ms | 25.4 ms | 33.3 ms | 23.1 MiB | 41 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.13, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 47.7 µs | 52.7 µs | 51.2 µs | 51.0 KiB | 20,960 |
| 40 | 82.7 µs | 97.4 µs | 282 µs | 100.7 KiB | 12,093 |
| 80 | 167 µs | 198 µs | 536 µs | 204.7 KiB | 5,986 |
| 160 | 323 µs | 414 µs | 1.01 ms | 426.2 KiB | 3,097 |
| 320 | 682 µs | 869 µs | 2.11 ms | 919.5 KiB | 1,465 |
| 640 | 1.71 ms | 2.02 ms | 5.37 ms | 2.1 MiB | 584 |
| 1280 | 7.51 ms | 8.23 ms | 13.7 ms | 4.7 MiB | 133 |
| 2560 | 10.6 ms | 11.2 ms | 21.3 ms | 7.8 MiB | 94 |
| 5120 | 19.5 ms | 19.9 ms | 38.6 ms | 14.2 MiB | 51 |
| 10240 | 37.4 ms | 38.5 ms | 73.6 ms | 26.4 MiB | 27 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 80 checks** (total added: 244 µs)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 294 µs | 121% | 64% |
| `run-policies` | 1 | 121 µs | 50% | 26% |
| _unattributed_ |  | 0 | 0.0% |  |

**At 10240 checks** (total added: 41.1 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 36.4 ms | 88% | 58% |
| `run-policies` | 1 | 24.6 ms | 60% | 39% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-02T01:10:59.323Z` → `2026-10-02T01:11:27.131Z` (28 s), ci
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `b07c91a8c03cc24917a0038c33290079d3291a61` on `chore/repin-ipc-8e8f680` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


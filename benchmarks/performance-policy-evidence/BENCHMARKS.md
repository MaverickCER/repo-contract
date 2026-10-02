# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **262 µs** per operation compared with a bare-minimum baseline (123%), about **$0.00055 – $0.0072 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 1.00).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 262 µs | 40.5 ms |
| Added latency, relative to baseline | 123% | 185% |
| Added CPU time per operation | 640 µs | 43.2 ms |
| Added memory per operation (heap delta) | 320.0 KiB | 41.6 MiB |
| Estimated compute cost per 1M operations | $0.00055 – $0.0072 | $0.084 – $0.485 |
| Single-core throughput ceiling of the overhead alone | 3,821 ops/s | 25 ops/s |

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
| 20 | 62.4 µs | 153 µs | 90.9 µs | 146% | 313 µs | $0.00019 – $0.0035 |
| 40 | 111 µs | 262 µs | 151 µs | 136% | 430 µs | $0.00031 – $0.0048 |
| 80 | 213 µs | 475 µs | 262 µs | 123% | 640 µs | $0.00055 – $0.0072 |
| 160 | 425 µs | 959 µs | 534 µs | 126% | 1.32 ms | $0.0011 – $0.015 |
| 320 | 768 µs | 1.70 ms | 933 µs | 122% | 1.71 ms | $0.0019 – $0.019 |
| 640 | 1.54 ms | 3.27 ms | 1.73 ms | 112% | 2.06 ms | $0.0036 – $0.023 |
| 1280 | 2.88 ms | 12.5 ms | 9.67 ms | 336% | 10.2 ms | $0.020 – $0.115 |
| 2560 | 5.59 ms | 18.6 ms | 13.0 ms | 232% | 13.2 ms | $0.027 – $0.148 |
| 5120 | 11.0 ms | 32.8 ms | 21.8 ms | 197% | 22.0 ms | $0.045 – $0.247 |
| 10240 | 21.9 ms | 62.5 ms | 40.5 ms | 185% | 43.2 ms | $0.084 – $0.485 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 296 µs | 36.5 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.97 ms | 414 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 154 µs | 25.1 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 167 µs | 36.3 ms |

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
| 20 | 83.4 µs | 88.7 µs | 257 µs | 49.2 KiB | 11,986 |
| 40 | 156 µs | 185 µs | 437 µs | 97.4 KiB | 6,391 |
| 80 | 296 µs | 307 µs | 738 µs | 197.5 KiB | 3,377 |
| 160 | 566 µs | 671 µs | 1.31 ms | 409.0 KiB | 1,766 |
| 320 | 1.13 ms | 1.23 ms | 2.63 ms | 884.8 KiB | 887 |
| 640 | 2.06 ms | 2.13 ms | 3.60 ms | 2.0 MiB | 485 |
| 1280 | 7.15 ms | 7.95 ms | 8.57 ms | 4.5 MiB | 140 |
| 2560 | 12.3 ms | 14.1 ms | 13.9 ms | 7.7 MiB | 81 |
| 5120 | 19.2 ms | 19.6 ms | 21.4 ms | 13.7 MiB | 52 |
| 10240 | 36.5 ms | 37.0 ms | 40.0 ms | 26.0 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 789 µs | 827 µs | 1.54 ms | 290.6 KiB | 1,268 |
| 40 | 1.58 ms | 1.61 ms | 3.17 ms | 578.5 KiB | 633 |
| 80 | 2.97 ms | 3.47 ms | 4.68 ms | 1.1 MiB | 337 |
| 160 | 5.66 ms | 5.70 ms | 7.58 ms | 2.3 MiB | 177 |
| 320 | 11.1 ms | 11.2 ms | 13.4 ms | 4.7 MiB | 90 |
| 640 | 22.1 ms | 22.5 ms | 25.4 ms | 9.7 MiB | 45 |
| 1280 | 46.9 ms | 49.4 ms | 52.4 ms | 19.9 MiB | 21 |
| 2560 | 91.3 ms | 98.2 ms | 101 ms | 38.2 MiB | 11 |
| 5120 | 208 ms | 208 ms | 308 ms | 72.6 MiB | 5 |
| 10240 | 414 ms | 416 ms | 624 ms | 143.6 MiB | 2 |

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
| 20 | 45.7 µs | 50.7 µs | 47.4 µs | 43.9 KiB | 21,868 |
| 40 | 69.9 µs | 90.9 µs | 226 µs | 86.2 KiB | 14,307 |
| 80 | 154 µs | 182 µs | 447 µs | 175.8 KiB | 6,480 |
| 160 | 263 µs | 369 µs | 782 µs | 368.7 KiB | 3,796 |
| 320 | 519 µs | 699 µs | 1.41 ms | 804.4 KiB | 1,927 |
| 640 | 1.11 ms | 1.26 ms | 2.84 ms | 1.8 MiB | 897 |
| 1280 | 5.06 ms | 5.39 ms | 7.54 ms | 4.2 MiB | 198 |
| 2560 | 7.14 ms | 7.51 ms | 10.0 ms | 7.0 MiB | 140 |
| 5120 | 13.1 ms | 13.7 ms | 17.9 ms | 12.4 MiB | 77 |
| 10240 | 25.1 ms | 26.2 ms | 33.2 ms | 23.1 MiB | 40 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.10, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 52.3 µs | 57.8 µs | 55.9 µs | 51.1 KiB | 19,102 |
| 40 | 102 µs | 115 µs | 327 µs | 100.7 KiB | 9,839 |
| 80 | 167 µs | 215 µs | 514 µs | 204.7 KiB | 5,979 |
| 160 | 338 µs | 439 µs | 1.08 ms | 426.2 KiB | 2,959 |
| 320 | 692 µs | 952 µs | 2.01 ms | 909.9 KiB | 1,446 |
| 640 | 1.67 ms | 1.96 ms | 5.17 ms | 2.1 MiB | 597 |
| 1280 | 6.74 ms | 7.19 ms | 12.8 ms | 4.7 MiB | 148 |
| 2560 | 9.97 ms | 10.3 ms | 20.3 ms | 7.8 MiB | 100 |
| 5120 | 18.7 ms | 19.4 ms | 37.2 ms | 14.2 MiB | 54 |
| 10240 | 36.3 ms | 37.4 ms | 71.4 ms | 26.4 MiB | 28 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 80 checks** (total added: 262 µs)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 296 µs | 113% | 62% |
| `run-policies` | 1 | 154 µs | 59% | 33% |
| _unattributed_ |  | 0 | 0.0% |  |

**At 10240 checks** (total added: 40.5 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 36.5 ms | 90% | 58% |
| `run-policies` | 1 | 25.1 ms | 62% | 40% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-02T05:02:42.538Z` → `2026-10-02T05:03:10.627Z` (28 s), ci
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `497835dd13fcdb0a77165f9285e84579d5c12948` on `dependabot/npm_and_yarn/js-yaml-4.3.2` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


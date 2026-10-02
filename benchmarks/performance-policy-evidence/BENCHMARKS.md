# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **268 µs** per operation compared with a bare-minimum baseline (124%), about **$0.00056 – $0.0071 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 1.00).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 268 µs | 42.7 ms |
| Added latency, relative to baseline | 124% | 192% |
| Added CPU time per operation | 630 µs | 46.7 ms |
| Added memory per operation (heap delta) | 320.0 KiB | 40.9 MiB |
| Estimated compute cost per 1M operations | $0.00056 – $0.0071 | $0.089 – $0.525 |
| Single-core throughput ceiling of the overhead alone | 3,737 ops/s | 23 ops/s |

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
| 20 | 60.6 µs | 175 µs | 115 µs | 190% | 471 µs | $0.00024 – $0.0053 |
| 40 | 110 µs | 267 µs | 156 µs | 141% | 442 µs | $0.00033 – $0.005 |
| 80 | 215 µs | 483 µs | 268 µs | 124% | 630 µs | $0.00056 – $0.0071 |
| 160 | 431 µs | 982 µs | 551 µs | 128% | 1.29 ms | $0.0011 – $0.014 |
| 320 | 768 µs | 1.72 ms | 947 µs | 123% | 1.72 ms | $0.002 – $0.019 |
| 640 | 1.54 ms | 3.54 ms | 2.00 ms | 130% | 2.48 ms | $0.0042 – $0.028 |
| 1280 | 2.87 ms | 13.2 ms | 10.3 ms | 359% | 11.1 ms | $0.021 – $0.124 |
| 2560 | 5.61 ms | 18.9 ms | 13.3 ms | 237% | 14.2 ms | $0.028 – $0.159 |
| 5120 | 11.4 ms | 34.0 ms | 22.6 ms | 199% | 24.7 ms | $0.047 – $0.278 |
| 10240 | 22.3 ms | 65.0 ms | 42.7 ms | 192% | 46.7 ms | $0.089 – $0.525 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 297 µs | 37.3 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.94 ms | 404 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 146 µs | 26.2 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 201 µs | 37.0 ms |

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
| 20 | 85.8 µs | 99.5 µs | 270 µs | 49.2 KiB | 11,650 |
| 40 | 157 µs | 177 µs | 444 µs | 97.4 KiB | 6,381 |
| 80 | 297 µs | 305 µs | 784 µs | 197.5 KiB | 3,366 |
| 160 | 559 µs | 575 µs | 1.29 ms | 409.0 KiB | 1,790 |
| 320 | 1.15 ms | 1.32 ms | 2.72 ms | 884.8 KiB | 870 |
| 640 | 2.15 ms | 2.27 ms | 3.89 ms | 2.0 MiB | 464 |
| 1280 | 7.21 ms | 7.55 ms | 8.97 ms | 4.5 MiB | 139 |
| 2560 | 11.1 ms | 12.9 ms | 13.3 ms | 7.7 MiB | 90 |
| 5120 | 19.7 ms | 20.4 ms | 21.4 ms | 13.7 MiB | 51 |
| 10240 | 37.3 ms | 37.5 ms | 40.9 ms | 26.0 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 789 µs | 801 µs | 1.59 ms | 290.6 KiB | 1,268 |
| 40 | 1.57 ms | 1.59 ms | 3.19 ms | 578.5 KiB | 638 |
| 80 | 2.94 ms | 3.49 ms | 4.81 ms | 1.1 MiB | 340 |
| 160 | 5.66 ms | 5.75 ms | 7.80 ms | 2.3 MiB | 177 |
| 320 | 11.1 ms | 11.2 ms | 13.7 ms | 4.7 MiB | 90 |
| 640 | 22.0 ms | 22.1 ms | 25.6 ms | 9.7 MiB | 45 |
| 1280 | 47.2 ms | 48.9 ms | 53.0 ms | 19.9 MiB | 21 |
| 2560 | 90.8 ms | 97.3 ms | 102 ms | 38.2 MiB | 11 |
| 5120 | 207 ms | 208 ms | 305 ms | 72.6 MiB | 5 |
| 10240 | 404 ms | 409 ms | 610 ms | 143.6 MiB | 2 |

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

**Measured: O(n)** (exponent 1.06, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 54.4 µs | 65.4 µs | 72.0 µs | 45.0 KiB | 18,398 |
| 40 | 82.7 µs | 110 µs | 258 µs | 86.3 KiB | 12,086 |
| 80 | 146 µs | 193 µs | 455 µs | 175.9 KiB | 6,843 |
| 160 | 277 µs | 401 µs | 816 µs | 368.7 KiB | 3,605 |
| 320 | 596 µs | 760 µs | 1.60 ms | 794.9 KiB | 1,678 |
| 640 | 1.46 ms | 1.86 ms | 3.47 ms | 1.8 MiB | 684 |
| 1280 | 5.55 ms | 5.86 ms | 8.31 ms | 4.2 MiB | 180 |
| 2560 | 8.14 ms | 8.75 ms | 11.3 ms | 7.0 MiB | 123 |
| 5120 | 13.5 ms | 14.2 ms | 18.5 ms | 12.4 MiB | 74 |
| 10240 | 26.2 ms | 27.1 ms | 34.2 ms | 22.9 MiB | 38 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 58.8 µs | 63.6 µs | 247 µs | 51.0 KiB | 17,000 |
| 40 | 104 µs | 126 µs | 343 µs | 100.7 KiB | 9,575 |
| 80 | 201 µs | 256 µs | 660 µs | 204.8 KiB | 4,982 |
| 160 | 447 µs | 529 µs | 1.54 ms | 427.2 KiB | 2,239 |
| 320 | 1.10 ms | 1.22 ms | 3.82 ms | 925.4 KiB | 910 |
| 640 | 2.13 ms | 2.44 ms | 6.27 ms | 2.1 MiB | 469 |
| 1280 | 7.22 ms | 7.76 ms | 13.2 ms | 4.7 MiB | 139 |
| 2560 | 10.5 ms | 10.9 ms | 20.8 ms | 7.8 MiB | 95 |
| 5120 | 19.2 ms | 21.8 ms | 37.7 ms | 14.2 MiB | 52 |
| 10240 | 37.0 ms | 37.9 ms | 71.9 ms | 26.2 MiB | 27 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 80 checks** (total added: 268 µs)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 297 µs | 111% | 62% |
| `run-policies` | 1 | 146 µs | 55% | 30% |
| _unattributed_ |  | 0 | 0.0% |  |

**At 10240 checks** (total added: 42.7 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 37.3 ms | 87% | 57% |
| `run-policies` | 1 | 26.2 ms | 61% | 40% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-02T05:11:12.663Z` → `2026-10-02T05:11:41.012Z` (28 s), ci
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `abfc060144f6300a36cadcbc957dc836136189c9` on `chore/repin-ipc-0.6.0` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


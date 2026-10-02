# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **268 µs** per operation compared with a bare-minimum baseline (125%), about **$0.00056 – $0.0073 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 1.00).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 268 µs | 40.7 ms |
| Added latency, relative to baseline | 125% | 185% |
| Added CPU time per operation | 653 µs | 40.9 ms |
| Added memory per operation (heap delta) | 320.0 KiB | 41.4 MiB |
| Estimated compute cost per 1M operations | $0.00056 – $0.0073 | $0.085 – $0.459 |
| Single-core throughput ceiling of the overhead alone | 3,725 ops/s | 25 ops/s |

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
| 20 | 62.5 µs | 173 µs | 110 µs | 177% | 456 µs | $0.00023 – $0.0051 |
| 40 | 111 µs | 286 µs | 176 µs | 159% | 483 µs | $0.00037 – $0.0054 |
| 80 | 214 µs | 483 µs | 268 µs | 125% | 653 µs | $0.00056 – $0.0073 |
| 160 | 430 µs | 833 µs | 403 µs | 94% | 407 µs | $0.00084 – $0.0046 |
| 320 | 769 µs | 1.68 ms | 911 µs | 118% | 1.69 ms | $0.0019 – $0.019 |
| 640 | 1.56 ms | 3.23 ms | 1.67 ms | 107% | 2.01 ms | $0.0035 – $0.023 |
| 1280 | 2.88 ms | 12.2 ms | 9.32 ms | 323% | 10.1 ms | $0.019 – $0.114 |
| 2560 | 5.60 ms | 18.3 ms | 12.7 ms | 228% | 13.2 ms | $0.027 – $0.148 |
| 5120 | 11.1 ms | 38.2 ms | 27.0 ms | 243% | 30.5 ms | $0.056 – $0.343 |
| 10240 | 22.0 ms | 62.7 ms | 40.7 ms | 185% | 40.9 ms | $0.085 – $0.459 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 298 µs | 36.5 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 2.91 ms | 409 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 143 µs | 33.6 ms |
| `runPolicies` (chatty-output) | O(n) | O(n log n) | 🟡 close (neighbouring class) | 186 µs | 37.7 ms |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 89.0 µs | 96.7 µs | 300 µs | 49.2 KiB | 11,233 |
| 40 | 157 µs | 178 µs | 452 µs | 97.4 KiB | 6,352 |
| 80 | 298 µs | 314 µs | 793 µs | 197.5 KiB | 3,352 |
| 160 | 557 µs | 707 µs | 1.31 ms | 409.0 KiB | 1,794 |
| 320 | 1.12 ms | 1.15 ms | 2.64 ms | 884.8 KiB | 891 |
| 640 | 2.03 ms | 2.11 ms | 3.56 ms | 2.0 MiB | 493 |
| 1280 | 6.96 ms | 7.21 ms | 8.59 ms | 4.5 MiB | 144 |
| 2560 | 11.1 ms | 11.8 ms | 13.4 ms | 7.7 MiB | 90 |
| 5120 | 18.5 ms | 20.1 ms | 20.4 ms | 13.7 MiB | 54 |
| 10240 | 36.5 ms | 36.7 ms | 40.3 ms | 25.9 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 879 µs | 928 µs | 2.45 ms | 290.8 KiB | 1,137 |
| 40 | 1.56 ms | 1.59 ms | 3.15 ms | 578.5 KiB | 639 |
| 80 | 2.91 ms | 3.50 ms | 4.64 ms | 1.1 MiB | 344 |
| 160 | 5.56 ms | 5.82 ms | 7.52 ms | 2.3 MiB | 180 |
| 320 | 10.8 ms | 11.0 ms | 13.2 ms | 4.7 MiB | 92 |
| 640 | 21.7 ms | 22.0 ms | 25.0 ms | 9.7 MiB | 46 |
| 1280 | 45.9 ms | 48.0 ms | 51.6 ms | 19.9 MiB | 22 |
| 2560 | 90.5 ms | 98.9 ms | 104 ms | 38.2 MiB | 11 |
| 5120 | 203 ms | 211 ms | 305 ms | 72.6 MiB | 5 |
| 10240 | 409 ms | 417 ms | 641 ms | 143.5 MiB | 2 |

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

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 51.1 µs | 70.6 µs | 52.7 µs | 44.3 KiB | 19,570 |
| 40 | 72.0 µs | 102 µs | 227 µs | 86.2 KiB | 13,894 |
| 80 | 143 µs | 185 µs | 454 µs | 175.9 KiB | 6,996 |
| 160 | 270 µs | 386 µs | 792 µs | 368.7 KiB | 3,708 |
| 320 | 611 µs | 798 µs | 1.60 ms | 804.4 KiB | 1,638 |
| 640 | 1.31 ms | 1.82 ms | 3.14 ms | 1.8 MiB | 762 |
| 1280 | 4.84 ms | 5.28 ms | 6.96 ms | 4.2 MiB | 207 |
| 2560 | 6.97 ms | 8.08 ms | 10.1 ms | 7.0 MiB | 143 |
| 5120 | 12.1 ms | 14.4 ms | 16.8 ms | 12.4 MiB | 83 |
| 10240 | 33.6 ms | 36.5 ms | 44.5 ms | 22.8 MiB | 30 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 54.2 µs | 59.4 µs | 122 µs | 51.0 KiB | 18,448 |
| 40 | 91.1 µs | 112 µs | 299 µs | 100.7 KiB | 10,973 |
| 80 | 186 µs | 222 µs | 619 µs | 204.8 KiB | 5,377 |
| 160 | 339 µs | 439 µs | 994 µs | 426.2 KiB | 2,949 |
| 320 | 1.11 ms | 1.38 ms | 3.81 ms | 925.4 KiB | 904 |
| 640 | 1.80 ms | 3.05 ms | 5.50 ms | 2.1 MiB | 554 |
| 1280 | 6.50 ms | 8.55 ms | 12.6 ms | 4.7 MiB | 154 |
| 2560 | 12.9 ms | 13.6 ms | 25.2 ms | 7.8 MiB | 77 |
| 5120 | 19.0 ms | 26.1 ms | 37.1 ms | 14.2 MiB | 53 |
| 10240 | 37.7 ms | 57.0 ms | 74.8 ms | 26.5 MiB | 27 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 80 checks** (total added: 268 µs)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 298 µs | 111% | 62% |
| `run-policies` | 1 | 143 µs | 53% | 30% |
| _unattributed_ |  | 0 | 0.0% |  |

**At 10240 checks** (total added: 40.7 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 36.5 ms | 90% | 58% |
| `run-policies` | 1 | 33.6 ms | 82% | 54% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-02T20:22:39.157Z` → `2026-10-02T20:23:07.539Z` (28 s), ci
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `a5383d3bed68df6e715b3c082042de50cb2365c3` on `fix/dependabot-alerts` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


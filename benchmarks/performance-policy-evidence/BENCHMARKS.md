# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **80 checks** per operation, routing the work through `repo-contract` adds **245 µs** per operation compared with a bare-minimum baseline (106%), about **$0.00051 – $0.0056 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 1.00).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (80 checks) | Largest (10240 checks) |
| --- | --- | --- |
| Added latency per operation | 245 µs | 38.5 ms |
| Added latency, relative to baseline | 106% | 174% |
| Added CPU time per operation | 495 µs | 40.8 ms |
| Added memory per operation (heap delta) | 320.0 KiB | 41.5 MiB |
| Estimated compute cost per 1M operations | $0.00051 – $0.0056 | $0.080 – $0.459 |
| Single-core throughput ceiling of the overhead alone | 4,089 ops/s | 26 ops/s |

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
| 20 | 62.8 µs | 152 µs | 89.7 µs | 143% | 309 µs | $0.00019 – $0.0035 |
| 40 | 116 µs | 278 µs | 162 µs | 139% | 404 µs | $0.00034 – $0.0045 |
| 80 | 231 µs | 476 µs | 245 µs | 106% | 495 µs | $0.00051 – $0.0056 |
| 160 | 437 µs | 953 µs | 516 µs | 118% | 1.27 ms | $0.0011 – $0.014 |
| 320 | 774 µs | 1.69 ms | 915 µs | 118% | 1.72 ms | $0.0019 – $0.019 |
| 640 | 1.55 ms | 3.28 ms | 1.73 ms | 111% | 2.10 ms | $0.0036 – $0.024 |
| 1280 | 2.90 ms | 12.9 ms | 10.0 ms | 347% | 10.5 ms | $0.021 – $0.118 |
| 2560 | 5.61 ms | 19.4 ms | 13.8 ms | 246% | 14.1 ms | $0.029 – $0.158 |
| 5120 | 11.1 ms | 32.7 ms | 21.6 ms | 195% | 23.9 ms | $0.045 – $0.269 |
| 10240 | 22.1 ms | 60.6 ms | 38.5 ms | 174% | 40.8 ms | $0.080 – $0.459 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 80 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `buildEvidence` (quiet-output) | O(n) | O(n) | ✅ matches | 293 µs | 36.6 ms |
| `buildEvidence` (chatty-output) | O(n) | O(n) | ✅ matches | 3.03 ms | 404 ms |
| `runPolicies` (quiet-output) | O(n) | O(n) | ✅ matches | 146 µs | 23.6 ms |
| `runPolicies` (chatty-output) | O(n) | O(n) | ✅ matches | 178 µs | 34.8 ms |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 84.6 µs | 90.1 µs | 270 µs | 49.2 KiB | 11,816 |
| 40 | 155 µs | 179 µs | 443 µs | 97.4 KiB | 6,452 |
| 80 | 293 µs | 301 µs | 778 µs | 197.5 KiB | 3,411 |
| 160 | 551 µs | 573 µs | 1.29 ms | 409.0 KiB | 1,814 |
| 320 | 1.11 ms | 1.27 ms | 2.62 ms | 884.8 KiB | 902 |
| 640 | 2.06 ms | 2.20 ms | 3.63 ms | 2.0 MiB | 485 |
| 1280 | 6.90 ms | 7.24 ms | 8.31 ms | 4.5 MiB | 145 |
| 2560 | 10.8 ms | 11.1 ms | 12.8 ms | 7.7 MiB | 93 |
| 5120 | 19.7 ms | 21.6 ms | 21.7 ms | 13.7 MiB | 51 |
| 10240 | 36.6 ms | 37.3 ms | 40.3 ms | 26.0 MiB | 27 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 780 µs | 794 µs | 1.55 ms | 290.6 KiB | 1,282 |
| 40 | 1.55 ms | 1.57 ms | 3.11 ms | 578.5 KiB | 647 |
| 80 | 3.03 ms | 3.45 ms | 4.73 ms | 1.1 MiB | 330 |
| 160 | 5.58 ms | 5.73 ms | 7.53 ms | 2.3 MiB | 179 |
| 320 | 10.9 ms | 11.1 ms | 13.3 ms | 4.7 MiB | 92 |
| 640 | 21.7 ms | 22.2 ms | 25.0 ms | 9.7 MiB | 46 |
| 1280 | 46.1 ms | 48.6 ms | 51.5 ms | 19.9 MiB | 22 |
| 2560 | 90.0 ms | 95.8 ms | 103 ms | 38.2 MiB | 11 |
| 5120 | 203 ms | 204 ms | 302 ms | 72.6 MiB | 5 |
| 10240 | 404 ms | 404 ms | 609 ms | 143.5 MiB | 2 |

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
| 20 | 44.9 µs | 49.2 µs | 184 µs | 43.8 KiB | 22,273 |
| 40 | 73.5 µs | 91.8 µs | 247 µs | 86.3 KiB | 13,601 |
| 80 | 146 µs | 194 µs | 484 µs | 175.9 KiB | 6,830 |
| 160 | 269 µs | 367 µs | 790 µs | 368.7 KiB | 3,721 |
| 320 | 516 µs | 718 µs | 1.41 ms | 803.3 KiB | 1,936 |
| 640 | 1.13 ms | 1.54 ms | 2.84 ms | 1.8 MiB | 884 |
| 1280 | 5.10 ms | 5.31 ms | 7.25 ms | 4.2 MiB | 196 |
| 2560 | 6.99 ms | 7.48 ms | 10.0 ms | 7.0 MiB | 143 |
| 5120 | 11.4 ms | 12.2 ms | 15.8 ms | 12.4 MiB | 87 |
| 10240 | 23.6 ms | 24.2 ms | 31.3 ms | 23.1 MiB | 42 |

#### Variant `chatty-output`

Each check printed about 10 KB of JSON (a linter with many findings).

**Measured: O(n)** (exponent 1.10, 10 sizes) -- ✅ matches.

| checks | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 52.9 µs | 56.6 µs | 210 µs | 51.0 KiB | 18,919 |
| 40 | 87.4 µs | 109 µs | 299 µs | 100.7 KiB | 11,439 |
| 80 | 178 µs | 221 µs | 527 µs | 204.7 KiB | 5,631 |
| 160 | 339 µs | 453 µs | 1.09 ms | 426.2 KiB | 2,952 |
| 320 | 857 µs | 975 µs | 3.25 ms | 925.4 KiB | 1,166 |
| 640 | 1.62 ms | 2.34 ms | 5.07 ms | 2.1 MiB | 618 |
| 1280 | 6.49 ms | 7.05 ms | 12.2 ms | 4.7 MiB | 154 |
| 2560 | 10.0 ms | 10.5 ms | 20.0 ms | 7.8 MiB | 100 |
| 5120 | 17.8 ms | 18.2 ms | 36.1 ms | 14.1 MiB | 56 |
| 10240 | 34.8 ms | 36.0 ms | 68.9 ms | 26.6 MiB | 29 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 80 checks** (total added: 245 µs)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 293 µs | 120% | 62% |
| `run-policies` | 1 | 146 µs | 60% | 31% |
| _unattributed_ |  | 0 | 0.0% |  |

**At 10240 checks** (total added: 38.5 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `build-evidence` | 1 | 36.6 ms | 95% | 60% |
| `run-policies` | 1 | 23.6 ms | 61% | 39% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-02T15:40:31.086Z` → `2026-10-02T15:40:59.154Z` (28 s), ci
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `30e7147bc1489e7a28e02fdfe779577efa1dda49` on `chore/repin-ipc-0.7.0` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 checks -- One check result entering evidence assembly and policy evaluation. 80 is a large real repository's contract; the ladder shows how both stages scale well beyond it.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


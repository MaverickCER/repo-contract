# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **3.96 s** per operation compared with a bare-minimum baseline (1,411× baseline), about **$17.70 – $65.18 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 1.02).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 3.96 s | 32.6 s |
| Added latency, relative to baseline | 1,411× baseline | 2,658× baseline |
| Added CPU time per operation | 5.80 s | 47.5 s |
| Added memory per operation (heap delta) | 274.9 MiB | 377.4 MiB |
| Estimated compute cost per 1M operations | $17.70 – $65.18 | $200.11 – $533.56 |
| Single-core throughput ceiling of the overhead alone | 0 ops/s | 0 ops/s |

## 1. End-to-end: the package's total impact

Shows what a pull request pays, on every API-contract check, to find out whether the public API changed compatibly, compared with the bare minimum of reading the two API descriptions. Both sides start from the same extracted `.api.json` files; the difference is the engine's model loading, normalization and compatibility classification (including its type-assignability probing). This runs on every pull request and every pre-push.

- **Baseline (no package):** Read and JSON-parse the baseline and current API descriptions -- the least anyone would do to look at them.
- **With the package:** Load both API models, normalize them to the public surface, build the reference indexes and classify every change, probing type assignability where needed.

Both sides use empty or minimal functions on purpose, so the difference is the package's own cost -- not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| exported symbols | swept | The tier axis: how many functions the package's public surface exports. |
| surface shape | fixed at "functions with one parameter each" | Interfaces, classes, generics and overloads add proportionally more per symbol and are not covered. |
| change mix | fixed at "about 6% widened, 6% breaking, 2 removed, 2 added" | A realistic mixed diff rather than 'identical' or 'completely different'; more changes mean more assignability probes. |
| extraction | fixed at "excluded" | Compiling and running API Extractor is a separate, larger cost done once per build; it is generated once per size and not measured here. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

The baseline is an empty or minimal function, so it costs almost nothing and the _relative_ overhead can look enormous (shown as a multiple of the baseline). Read the absolute columns -- time, CPU and dollars added -- they are what a bill and a latency budget are made of.

| exports | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 477 µs | 485 ms | 485 ms | 1,017× baseline | 793 ms | $1.01 – $8.92 |
| 40 | 690 µs | 900 ms | 900 ms | 1,304× baseline | 1.30 s | $2.81 – $14.65 |
| 80 | 1.40 ms | 1.77 s | 1.77 s | 1,265× baseline | 2.59 s | $9.79 – $29.10 |
| 160 | 2.81 ms | 3.96 s | 3.96 s | 1,411× baseline | 5.80 s | $17.70 – $65.18 |
| 320 | 4.63 ms | 7.82 s | 7.82 s | 1,691× baseline | 11.3 s | $67.73 – $127.23 |
| 640 | 6.52 ms | 15.8 s | 15.8 s | 2,427× baseline | 23.0 s | $156.71 – $258.42 |
| 1280 | 12.3 ms | 32.6 s | 32.6 s | 2,658× baseline | 47.5 s | $200.11 – $533.56 |

**How the total grows:** O(n) (linear), exponent 1.02 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | O(n) | O(n) | ✅ matches | 44.2 ms | 203 ms |
| `normalizeApiPackage` | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.43 ms | 9.91 ms |
| `classifyContractChanges (with type-assignability probing)` | O(n) | O(n) | ✅ matches | 3.92 s | 33.6 s |

### `loadApiModel (both API descriptions)`

**Why we benchmark it.** The first step of every API-contract check: reading the extracted API descriptions into an in-memory model.

**What poor performance would mean.** Every API check starts slower in proportion to the size of the public surface, and a large model also raises memory use in CI.

**Expected growth: O(n).** Loading parses the JSON description and builds one model item per declaration, so cost is proportional to the size of the surface.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| exported symbols | swept | The tier axis: how many functions the package's public surface exports. |
| surface shape | fixed at "functions with one parameter each" | Interfaces, classes, generics and overloads add proportionally more per symbol and are not covered. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once per API check, loading both the baseline and the current API description (this function loads both).

**Measured: O(n)** (exponent 0.66, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.2 ms | 14.5 ms | 44.4 ms | 1.6 MiB | 89 |
| 40 | 21.9 ms | 24.3 ms | 76.1 ms | 2.9 MiB | 46 |
| 80 | 30.3 ms | 50.9 ms | 88.9 ms | 5.5 MiB | 33 |
| 160 | 44.2 ms | 58.7 ms | 102 ms | 10.5 MiB | 23 |
| 320 | 67.6 ms | 75.4 ms | 133 ms | 19.9 MiB | 15 |
| 640 | 119 ms | 133 ms | 214 ms | 38.6 MiB | 8 |
| 1280 | 203 ms | 221 ms | 326 ms | 18.2 MiB | 5 |

### `normalizeApiPackage`

**Why we benchmark it.** Reduces the loaded model to the comparable public surface (applying release tags and ordering), so two versions can be diffed symbol by symbol.

**What poor performance would mean.** API checks slow down with the size of the surface, and normalization runs twice per check (baseline and current).

**Expected growth: O(n log n).** It walks every declaration once and sorts members into a canonical order so the two versions line up, so the sort adds a log factor to the linear walk.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| exported symbols | swept | The tier axis: how many functions the package's public surface exports. |
| surface shape | fixed at "functions with one parameter each" | Interfaces, classes, generics and overloads add proportionally more per symbol and are not covered. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once per API check, normalizing both the baseline and the current model (this function normalizes both).

**Measured: O(n)** (exponent 0.71, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 454 µs | 561 µs | 1.39 ms | 46.4 KiB | 2,202 |
| 40 | 689 µs | 822 µs | 2.57 ms | 90.5 KiB | 1,451 |
| 80 | 1.36 ms | 1.48 ms | 5.20 ms | 178.5 KiB | 735 |
| 160 | 1.43 ms | 2.19 ms | 4.90 ms | 350.6 KiB | 697 |
| 320 | 2.46 ms | 6.43 ms | 8.98 ms | 686.0 KiB | 407 |
| 640 | 4.95 ms | 6.20 ms | 18.3 ms | 1.3 MiB | 202 |
| 1280 | 9.91 ms | 11.7 ms | 36.6 ms | 2.7 MiB | 101 |

### `classifyContractChanges (with type-assignability probing)`

**Why we benchmark it.** Decides, change by change, whether a pull request breaks consumers -- the verdict that gates a release. It also drives the most expensive step, asking the TypeScript compiler whether one type still accepts another.

**What poor performance would mean.** Slower API checks on every pull request, and the cost lands on exactly the large packages that most need the protection; a super-linear classifier would make the check impractical for them.

**Expected growth: O(n).** It matches symbols by name through maps and classifies each difference once; type-assignability probes happen only for the changed symbols, whose number is a fixed proportion of the surface, so cost is proportional to the size of the surface.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| exported symbols | swept | The tier axis: how many functions the package's public surface exports. |
| surface shape | fixed at "functions with one parameter each" | Interfaces, classes, generics and overloads add proportionally more per symbol and are not covered. |
| change mix | fixed at "about 6% widened, 6% breaking, 2 removed, 2 added" | A realistic mixed diff rather than 'identical' or 'completely different'; more changes mean more assignability probes. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**Deliberately not covered**

- **changes that need the compiler to be conservative** -- Rare generic and conditional-type edge cases take slower probing paths; the synthetic surface uses simple parameter types.

**In the end-to-end run:** Once per API check, after both models are normalized.

**Measured: O(n)** (exponent 1.05, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 428 ms | 473 ms | 615 ms | 93.7 MiB | 2 |
| 40 | 842 ms | 852 ms | 1.20 s | 173.3 MiB | 1 |
| 80 | 1.69 s | 1.75 s | 2.38 s | 357.6 MiB | 1 |
| 160 | 3.92 s | 4.05 s | 5.66 s | 267.8 MiB | 0 |
| 320 | 7.72 s | 7.74 s | 11.2 s | 339.7 MiB | 0 |
| 640 | 15.5 s | 16.2 s | 22.4 s | 109.6 MiB | 0 |
| 1280 | 33.6 s | 33.8 s | 49.3 s | 100.7 MiB | 0 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 160 exports** (total added: 3.96 s)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 3.92 s | 99% | 99% |
| `load-api-model` | 1 | 44.2 ms | 1.1% | 1.1% |
| `normalize-api-package` | 1 | 1.43 ms | 0.0% | 0.0% |
| _unattributed_ |  | 0 | 0.0% |  |

**At 1280 exports** (total added: 32.6 s)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 33.6 s | 103% | 103% |
| `load-api-model` | 1 | 203 ms | 0.6% | 0.6% |
| `normalize-api-package` | 1 | 9.91 ms | 0.0% | 0.0% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-02T20:23:09.068Z` → `2026-10-02T20:32:19.205Z` (550 s), ci
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `a5383d3bed68df6e715b3c082042de50cb2365c3` on `fix/dependabot-alerts` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


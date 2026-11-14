# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **1.80 s** per operation compared with a bare-minimum baseline (**694× the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.03). At list prices that is on the order of **~$10 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 1.80 s | 14.5 s |
| Added latency, relative to baseline | 694× baseline | 1,119× baseline |
| Added CPU time per operation | 2.68 s | 21.0 s |
| Added memory per operation (heap delta) | 89.2 MiB | 125.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$10 | ~$10 – $100 |
| Single-core throughput ceiling of the overhead alone | 1 ops/s | 0 ops/s |

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
| 20 | 500 µs | 229 ms | 229 ms | 459× baseline | 357 ms | $0.476 – $4.01 |
| 40 | 795 µs | 421 ms | 420 ms | 530× baseline | 619 ms | $0.876 – $6.96 |
| 80 | 1.28 ms | 812 ms | 811 ms | 636× baseline | 1.17 s | $2.16 – $13.17 |
| 160 | 2.60 ms | 1.80 s | 1.80 s | 694× baseline | 2.68 s | $3.75 – $30.08 |
| 320 | 4.51 ms | 3.56 s | 3.56 s | 789× baseline | 5.09 s | $27.47 – $57.25 |
| 640 | 7.38 ms | 7.23 s | 7.23 s | 981× baseline | 10.4 s | $41.92 – $117.00 |
| 1280 | 12.9 ms | 14.5 s | 14.5 s | 1,119× baseline | 21.0 s | $30.12 – $235.62 |

**How the total grows:** O(n) (linear), exponent 1.03 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | export | O(n) | O(n) | ✅ matches | 39.9 ms | 211 ms |
| `normalizeApiPackage` | export | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.46 ms | 9.20 ms |
| `classifyContractChanges (with type-assignability probing)` | export | O(n) | O(n) | ✅ matches | 1.70 s | 14.3 s |

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

**Measured: O(n)** (exponent 0.74, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 12.2 ms | 14.9 ms | 45.6 ms | 1.6 MiB | 82 |
| 40 | 18.1 ms | 20.6 ms | 60.5 ms | 2.9 MiB | 55 |
| 80 | 26.9 ms | 28.3 ms | 70.4 ms | 5.5 MiB | 37 |
| 160 | 39.9 ms | 43.0 ms | 86.0 ms | 10.3 MiB | 25 |
| 320 | 61.8 ms | 70.8 ms | 116 ms | 19.8 MiB | 16 |
| 640 | 111 ms | 117 ms | 192 ms | 38.5 MiB | 9 |
| 1280 | 211 ms | 213 ms | 331 ms | 25.0 MiB | 5 |

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

**Measured: O(n)** (exponent 0.74, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 485 µs | 537 µs | 1.28 ms | 65.5 KiB | 2,061 |
| 40 | 815 µs | 3.78 ms | 2.78 ms | 128.8 KiB | 1,227 |
| 80 | 1.36 ms | 1.42 ms | 4.29 ms | 252.4 KiB | 738 |
| 160 | 1.46 ms | 2.39 ms | 4.41 ms | 492.1 KiB | 685 |
| 320 | 2.62 ms | 3.78 ms | 9.82 ms | 986.5 KiB | 382 |
| 640 | 5.53 ms | 5.95 ms | 20.8 ms | 1.8 MiB | 181 |
| 1280 | 9.20 ms | 10.7 ms | 31.0 ms | 3.6 MiB | 109 |

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
| 20 | 203 ms | 229 ms | 305 ms | 44.8 MiB | 5 |
| 40 | 389 ms | 399 ms | 558 ms | 97.5 MiB | 3 |
| 80 | 770 ms | 771 ms | 1.08 s | 169.5 MiB | 1 |
| 160 | 1.70 s | 1.72 s | 2.53 s | 84.6 MiB | 1 |
| 320 | 3.39 s | 3.42 s | 4.82 s | 416.8 MiB | 0 |
| 640 | 6.94 s | 6.96 s | 10.0 s | 242.3 MiB | 0 |
| 1280 | 14.3 s | 14.4 s | 20.6 s | 242.0 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 160 exports** (whole operation: 1.80 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 1.70 s | 1.70 s | 94% |
| `load-api-model` | 1 | 39.9 ms | 39.9 ms | 2.2% |
| `normalize-api-package` | 1 | 1.46 ms | 1.46 ms | 0.1% |
| _unattributed_ |  |  | 61.4 ms | 3.4% |

**At 1280 exports** (whole operation: 14.5 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 14.3 s | 14.3 s | 99% |
| `load-api-model` | 1 | 211 ms | 211 ms | 1.5% |
| `normalize-api-package` | 1 | 9.20 ms | 9.20 ms | 0.1% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-14T07:08:17.695Z` → `2026-11-14T07:12:48.548Z` (271 s), ci: CI (run 43568159906)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `43f31f226cc93a6e1a562cc17be0af699c682afd` on `chore/bump-internal-package-contract-v0.18.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


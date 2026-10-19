# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **1.12 s** per operation compared with a bare-minimum baseline (**811× the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$10 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 1.12 s | 9.39 s |
| Added latency, relative to baseline | 811× baseline | 1,428× baseline |
| Added CPU time per operation | 1.72 s | 14.7 s |
| Added memory per operation (heap delta) | 383.5 MiB | 433.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$10 | ~$100 |
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
| 20 | 201 µs | 135 ms | 135 ms | 672× baseline | 237 ms | $0.281 – $2.66 |
| 40 | 330 µs | 254 ms | 254 ms | 771× baseline | 408 ms | $0.529 – $4.59 |
| 80 | 624 µs | 553 ms | 552 ms | 886× baseline | 889 ms | $1.47 – $10.00 |
| 160 | 1.39 ms | 1.13 s | 1.12 s | 811× baseline | 1.72 s | $7.02 – $19.35 |
| 320 | 2.37 ms | 2.25 s | 2.25 s | 948× baseline | 3.53 s | $13.00 – $39.71 |
| 640 | 3.85 ms | 4.64 s | 4.63 s | 1,205× baseline | 7.27 s | $43.33 – $81.71 |
| 1280 | 6.58 ms | 9.40 s | 9.39 s | 1,428× baseline | 14.7 s | $66.29 – $165.67 |

**How the total grows:** O(n) (linear), exponent 1.02 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | export | O(n) | O(n) | ✅ matches | 24.1 ms | 120 ms |
| `normalizeApiPackage` | export | O(n log n) | O(n) | 🟡 close (neighbouring class) | 937 µs | 6.23 ms |
| `classifyContractChanges (with type-assignability probing)` | export | O(n) | O(n) | ✅ matches | 1.11 s | 9.76 s |

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
| 20 | 5.75 ms | 7.70 ms | 21.7 ms | 1.5 MiB | 174 |
| 40 | 11.1 ms | 12.1 ms | 43.8 ms | 2.9 MiB | 90 |
| 80 | 15.3 ms | 24.5 ms | 50.7 ms | 5.5 MiB | 65 |
| 160 | 24.1 ms | 38.3 ms | 61.8 ms | 10.3 MiB | 42 |
| 320 | 35.6 ms | 37.7 ms | 77.9 ms | 19.8 MiB | 28 |
| 640 | 66.9 ms | 85.0 ms | 127 ms | 38.6 MiB | 15 |
| 1280 | 120 ms | 121 ms | 206 ms | 18.1 MiB | 8 |

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

**Measured: O(n)** (exponent 0.76, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 244 µs | 278 µs | 256 µs | 65.2 KiB | 4,104 |
| 40 | 504 µs | 542 µs | 536 µs | 128.8 KiB | 1,984 |
| 80 | 801 µs | 887 µs | 2.67 ms | 252.4 KiB | 1,248 |
| 160 | 937 µs | 1.38 ms | 3.26 ms | 492.1 KiB | 1,067 |
| 320 | 1.57 ms | 3.56 ms | 5.85 ms | 986.5 KiB | 635 |
| 640 | 3.05 ms | 3.73 ms | 12.0 ms | 1.8 MiB | 327 |
| 1280 | 6.23 ms | 7.42 ms | 25.0 ms | 3.6 MiB | 160 |

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

**Measured: O(n)** (exponent 1.07, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 133 ms | 187 ms | 220 ms | 44.8 MiB | 8 |
| 40 | 250 ms | 261 ms | 400 ms | 97.7 MiB | 4 |
| 80 | 498 ms | 506 ms | 773 ms | 169.6 MiB | 2 |
| 160 | 1.11 s | 1.12 s | 1.68 s | 370.2 MiB | 1 |
| 320 | 2.35 s | 2.38 s | 3.67 s | 337.1 MiB | 0 |
| 640 | 4.79 s | 4.80 s | 7.64 s | 213.7 MiB | 0 |
| 1280 | 9.76 s | 9.78 s | 15.3 s | 343.4 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 160 exports** (whole operation: 1.13 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 1.11 s | 1.11 s | 99% |
| `load-api-model` | 1 | 24.1 ms | 24.1 ms | 2.1% |
| `normalize-api-package` | 1 | 937 µs | 937 µs | 0.1% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 1280 exports** (whole operation: 9.40 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 9.76 s | 9.76 s | 104% |
| `load-api-model` | 1 | 120 ms | 120 ms | 1.3% |
| `normalize-api-package` | 1 | 6.23 ms | 6.23 ms | 0.1% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-19T13:00:40.258Z` → `2026-10-19T13:03:40.771Z` (181 s), ci: CI (run 39254970455)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `9a7f16bb0d0e2237799eb2925b1b4d3de7798c99` on `changeset-release/main`
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


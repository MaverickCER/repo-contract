# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **1.13 s** per operation compared with a bare-minimum baseline (**704× the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.06). At list prices that is on the order of **~$1 – $10 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 1.13 s | 9.74 s |
| Added latency, relative to baseline | 704× baseline | 1,233× baseline |
| Added CPU time per operation | 1.82 s | 15.1 s |
| Added memory per operation (heap delta) | 88.9 MiB | 279.1 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$1 – $10 | ~$100 |
| Single-core throughput ceiling of the overhead alone | 1 ops/s | 0 ops/s |

## 1. End-to-end: the package's total impact

Shows what a pull request pays, on every API-contract check, to find out whether the public API changed compatibly, compared with the bare minimum of reading the two API descriptions. Both sides start from the same extracted `.api.json` files; the difference is the engine's model loading, normalization and compatibility classification (including its type-assignability probing). This runs on every pull request and every pre-push.

- **Baseline (no package):** Read and JSON-parse the baseline and current API descriptions -- the least anyone would do to look at them.
- **With the package:** Load both API models, normalize them to the public surface, build the reference indexes and classify every change, probing type assignability where needed.

Both sides use empty or minimal functions on purpose. The difference is then the package's own cost, not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| exported symbols | swept | The tier axis: how many functions the package's public surface exports. |
| surface shape | fixed at "functions with one parameter each" | Interfaces, classes, generics and overloads add proportionally more per symbol and are not covered. |
| change mix | fixed at "about 6% widened, 6% breaking, 2 removed, 2 added" | A realistic mixed diff rather than 'identical' or 'completely different'; more changes mean more assignability probes. |
| extraction | fixed at "excluded" | Compiling and running API Extractor is a separate, larger cost done once per build; it is generated once per size and not measured here. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

The baseline is an empty or minimal function, so it costs almost nothing. The _relative_ overhead can then look enormous (shown as a multiple of the baseline). Read the absolute columns (time, CPU and dollars added): they are what a bill and a latency budget are made of.

| exports | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 354 µs | 135 ms | 135 ms | 382× baseline | 225 ms | $0.282 – $2.53 |
| 40 | 482 µs | 254 ms | 254 ms | 527× baseline | 405 ms | $0.529 – $4.56 |
| 80 | 779 µs | 489 ms | 489 ms | 628× baseline | 763 ms | $1.30 – $8.58 |
| 160 | 1.60 ms | 1.13 s | 1.13 s | 704× baseline | 1.82 s | $2.35 – $20.48 |
| 320 | 2.76 ms | 2.20 s | 2.20 s | 798× baseline | 3.49 s | $4.59 – $39.26 |
| 640 | 4.75 ms | 4.55 s | 4.54 s | 958× baseline | 7.06 s | $23.29 – $79.37 |
| 1280 | 7.91 ms | 9.75 s | 9.74 s | 1,233× baseline | 15.1 s | $44.26 – $169.79 |

**How the total grows:** O(n) (linear), exponent 1.06 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | export | O(n) | O(n) | ✅ matches | 22.6 ms | 121 ms |
| `normalizeApiPackage` | export | O(n log n) | O(n) | 🟡 close (neighbouring class) | 837 µs | 5.99 ms |
| `classifyContractChanges (with type-assignability probing)` | export | O(n) | O(n) | ✅ matches | 1.15 s | 9.51 s |

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

**Measured: O(n)** (exponent 0.74, 7 sizes): ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.37 ms | 7.71 ms | 22.3 ms | 1.6 MiB | 157 |
| 40 | 11.2 ms | 17.2 ms | 41.3 ms | 2.9 MiB | 90 |
| 80 | 15.2 ms | 17.7 ms | 48.0 ms | 5.5 MiB | 66 |
| 160 | 22.6 ms | 23.3 ms | 56.4 ms | 10.5 MiB | 44 |
| 320 | 36.0 ms | 37.1 ms | 72.1 ms | 19.8 MiB | 28 |
| 640 | 62.3 ms | 72.3 ms | 120 ms | 38.6 MiB | 16 |
| 1280 | 121 ms | 126 ms | 210 ms | 24.9 MiB | 8 |

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

**Measured: O(n)** (exponent 0.79, 7 sizes): 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 305 µs | 348 µs | 327 µs | 65.7 KiB | 3,283 |
| 40 | 377 µs | 461 µs | 1.20 ms | 127.1 KiB | 2,653 |
| 80 | 737 µs | 835 µs | 1.91 ms | 249.9 KiB | 1,357 |
| 160 | 837 µs | 1.41 ms | 3.26 ms | 492.1 KiB | 1,195 |
| 320 | 1.65 ms | 2.37 ms | 6.43 ms | 986.5 KiB | 607 |
| 640 | 2.98 ms | 3.77 ms | 11.5 ms | 1.8 MiB | 335 |
| 1280 | 5.99 ms | 6.69 ms | 23.5 ms | 3.7 MiB | 167 |

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

- **changes that need the compiler to be conservative**: Rare generic and conditional-type edge cases take slower probing paths; the synthetic surface uses simple parameter types.

**In the end-to-end run:** Once per API check, after both models are normalized.

**Measured: O(n)** (exponent 1.04, 7 sizes): ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 130 ms | 184 ms | 211 ms | 44.8 MiB | 8 |
| 40 | 257 ms | 261 ms | 398 ms | 97.7 MiB | 4 |
| 80 | 521 ms | 541 ms | 797 ms | 169.6 MiB | 2 |
| 160 | 1.15 s | 1.17 s | 1.85 s | 79.4 MiB | 1 |
| 320 | 2.27 s | 2.29 s | 3.52 s | 416.5 MiB | 0 |
| 640 | 4.69 s | 4.72 s | 7.30 s | 234.7 MiB | 0 |
| 1280 | 9.51 s | 9.52 s | 14.8 s | 221.4 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 160 exports** (whole operation: 1.13 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 1.15 s | 1.15 s | 102% |
| `load-api-model` | 1 | 22.6 ms | 22.6 ms | 2.0% |
| `normalize-api-package` | 1 | 837 µs | 837 µs | 0.1% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 1280 exports** (whole operation: 9.75 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 9.51 s | 9.51 s | 98% |
| `load-api-model` | 1 | 121 ms | 121 ms | 1.2% |
| `normalize-api-package` | 1 | 5.99 ms | 5.99 ms | 0.1% |
| _unattributed_ |  |  | 113 ms | 1.2% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-14T20:53:41.796Z` → `2026-11-14T20:56:43.401Z` (182 s), ci: CI (run 43638758320)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `0c53398b06c4a73ae2cedecd36d3f56ac46c4da4` on `fix/release-build-without-contract`
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports: One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


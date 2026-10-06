# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **2.57 s** per operation compared with a bare-minimum baseline (**1,628× baseline** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.03). At list prices that is on the order of **~$10 – $100 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 2.57 s | 19.9 s |
| Added latency, relative to baseline | 1,628× baseline | 2,652× baseline |
| Added CPU time per operation | 4.00 s | 30.5 s |
| Added memory per operation (heap delta) | 269.5 MiB | 704.1 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$10 – $100 | ~$100 – $1000 |
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
| 20 | 220 µs | 308 ms | 308 ms | 1,400× baseline | 500 ms | $0.641 – $5.62 |
| 40 | 379 µs | 592 ms | 592 ms | 1,564× baseline | 915 ms | $1.77 – $10.29 |
| 80 | 661 µs | 1.10 s | 1.10 s | 1,666× baseline | 1.67 s | $6.31 – $18.73 |
| 160 | 1.58 ms | 2.57 s | 2.57 s | 1,628× baseline | 4.00 s | $11.28 – $44.95 |
| 320 | 2.73 ms | 5.09 s | 5.09 s | 1,864× baseline | 7.96 s | $28.97 – $89.54 |
| 640 | 4.32 ms | 9.80 s | 9.79 s | 2,267× baseline | 15.0 s | $84.45 – $169.07 |
| 1280 | 7.51 ms | 19.9 s | 19.9 s | 2,652× baseline | 30.5 s | $228.29 – $343.37 |

**How the total grows:** O(n) (linear), exponent 1.03 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | O(n) | O(n) | ✅ matches | 25.0 ms | 122 ms |
| `normalizeApiPackage` | O(n log n) | O(n) | 🟡 close (neighbouring class) | 961 µs | 5.83 ms |
| `classifyContractChanges (with type-assignability probing)` | O(n) | O(n) | ✅ matches | 2.38 s | 19.7 s |

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

**Measured: O(n)** (exponent 0.71, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.09 ms | 7.46 ms | 23.8 ms | 1.6 MiB | 164 |
| 40 | 11.1 ms | 11.9 ms | 43.2 ms | 2.8 MiB | 90 |
| 80 | 16.9 ms | 18.9 ms | 57.1 ms | 5.5 MiB | 59 |
| 160 | 25.0 ms | 26.0 ms | 66.0 ms | 10.5 MiB | 40 |
| 320 | 37.7 ms | 40.8 ms | 85.3 ms | 19.8 MiB | 26 |
| 640 | 66.3 ms | 68.7 ms | 130 ms | 38.6 MiB | 15 |
| 1280 | 122 ms | 125 ms | 208 ms | 18.3 MiB | 8 |

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

**Measured: O(n)** (exponent 0.86, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 257 µs | 265 µs | 264 µs | 65.2 KiB | 3,889 |
| 40 | 415 µs | 434 µs | 1.49 ms | 127.1 KiB | 2,412 |
| 80 | 505 µs | 915 µs | 1.97 ms | 247.4 KiB | 1,980 |
| 160 | 961 µs | 1.41 ms | 2.56 ms | 492.1 KiB | 1,041 |
| 320 | 1.62 ms | 2.22 ms | 5.32 ms | 986.5 KiB | 619 |
| 640 | 2.83 ms | 6.98 ms | 10.3 ms | 1.8 MiB | 354 |
| 1280 | 5.83 ms | 6.31 ms | 22.1 ms | 3.6 MiB | 171 |

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

**Measured: O(n)** (exponent 1.06, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 264 ms | 284 ms | 414 ms | 90.6 MiB | 4 |
| 40 | 532 ms | 535 ms | 827 ms | 167.2 MiB | 2 |
| 80 | 1.06 s | 1.10 s | 1.59 s | 340.8 MiB | 1 |
| 160 | 2.38 s | 2.54 s | 3.68 s | 270.7 MiB | 0 |
| 320 | 5.00 s | 5.01 s | 7.72 s | 367.6 MiB | 0 |
| 640 | 10.3 s | 10.5 s | 16.1 s | 413.6 MiB | 0 |
| 1280 | 19.7 s | 19.9 s | 30.4 s | 452.0 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 160 exports** (whole operation: 2.57 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 2.38 s | 2.38 s | 92% |
| `load-api-model` | 1 | 25.0 ms | 25.0 ms | 1.0% |
| `normalize-api-package` | 1 | 961 µs | 961 µs | 0.0% |
| _unattributed_ |  |  | 168 ms | 6.5% |

**At 1280 exports** (whole operation: 19.9 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 19.7 s | 19.7 s | 99% |
| `load-api-model` | 1 | 122 ms | 122 ms | 0.6% |
| `normalize-api-package` | 1 | 5.83 ms | 5.83 ms | 0.0% |
| _unattributed_ |  |  | 87.4 ms | 0.4% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-06T18:38:30.704Z` → `2026-10-06T18:44:19.850Z` (349 s), ci: CI (run 37511408701)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `72c385088c98acfa7a8db302a4b0a24d8bd01769` on `fix/v1-audit`
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **2.59 s** per operation compared with a bare-minimum baseline (**1,564× baseline** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.04). At list prices that is on the order of **~$10 – $100 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 2.59 s | 21.2 s |
| Added latency, relative to baseline | 1,564× baseline | 2,848× baseline |
| Added CPU time per operation | 4.07 s | 32.7 s |
| Added memory per operation (heap delta) | 270.5 MiB | 690.3 MiB |
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
| 20 | 226 µs | 307 ms | 307 ms | 1,361× baseline | 510 ms | $0.640 – $5.73 |
| 40 | 396 µs | 578 ms | 578 ms | 1,461× baseline | 896 ms | $1.73 – $10.08 |
| 80 | 709 µs | 1.13 s | 1.13 s | 1,599× baseline | 1.71 s | $6.49 – $19.19 |
| 160 | 1.66 ms | 2.59 s | 2.59 s | 1,564× baseline | 4.07 s | $11.40 – $45.77 |
| 320 | 2.76 ms | 5.06 s | 5.06 s | 1,834× baseline | 7.92 s | $28.83 – $89.07 |
| 640 | 4.35 ms | 10.3 s | 10.3 s | 2,363× baseline | 15.9 s | $88.53 – $178.69 |
| 1280 | 7.43 ms | 21.2 s | 21.2 s | 2,848× baseline | 32.7 s | $237.70 – $367.41 |

**How the total grows:** O(n) (linear), exponent 1.04 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | O(n) | O(n) | ✅ matches | 25.8 ms | 126 ms |
| `normalizeApiPackage` | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.07 ms | 6.92 ms |
| `classifyContractChanges (with type-assignability probing)` | O(n) | O(n) | ✅ matches | 2.55 s | 20.6 s |

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
| 20 | 7.40 ms | 8.37 ms | 28.3 ms | 1.6 MiB | 135 |
| 40 | 11.9 ms | 12.7 ms | 47.7 ms | 2.9 MiB | 84 |
| 80 | 17.5 ms | 19.0 ms | 59.1 ms | 5.5 MiB | 57 |
| 160 | 25.8 ms | 30.7 ms | 68.0 ms | 10.5 MiB | 39 |
| 320 | 39.1 ms | 43.3 ms | 85.4 ms | 19.8 MiB | 26 |
| 640 | 68.2 ms | 71.8 ms | 136 ms | 38.6 MiB | 15 |
| 1280 | 126 ms | 131 ms | 218 ms | 18.2 MiB | 8 |

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

**Measured: O(n)** (exponent 0.77, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 268 µs | 295 µs | 661 µs | 65.2 KiB | 3,730 |
| 40 | 522 µs | 543 µs | 1.23 ms | 128.8 KiB | 1,916 |
| 80 | 871 µs | 984 µs | 3.48 ms | 252.4 KiB | 1,148 |
| 160 | 1.07 ms | 1.43 ms | 3.69 ms | 492.1 KiB | 937 |
| 320 | 1.80 ms | 3.23 ms | 5.95 ms | 986.5 KiB | 555 |
| 640 | 3.59 ms | 5.56 ms | 12.8 ms | 1.8 MiB | 278 |
| 1280 | 6.92 ms | 9.61 ms | 26.8 ms | 3.6 MiB | 144 |

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
| 20 | 288 ms | 292 ms | 451 ms | 90.6 MiB | 3 |
| 40 | 551 ms | 552 ms | 858 ms | 167.2 MiB | 2 |
| 80 | 1.07 s | 1.09 s | 1.60 s | 340.9 MiB | 1 |
| 160 | 2.55 s | 2.75 s | 3.96 s | 270.5 MiB | 0 |
| 320 | 4.98 s | 5.06 s | 7.67 s | 367.8 MiB | 0 |
| 640 | 10.1 s | 10.2 s | 15.6 s | 414.3 MiB | 0 |
| 1280 | 20.6 s | 20.6 s | 31.9 s | 450.6 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 160 exports** (whole operation: 2.59 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 2.55 s | 2.55 s | 99% |
| `load-api-model` | 1 | 25.8 ms | 25.8 ms | 1.0% |
| `normalize-api-package` | 1 | 1.07 ms | 1.07 ms | 0.0% |
| _unattributed_ |  |  | 10.5 ms | 0.4% |

**At 1280 exports** (whole operation: 21.2 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 20.6 s | 20.6 s | 97% |
| `load-api-model` | 1 | 126 ms | 126 ms | 0.6% |
| `normalize-api-package` | 1 | 6.92 ms | 6.92 ms | 0.0% |
| _unattributed_ |  |  | 410 ms | 1.9% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-10T22:45:26.902Z` → `2026-10-10T22:51:24.928Z` (358 s), ci: CI (run 38092012203)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `da80093aebf458f036d338ee7a9815294d601337` on `docs/accuracy-stage-1a`
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


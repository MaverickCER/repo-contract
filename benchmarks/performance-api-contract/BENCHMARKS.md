# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **3.59 s** per operation compared with a bare-minimum baseline (**1,475× baseline** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.04). At list prices that is on the order of **~$10 – $100 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 3.59 s | 29.4 s |
| Added latency, relative to baseline | 1,475× baseline | 2,582× baseline |
| Added CPU time per operation | 5.19 s | 42.3 s |
| Added memory per operation (heap delta) | 267.8 MiB | 210.2 MiB |
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
| 20 | 394 µs | 449 ms | 449 ms | 1,141× baseline | 678 ms | $0.935 – $7.62 |
| 40 | 616 µs | 817 ms | 817 ms | 1,328× baseline | 1.16 s | $2.45 – $13.08 |
| 80 | 1.20 ms | 1.60 s | 1.60 s | 1,333× baseline | 2.24 s | $9.17 – $25.20 |
| 160 | 2.44 ms | 3.59 s | 3.59 s | 1,475× baseline | 5.19 s | $15.65 – $58.32 |
| 320 | 3.74 ms | 7.13 s | 7.13 s | 1,904× baseline | 10.3 s | $40.57 – $115.78 |
| 640 | 6.33 ms | 14.6 s | 14.6 s | 2,309× baseline | 20.9 s | $123.73 – $234.95 |
| 1280 | 11.4 ms | 29.4 s | 29.4 s | 2,582× baseline | 42.3 s | $100.65 – $475.08 |

**How the total grows:** O(n) (linear), exponent 1.04 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | O(n) | O(n) | ✅ matches | 42.0 ms | 197 ms |
| `normalizeApiPackage` | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.36 ms | 9.62 ms |
| `classifyContractChanges (with type-assignability probing)` | O(n) | O(n) | ✅ matches | 3.57 s | 29.6 s |

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

**Measured: O(n)** (exponent 0.70, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 12.3 ms | 13.9 ms | 45.3 ms | 1.6 MiB | 81 |
| 40 | 20.3 ms | 21.7 ms | 71.0 ms | 2.9 MiB | 49 |
| 80 | 28.0 ms | 29.8 ms | 79.5 ms | 5.5 MiB | 36 |
| 160 | 42.0 ms | 49.2 ms | 96.5 ms | 10.5 MiB | 24 |
| 320 | 60.6 ms | 62.3 ms | 120 ms | 19.8 MiB | 16 |
| 640 | 109 ms | 116 ms | 196 ms | 38.6 MiB | 9 |
| 1280 | 197 ms | 204 ms | 316 ms | 18.2 MiB | 5 |

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
| 20 | 439 µs | 516 µs | 453 µs | 65.7 KiB | 2,279 |
| 40 | 762 µs | 805 µs | 1.82 ms | 128.8 KiB | 1,312 |
| 80 | 1.26 ms | 1.38 ms | 3.64 ms | 252.4 KiB | 791 |
| 160 | 1.36 ms | 3.10 ms | 4.26 ms | 492.1 KiB | 736 |
| 320 | 2.47 ms | 2.92 ms | 8.81 ms | 986.5 KiB | 405 |
| 640 | 4.68 ms | 5.25 ms | 17.8 ms | 1.8 MiB | 214 |
| 1280 | 9.62 ms | 10.9 ms | 36.0 ms | 3.6 MiB | 104 |

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
| 20 | 401 ms | 403 ms | 583 ms | 90.6 MiB | 2 |
| 40 | 792 ms | 798 ms | 1.13 s | 167.2 MiB | 1 |
| 80 | 1.55 s | 1.57 s | 2.17 s | 340.8 MiB | 1 |
| 160 | 3.57 s | 3.58 s | 5.18 s | 269.9 MiB | 0 |
| 320 | 7.07 s | 7.11 s | 10.1 s | 342.8 MiB | 0 |
| 640 | 14.5 s | 14.5 s | 20.7 s | 609.3 MiB | 0 |
| 1280 | 29.6 s | 29.8 s | 42.4 s | 677.1 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 160 exports** (whole operation: 3.59 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 3.57 s | 3.57 s | 99% |
| `load-api-model` | 1 | 42.0 ms | 42.0 ms | 1.2% |
| `normalize-api-package` | 1 | 1.36 ms | 1.36 ms | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 1280 exports** (whole operation: 29.4 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 29.6 s | 29.6 s | 101% |
| `load-api-model` | 1 | 197 ms | 197 ms | 0.7% |
| `normalize-api-package` | 1 | 9.62 ms | 9.62 ms | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-06T22:04:10.486Z` → `2026-10-06T22:12:32.438Z` (502 s), ci: CI (run 37536792493)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15994 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `a6dae09d65cda4550cd2581164e7a0c9b1f6a780` on `chore/update-non-ts-deps`
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


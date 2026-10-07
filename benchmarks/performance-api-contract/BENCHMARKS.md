# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **2.66 s** per operation compared with a bare-minimum baseline (**1,676× baseline** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.06). At list prices that is on the order of **~$10 – $100 per million operations** of compute.

> The relative figure and the growth class are the dependable ones: both come from the same run, so they survive a change of machine. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 2.66 s | 22.2 s |
| Added latency, relative to baseline | 1,676× baseline | 2,654× baseline |
| Added CPU time per operation | 4.22 s | 34.5 s |
| Added memory per operation (heap delta) | 269.5 MiB | 133.1 MiB |
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
| 20 | 221 µs | 324 ms | 324 ms | 1,468× baseline | 538 ms | $0.675 – $6.05 |
| 40 | 389 µs | 603 ms | 602 ms | 1,548× baseline | 929 ms | $1.81 – $10.44 |
| 80 | 700 µs | 1.15 s | 1.15 s | 1,647× baseline | 1.75 s | $6.61 – $19.66 |
| 160 | 1.59 ms | 2.66 s | 2.66 s | 1,676× baseline | 4.22 s | $11.67 – $47.46 |
| 320 | 2.61 ms | 5.29 s | 5.28 s | 2,028× baseline | 8.29 s | $30.06 – $93.19 |
| 640 | 5.00 ms | 11.0 s | 11.0 s | 2,202× baseline | 17.2 s | $95.09 – $192.89 |
| 1280 | 8.37 ms | 22.2 s | 22.2 s | 2,654× baseline | 34.5 s | $48.15 – $387.71 |

**How the total grows:** O(n) (linear), exponent 1.06 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | O(n) | O(log n) | 🟡 close (neighbouring class) | 33.3 ms | 135 ms |
| `normalizeApiPackage` | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.30 ms | 6.64 ms |
| `classifyContractChanges (with type-assignability probing)` | O(n) | O(n) | ✅ matches | 2.64 s | 21.6 s |

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

**Measured: O(log n)** (exponent 0.64, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.79 ms | 9.05 ms | 27.7 ms | 1.6 MiB | 147 |
| 40 | 11.4 ms | 14.6 ms | 43.3 ms | 2.8 MiB | 87 |
| 80 | 23.1 ms | 24.8 ms | 83.6 ms | 5.5 MiB | 43 |
| 160 | 33.3 ms | 35.7 ms | 93.8 ms | 10.5 MiB | 30 |
| 320 | 46.5 ms | 53.7 ms | 114 ms | 19.8 MiB | 22 |
| 640 | 81.0 ms | 89.9 ms | 176 ms | 38.6 MiB | 12 |
| 1280 | 135 ms | 149 ms | 250 ms | 18.2 MiB | 7 |

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

**Measured: O(n)** (exponent 0.87, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 290 µs | 329 µs | 735 µs | 65.2 KiB | 3,444 |
| 40 | 510 µs | 573 µs | 1.83 ms | 127.1 KiB | 1,959 |
| 80 | 546 µs | 1.06 ms | 2.52 ms | 247.4 KiB | 1,830 |
| 160 | 1.30 ms | 4.37 ms | 4.20 ms | 492.1 KiB | 771 |
| 320 | 1.91 ms | 2.82 ms | 7.94 ms | 986.5 KiB | 523 |
| 640 | 3.69 ms | 4.49 ms | 14.4 ms | 1.8 MiB | 271 |
| 1280 | 6.64 ms | 12.9 ms | 26.1 ms | 3.6 MiB | 151 |

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
| 20 | 303 ms | 306 ms | 492 ms | 90.6 MiB | 3 |
| 40 | 596 ms | 618 ms | 936 ms | 167.3 MiB | 2 |
| 80 | 1.15 s | 1.24 s | 1.73 s | 340.8 MiB | 1 |
| 160 | 2.64 s | 2.64 s | 4.16 s | 270.7 MiB | 0 |
| 320 | 5.26 s | 5.44 s | 8.16 s | 367.6 MiB | 0 |
| 640 | 10.8 s | 10.9 s | 16.7 s | 422.3 MiB | 0 |
| 1280 | 21.6 s | 21.7 s | 33.4 s | 532.0 MiB | 0 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 160 exports** (whole operation: 2.66 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 2.64 s | 2.64 s | 99% |
| `load-api-model` | 1 | 33.3 ms | 33.3 ms | 1.3% |
| `normalize-api-package` | 1 | 1.30 ms | 1.30 ms | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 1280 exports** (whole operation: 22.2 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 21.6 s | 21.6 s | 97% |
| `load-api-model` | 1 | 135 ms | 135 ms | 0.6% |
| `normalize-api-package` | 1 | 6.64 ms | 6.64 ms | 0.0% |
| _unattributed_ |  |  | 448 ms | 2.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-06T22:43:46.345Z` → `2026-10-06T22:50:05.189Z` (379 s), ci: CI (run 37541465788)
- Machine: Intel(R) Xeon(R) 6973P-C, 4 logical core(s) (2 physical), 15989 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `51e51786cdad9de9988b1c9ee0fcaaa0c5eba85a` on `chore/update-non-ts-deps`
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


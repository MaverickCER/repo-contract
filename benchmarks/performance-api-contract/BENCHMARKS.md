# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **3.31 s** per operation compared with a bare-minimum baseline (1,497× baseline), about **$14.84 – $55.37 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 1.03).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 3.31 s | 26.9 s |
| Added latency, relative to baseline | 1,497× baseline | 2,640× baseline |
| Added CPU time per operation | 4.92 s | 39.4 s |
| Added memory per operation (heap delta) | 275.5 MiB | 206.6 MiB |
| Estimated compute cost per 1M operations | $14.84 – $55.37 | $90.43 – $442.67 |
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
| 20 | 354 µs | 396 ms | 395 ms | 1,117× baseline | 630 ms | $0.823 – $7.08 |
| 40 | 546 µs | 751 ms | 750 ms | 1,375× baseline | 1.12 s | $2.34 – $12.62 |
| 80 | 1.10 ms | 1.47 s | 1.47 s | 1,331× baseline | 2.13 s | $8.10 – $23.98 |
| 160 | 2.21 ms | 3.31 s | 3.31 s | 1,497× baseline | 4.92 s | $14.84 – $55.37 |
| 320 | 3.66 ms | 6.49 s | 6.49 s | 1,776× baseline | 9.48 s | $55.84 – $106.65 |
| 640 | 5.80 ms | 13.3 s | 13.3 s | 2,295× baseline | 19.4 s | $98.61 – $218.61 |
| 1280 | 10.2 ms | 26.9 s | 26.9 s | 2,640× baseline | 39.4 s | $90.43 – $442.67 |

**How the total grows:** O(n) (linear), exponent 1.03 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | O(n) | O(n) | ✅ matches | 38.3 ms | 169 ms |
| `normalizeApiPackage` | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.13 ms | 6.05 ms |
| `classifyContractChanges (with type-assignability probing)` | O(n) | O(n) | ✅ matches | 3.21 s | 26.6 s |

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

**Measured: O(n)** (exponent 0.69, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 9.09 ms | 13.9 ms | 35.9 ms | 1.6 MiB | 110 |
| 40 | 13.6 ms | 17.7 ms | 53.1 ms | 2.8 MiB | 74 |
| 80 | 26.4 ms | 31.2 ms | 91.5 ms | 5.5 MiB | 38 |
| 160 | 38.3 ms | 38.7 ms | 106 ms | 10.5 MiB | 26 |
| 320 | 55.2 ms | 60.8 ms | 127 ms | 19.8 MiB | 18 |
| 640 | 93.0 ms | 104 ms | 190 ms | 38.7 MiB | 11 |
| 1280 | 169 ms | 175 ms | 297 ms | 18.3 MiB | 6 |

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

**Measured: O(n)** (exponent 0.69, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 293 µs | 328 µs | 935 µs | 46.0 KiB | 3,408 |
| 40 | 568 µs | 604 µs | 614 µs | 90.5 KiB | 1,760 |
| 80 | 957 µs | 1.07 ms | 2.82 ms | 178.5 KiB | 1,045 |
| 160 | 1.13 ms | 1.75 ms | 4.14 ms | 350.4 KiB | 888 |
| 320 | 1.82 ms | 3.21 ms | 5.69 ms | 686.0 KiB | 551 |
| 640 | 3.47 ms | 6.67 ms | 13.6 ms | 1.3 MiB | 289 |
| 1280 | 6.05 ms | 13.3 ms | 22.5 ms | 2.7 MiB | 165 |

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

**Measured: O(n)** (exponent 1.04, 7 sizes) -- ✅ matches.

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 366 ms | 370 ms | 552 ms | 93.6 MiB | 3 |
| 40 | 704 ms | 709 ms | 1.03 s | 173.3 MiB | 1 |
| 80 | 1.38 s | 1.44 s | 1.96 s | 357.5 MiB | 1 |
| 160 | 3.21 s | 3.21 s | 4.74 s | 267.5 MiB | 0 |
| 320 | 6.31 s | 6.36 s | 9.16 s | 355.4 MiB | 0 |
| 640 | 13.0 s | 13.1 s | 18.9 s | 691.5 MiB | 0 |
| 1280 | 26.6 s | 26.8 s | 39.0 s | 201.5 MiB | 0 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 160 exports** (total added: 3.31 s)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 3.21 s | 97% | 97% |
| `load-api-model` | 1 | 38.3 ms | 1.2% | 1.2% |
| `normalize-api-package` | 1 | 1.13 ms | 0.0% | 0.0% |
| _unattributed_ |  | 64.3 ms | 1.9% |  |

**At 1280 exports** (total added: 26.9 s)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 26.6 s | 99% | 99% |
| `load-api-model` | 1 | 169 ms | 0.6% | 0.6% |
| `normalize-api-package` | 1 | 6.05 ms | 0.0% | 0.0% |
| _unattributed_ |  | 76.3 ms | 0.3% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-02T00:31:13.476Z` → `2026-10-02T00:38:50.257Z` (457 s), ci
- Machine: INTEL(R) XEON(R) PLATINUM 8573C, 4 logical core(s) (2 physical), 15989 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `2000ec3e4768c623f615e1355648547539b48b4b` on `feat/shared-benchmark-kit-migration` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


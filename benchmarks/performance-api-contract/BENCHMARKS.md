# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **160 exports** per operation, routing the work through `repo-contract` adds **3.79 s** per operation compared with a bare-minimum baseline (1,497× baseline), about **$16.98 – $62.02 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 1.02).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (160 exports) | Largest (1280 exports) |
| --- | --- | --- |
| Added latency per operation | 3.79 s | 31.5 s |
| Added latency, relative to baseline | 1,497× baseline | 2,707× baseline |
| Added CPU time per operation | 5.52 s | 45.5 s |
| Added memory per operation (heap delta) | 275.0 MiB | 693.9 MiB |
| Estimated compute cost per 1M operations | $16.98 – $62.02 | $356.27 – $511.71 |
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
| 20 | 413 µs | 470 ms | 470 ms | 1,138× baseline | 731 ms | $0.979 – $8.22 |
| 40 | 716 µs | 862 ms | 861 ms | 1,204× baseline | 1.24 s | $2.69 – $13.93 |
| 80 | 1.43 ms | 1.70 s | 1.70 s | 1,191× baseline | 2.40 s | $9.38 – $27.02 |
| 160 | 2.54 ms | 3.80 s | 3.79 s | 1,497× baseline | 5.52 s | $16.98 – $62.02 |
| 320 | 4.11 ms | 7.46 s | 7.46 s | 1,816× baseline | 10.7 s | $64.42 – $120.07 |
| 640 | 6.70 ms | 15.5 s | 15.4 s | 2,305× baseline | 22.4 s | $109.93 – $251.43 |
| 1280 | 11.7 ms | 31.6 s | 31.5 s | 2,707× baseline | 45.5 s | $356.27 – $511.71 |

**How the total grows:** O(n) (linear), exponent 1.02 over 7 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | O(n) | O(n) | ✅ matches | 42.0 ms | 212 ms |
| `normalizeApiPackage` | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.36 ms | 9.85 ms |
| `classifyContractChanges (with type-assignability probing)` | O(n) | O(n) | ✅ matches | 3.77 s | 31.7 s |

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
| 20 | 12.2 ms | 15.1 ms | 45.4 ms | 1.6 MiB | 82 |
| 40 | 19.8 ms | 22.0 ms | 69.3 ms | 2.9 MiB | 51 |
| 80 | 29.0 ms | 29.9 ms | 84.2 ms | 5.5 MiB | 35 |
| 160 | 42.0 ms | 48.2 ms | 99.7 ms | 10.5 MiB | 24 |
| 320 | 62.9 ms | 72.4 ms | 128 ms | 19.9 MiB | 16 |
| 640 | 116 ms | 122 ms | 206 ms | 38.6 MiB | 9 |
| 1280 | 212 ms | 220 ms | 341 ms | 18.2 MiB | 5 |

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

**Measured: O(n)** (exponent 0.70, 7 sizes) -- 🟡 close (neighbouring class).

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 438 µs | 525 µs | 449 µs | 46.4 KiB | 2,282 |
| 40 | 783 µs | 908 µs | 2.63 ms | 90.5 KiB | 1,277 |
| 80 | 1.27 ms | 1.51 ms | 4.23 ms | 178.5 KiB | 786 |
| 160 | 1.36 ms | 2.31 ms | 5.09 ms | 350.6 KiB | 736 |
| 320 | 2.43 ms | 6.64 ms | 9.39 ms | 686.1 KiB | 411 |
| 640 | 4.91 ms | 5.53 ms | 18.4 ms | 1.3 MiB | 204 |
| 1280 | 9.85 ms | 11.7 ms | 36.5 ms | 2.7 MiB | 102 |

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
| 20 | 423 ms | 444 ms | 613 ms | 93.7 MiB | 2 |
| 40 | 829 ms | 830 ms | 1.18 s | 173.3 MiB | 1 |
| 80 | 1.66 s | 1.69 s | 2.33 s | 357.5 MiB | 1 |
| 160 | 3.77 s | 3.81 s | 5.49 s | 267.8 MiB | 0 |
| 320 | 7.41 s | 7.44 s | 10.7 s | 339.7 MiB | 0 |
| 640 | 15.7 s | 15.8 s | 22.8 s | 757.9 MiB | 0 |
| 1280 | 31.7 s | 31.9 s | 46.1 s | 109.0 MiB | 0 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 160 exports** (total added: 3.79 s)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 3.77 s | 99% | 99% |
| `load-api-model` | 1 | 42.0 ms | 1.1% | 1.1% |
| `normalize-api-package` | 1 | 1.36 ms | 0.0% | 0.0% |
| _unattributed_ |  | 0 | 0.0% |  |

**At 1280 exports** (total added: 31.5 s)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `classify-contract-changes` | 1 | 31.7 s | 101% | 101% |
| `load-api-model` | 1 | 212 ms | 0.7% | 0.7% |
| `normalize-api-package` | 1 | 9.85 ms | 0.0% | 0.0% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-02T05:03:12.094Z` → `2026-10-02T05:12:06.905Z` (535 s), ci
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `497835dd13fcdb0a77165f9285e84579d5c12948` on `dependabot/npm_and_yarn/js-yaml-4.3.2` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


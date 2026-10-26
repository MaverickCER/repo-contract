# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

_The end-to-end benchmark produced no complete result at the typical workload size, so no cost summary is available. See the failed/skipped section._

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

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 160 | At 1280 |
| --- | --- | --- | --- | --- | --- | --- |
| `loadApiModel (both API descriptions)` | export | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `normalizeApiPackage` | export | O(n log n) | n/a | ❔ not enough data | n/a | n/a |
| `classifyContractChanges (with type-assignability probing)` | export | O(n) | n/a | ❔ not enough data | n/a | n/a |

> **Could not be determined.** The big-O of these could not be measured, so they are not checked against their documentation:
>
> - `end-to-end:baseline` (varying export): only 0 export sizes gave a usable measurement and a growth rate needs at least 2; lost: n20 failed (Command failed: …/node …/tsc -p tsconfig.json); n40 failed (Command failed: …/node …/tsc -p tsconfig.json); n80 failed (Command failed: …/node …/tsc -p tsconfig.json); n160 failed (Command failed: …/node …/tsc -p tsconfig.json); n320 failed (Command failed: …/node …/tsc -p tsconfig.json); n640 failed (Command failed: …/node …/tsc -p tsconfig.json); n1280 failed (Command failed: …/node …/tsc -p tsconfig.json)
> - `end-to-end:with-package` (varying export): only 0 export sizes gave a usable measurement and a growth rate needs at least 2; lost: n20 failed (Command failed: …/node …/tsc -p tsconfig.json); n40 failed (Command failed: …/node …/tsc -p tsconfig.json); n80 failed (Command failed: …/node …/tsc -p tsconfig.json); n160 failed (Command failed: …/node …/tsc -p tsconfig.json); n320 failed (Command failed: …/node …/tsc -p tsconfig.json); n640 failed (Command failed: …/node …/tsc -p tsconfig.json); n1280 failed (Command failed: …/node …/tsc -p tsconfig.json)
> - `load-api-model` (varying export): only 0 export sizes gave a usable measurement and a growth rate needs at least 2; lost: n20 failed (Command failed: …/node …/tsc -p tsconfig.json); n40 failed (Command failed: …/node …/tsc -p tsconfig.json); n80 failed (Command failed: …/node …/tsc -p tsconfig.json); n160 failed (Command failed: …/node …/tsc -p tsconfig.json); n320 failed (Command failed: …/node …/tsc -p tsconfig.json); n640 failed (Command failed: …/node …/tsc -p tsconfig.json); n1280 failed (Command failed: …/node …/tsc -p tsconfig.json)
> - `normalize-api-package` (varying export): only 0 export sizes gave a usable measurement and a growth rate needs at least 2; lost: n20 failed (Command failed: …/node …/tsc -p tsconfig.json); n40 failed (Command failed: …/node …/tsc -p tsconfig.json); n80 failed (Command failed: …/node …/tsc -p tsconfig.json); n160 failed (Command failed: …/node …/tsc -p tsconfig.json); n320 failed (Command failed: …/node …/tsc -p tsconfig.json); n640 failed (Command failed: …/node …/tsc -p tsconfig.json); n1280 failed (Command failed: …/node …/tsc -p tsconfig.json)
> - `classify-contract-changes` (varying export): only 0 export sizes gave a usable measurement and a growth rate needs at least 2; lost: n20 failed (Command failed: …/node …/tsc -p tsconfig.json); n40 failed (Command failed: …/node …/tsc -p tsconfig.json); n80 failed (Command failed: …/node …/tsc -p tsconfig.json); n160 failed (Command failed: …/node …/tsc -p tsconfig.json); n320 failed (Command failed: …/node …/tsc -p tsconfig.json); n640 failed (Command failed: …/node …/tsc -p tsconfig.json); n1280 failed (Command failed: …/node …/tsc -p tsconfig.json)

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

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 40 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 80 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 160 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 320 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 640 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 1280 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |

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

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 40 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 80 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 160 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 320 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 640 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 1280 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |

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

| exports | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 40 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 80 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 160 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 320 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 640 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |
| 1280 | ❌ Command failed: …/node …/tsc -p tsconfig.json |  |  |  |  |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

## Failed measurements

- **end-to-end:baseline** at n20: Error: Command failed: …/node …/tsc -p tsconfig.json
- **end-to-end:baseline** at n40: Error: Command failed: …/node …/tsc -p tsconfig.json
- **end-to-end:baseline** at n80: Error: Command failed: …/node …/tsc -p tsconfig.json
- **end-to-end:baseline** at n160: Error: Command failed: …/node …/tsc -p tsconfig.json
- **end-to-end:baseline** at n320: Error: Command failed: …/node …/tsc -p tsconfig.json
- **end-to-end:baseline** at n640: Error: Command failed: …/node …/tsc -p tsconfig.json
- **end-to-end:baseline** at n1280: Error: Command failed: …/node …/tsc -p tsconfig.json
- **end-to-end:with-package** at n20: Error: Command failed: …/node …/tsc -p tsconfig.json
- **end-to-end:with-package** at n40: Error: Command failed: …/node …/tsc -p tsconfig.json
- **end-to-end:with-package** at n80: Error: Command failed: …/node …/tsc -p tsconfig.json
- **end-to-end:with-package** at n160: Error: Command failed: …/node …/tsc -p tsconfig.json
- **end-to-end:with-package** at n320: Error: Command failed: …/node …/tsc -p tsconfig.json
- **end-to-end:with-package** at n640: Error: Command failed: …/node …/tsc -p tsconfig.json
- **end-to-end:with-package** at n1280: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:load-api-model** at n20: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:load-api-model** at n40: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:load-api-model** at n80: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:load-api-model** at n160: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:load-api-model** at n320: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:load-api-model** at n640: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:load-api-model** at n1280: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:normalize-api-package** at n20: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:normalize-api-package** at n40: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:normalize-api-package** at n80: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:normalize-api-package** at n160: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:normalize-api-package** at n320: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:normalize-api-package** at n640: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:normalize-api-package** at n1280: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:classify-contract-changes** at n20: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:classify-contract-changes** at n40: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:classify-contract-changes** at n80: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:classify-contract-changes** at n160: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:classify-contract-changes** at n320: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:classify-contract-changes** at n640: Error: Command failed: …/node …/tsc -p tsconfig.json
- **fn:classify-contract-changes** at n1280: Error: Command failed: …/node …/tsc -p tsconfig.json

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-26T09:45:16.863Z` → `2026-10-26T09:45:19.716Z` (3 s), ci: CI (run 40300171082)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `01e446d8ae3f1d815cf4deb1ba15902ebdb1a598` on `dependabot/npm_and_yarn/dev-dependencies-6c9b387527`
- Sizes: 20, 40, 80, 160, 320, 640, 1280 exports -- One exported function in the package's public API. 160 is a mid-sized library's surface; the ladder reaches 1,280. It stops there, not at 10,240, because every size compiles a real synthetic TypeScript package and runs API Extractor over it, which takes minutes at the largest sizes.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


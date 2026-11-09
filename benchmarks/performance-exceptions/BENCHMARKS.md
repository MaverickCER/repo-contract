# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.82 ms** per operation compared with a bare-minimum baseline (**279% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.03). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.82 ms | 33.3 ms |
| Added latency, relative to baseline | 279% | 332% |
| Added CPU time per operation | 2.57 ms | 33.4 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 550 ops/s | 30 ops/s |

## 1. End-to-end: the package's total impact

Shows what a check pays, once per run, to read an exception registry, reconcile it with what the check found and write it back, compared with the bare minimum of parsing the file and matching ids by hand. It is pure in-memory work, paid by every check that keeps a registry.

- **Baseline (no package):** Parse the registry JSON and match each finding to a record by id with a Map -- the least anyone would do.
- **With the package:** `loadExceptionRegistry` reads the registry, `reconcileExceptions` matches the findings and `writeExceptionRegistry` serializes it back.

Both sides use empty or minimal functions on purpose, so the difference is the package's own cost -- not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| entries | swept | The tier axis: how many entries the main input holds (records, findings, rules, fields or classifications, as each function says). |
| filesystem | fixed at "an in-memory stand-in" | A real disk adds its own latency; the benchmark isolates the package's own work, as the standard asks (no real I/O). |
| runtime | fixed at "Node (V8)" | Measured on Node only. |
| match rate | fixed at "every finding matches a record" | A registry with stale or new entries does a little more work. |

The baseline is an empty or minimal function, so it costs almost nothing and the _relative_ overhead can look enormous (shown as a multiple of the baseline). Read the absolute columns -- time, CPU and dollars added -- they are what a bill and a latency budget are made of.

| entrys | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 29.2 µs | 139 µs | 110 µs | 376% | 376 µs | $0.00023 – $0.0042 |
| 40 | 53.1 µs | 202 µs | 149 µs | 281% | 377 µs | $0.00031 – $0.0042 |
| 80 | 94.1 µs | 396 µs | 302 µs | 321% | 842 µs | $0.00063 – $0.0095 |
| 160 | 185 µs | 656 µs | 471 µs | 254% | 825 µs | $0.00098 – $0.0093 |
| 320 | 340 µs | 1.28 ms | 943 µs | 277% | 1.89 ms | $0.002 – $0.021 |
| 640 | 653 µs | 2.47 ms | 1.82 ms | 279% | 2.57 ms | $0.0038 – $0.029 |
| 1280 | 1.31 ms | 4.71 ms | 3.40 ms | 259% | 3.41 ms | $0.0071 – $0.038 |
| 2560 | 2.48 ms | 9.44 ms | 6.96 ms | 280% | 7.09 ms | $0.014 – $0.080 |
| 5120 | 4.94 ms | 19.3 ms | 14.4 ms | 292% | 14.6 ms | $0.030 – $0.164 |
| 10240 | 10.0 ms | 43.4 ms | 33.3 ms | 332% | 33.4 ms | $0.069 – $0.375 |

**How the total grows:** O(n) (linear), exponent 1.03 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 360 µs | 4.48 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 57.8 µs | 1.39 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 535 µs | 7.20 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.90 ms | 32.9 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 36.6 ms | 573 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 152 µs | 4.55 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 68.8 ms | 1.09 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 35.3 ms | 572 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 103 µs | 3.80 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.0 µs | 142 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 179 µs | 2.30 ms |

### `reconcileExceptions`

**Why we benchmark it.** Every check that keeps an exception registry reconciles it with what it found on every run, so its cost is paid by every contract run that has exceptions.

**What poor performance would mean.** Slower runs in proportion to the registry and the findings, and a quadratic match would punish the repositories with the most exceptions.

**Expected growth: O(n).** It indexes the existing records by id in a Map and looks each finding up once, so cost is proportional to the findings plus the records.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| findings | swept | The tier axis: findings to match. |
| existing-records | swept | How many records the registry already holds. |
| match rate | fixed at "findings carry the even ids 0, 2, 4 ...; each one below the registry's size matches a record" | Matched findings reuse a record; the rest create a stub. With the registry at its base size of 640 records at most 320 findings match (half of them at 640 findings); on the registry sweep, every finding matches once the registry holds twice as many records. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Called once per run, between reading and writing the registry, but not attributed: the end-to-end run reconciles a registry in which every finding matches, while this benchmark holds the registry at 640 records with only some findings matching, so its time would misstate that share.

**Measured: O(n)** (exponent 0.93, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 107 µs | 132 µs | 356 µs | 115.4 KiB | 9,352 |
| 40 | 81.1 µs | 92.5 µs | 325 µs | 99.8 KiB | 12,334 |
| 80 | 79.9 µs | 82.7 µs | 243 µs | 120.8 KiB | 12,517 |
| 160 | 104 µs | 110 µs | 312 µs | 159.3 KiB | 9,647 |
| 320 | 159 µs | 164 µs | 452 µs | 237.4 KiB | 6,278 |
| 640 | 360 µs | 547 µs | 1.09 ms | 656.2 KiB | 2,776 |
| 1280 | 549 µs | 563 µs | 1.29 ms | 1.0 MiB | 1,822 |
| 2560 | 1.09 ms | 1.14 ms | 2.54 ms | 2.1 MiB | 914 |
| 5120 | 2.20 ms | 2.25 ms | 3.60 ms | 4.3 MiB | 455 |
| 10240 | 4.48 ms | 4.60 ms | 5.53 ms | 8.6 MiB | 223 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.15, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.7 µs | 12.3 µs | 44.4 µs | 17.0 KiB | 85,797 |
| 40 | 12.3 µs | 12.8 µs | 46.2 µs | 16.3 KiB | 81,280 |
| 80 | 15.0 µs | 15.7 µs | 54.9 µs | 20.5 KiB | 66,613 |
| 160 | 21.2 µs | 22.2 µs | 72.7 µs | 28.6 KiB | 47,244 |
| 320 | 32.9 µs | 34.0 µs | 109 µs | 48.2 KiB | 30,433 |
| 640 | 57.8 µs | 60.5 µs | 177 µs | 86.8 KiB | 17,313 |
| 1280 | 119 µs | 128 µs | 368 µs | 168.3 KiB | 8,422 |
| 2560 | 237 µs | 246 µs | 636 µs | 329.7 KiB | 4,219 |
| 5120 | 610 µs | 632 µs | 1.48 ms | 634.3 KiB | 1,638 |
| 10240 | 1.39 ms | 1.45 ms | 3.50 ms | 1.3 MiB | 722 |

### `loadExceptionRegistry`

**Why we benchmark it.** Every check that keeps a registry reads it at the start of every run.

**What poor performance would mean.** Slower starts for every check in proportion to the registry, which is the part of a contract run that cannot be skipped.

**Expected growth: O(n).** The file is parsed once and its array is handed to the schema once, so cost is proportional to the size of the registry.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| records | swept | The tier axis: records in the registry. |
| filesystem | fixed at "an in-memory stand-in" | A real disk adds its own latency; the benchmark isolates the package's own work, as the standard asks (no real I/O). |
| schema | fixed at "accepts every array" | A caller's own schema adds its own validation cost on top. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once per run, before reconciling.

**Measured: O(n)** (exponent 0.95, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 22.6 µs | 24.2 µs | 85.2 µs | 7.3 KiB | 44,166 |
| 40 | 42.1 µs | 47.0 µs | 144 µs | 13.2 KiB | 23,759 |
| 80 | 74.5 µs | 77.0 µs | 218 µs | 25.1 KiB | 13,423 |
| 160 | 142 µs | 149 µs | 384 µs | 48.9 KiB | 7,051 |
| 320 | 284 µs | 290 µs | 767 µs | 96.5 KiB | 3,525 |
| 640 | 535 µs | 555 µs | 1.25 ms | 191.6 KiB | 1,869 |
| 1280 | 1.07 ms | 1.10 ms | 2.58 ms | 381.9 KiB | 931 |
| 2560 | 1.97 ms | 2.33 ms | 3.62 ms | 761.9 KiB | 508 |
| 5120 | 4.42 ms | 4.54 ms | 6.22 ms | 1.5 MiB | 226 |
| 10240 | 7.20 ms | 7.83 ms | 9.33 ms | 3.0 MiB | 139 |

### `writeExceptionRegistry`

**Why we benchmark it.** Every check that reconciles a registry writes it back when it changed.

**What poor performance would mean.** Slower runs whenever a registry changes, in proportion to its size.

**Expected growth: O(n log n).** Each record's keys are put in canonical order and the whole registry is serialized once, so cost grows a little faster than the number of records.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| records | swept | The tier axis: records written. |
| filesystem | fixed at "an in-memory stand-in" | A real disk adds its own latency; the benchmark isolates the package's own work, as the standard asks (no real I/O). |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once per run, after reconciling, when the registry changed.

**Measured: O(n)** (exponent 1.02, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 84.5 µs | 101 µs | 292 µs | 44.3 KiB | 11,838 |
| 40 | 147 µs | 159 µs | 435 µs | 83.3 KiB | 6,806 |
| 80 | 273 µs | 288 µs | 754 µs | 161.9 KiB | 3,664 |
| 160 | 513 µs | 533 µs | 1.23 ms | 319.5 KiB | 1,950 |
| 320 | 1.02 ms | 1.08 ms | 2.45 ms | 634.7 KiB | 982 |
| 640 | 1.90 ms | 1.99 ms | 3.42 ms | 1.2 MiB | 526 |
| 1280 | 3.56 ms | 3.64 ms | 5.08 ms | 2.5 MiB | 281 |
| 2560 | 6.93 ms | 7.18 ms | 8.65 ms | 4.9 MiB | 144 |
| 5120 | 14.1 ms | 14.8 ms | 16.2 ms | 9.8 MiB | 71 |
| 10240 | 32.9 ms | 33.2 ms | 35.6 ms | 19.7 MiB | 30 |

### `resolveExceptionPolicy`

**Why we benchmark it.** It decides, for each exception record, which policy applies, and runs once per classification of every record.

**What poor performance would mean.** Slower judgement of every record in proportion to how many rules a policy has.

**Expected growth: O(n).** It scans the group's rules for an exact match and then for glob matches, so cost is proportional to the number of rules.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| rules | swept | The tier axis: rules in the group. |
| category | variant | An exact rule, a category matched by a glob, or every category at once. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

#### Variant `glob-match`

The category matches one glob rule.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.94 ms | 2.21 ms | 4.13 ms | 652.5 KiB | 516 |
| 40 | 2.43 ms | 3.63 ms | 3.91 ms | 1.3 MiB | 411 |
| 80 | 4.64 ms | 6.15 ms | 6.13 ms | 2.6 MiB | 216 |
| 160 | 9.22 ms | 11.0 ms | 10.8 ms | 5.3 MiB | 109 |
| 320 | 17.8 ms | 19.2 ms | 19.6 ms | 10.6 MiB | 56 |
| 640 | 36.6 ms | 39.8 ms | 41.7 ms | 21.5 MiB | 27 |
| 1280 | 70.8 ms | 73.1 ms | 73.2 ms | 43.7 MiB | 14 |
| 2560 | 142 ms | 145 ms | 144 ms | 25.9 MiB | 7 |
| 5120 | 287 ms | 288 ms | 298 ms | 54.2 MiB | 3 |
| 10240 | 573 ms | 574 ms | 586 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.64 µs | 8.54 µs | 7.72 µs | 7.4 KiB | 130,922 |
| 40 | 13.8 µs | 14.6 µs | 14.1 µs | 14.0 KiB | 72,446 |
| 80 | 20.7 µs | 22.7 µs | 66.0 µs | 27.3 KiB | 48,329 |
| 160 | 39.6 µs | 43.6 µs | 121 µs | 53.9 KiB | 25,242 |
| 320 | 75.8 µs | 82.8 µs | 222 µs | 107.0 KiB | 13,201 |
| 640 | 152 µs | 182 µs | 445 µs | 213.3 KiB | 6,580 |
| 1280 | 545 µs | 594 µs | 1.31 ms | 516.0 KiB | 1,836 |
| 2560 | 1.10 ms | 1.21 ms | 2.62 ms | 1.0 MiB | 908 |
| 5120 | 2.21 ms | 2.39 ms | 3.77 ms | 2.1 MiB | 453 |
| 10240 | 4.55 ms | 4.82 ms | 6.66 ms | 4.2 MiB | 220 |

### `evaluateExceptionRecord`

**Why we benchmark it.** It decides whether one record is permitted, and runs for every record of a registry.

**What poor performance would mean.** Slower judgement of a whole registry, multiplied by the number of classifications each record carries and the rules each policy has.

**Expected growth: O(n).** Each classification is resolved once, so cost is proportional to the number of classifications.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| classifications | swept | The tier axis: classifications the record is judged under. |
| rules | swept | How many rules the policy group has. |
| requirements | fixed at 4 | How many fields the policy's matching rule requires. Each costs one field read and one trim, which is too small next to resolving the rules to measure a growth rate of its own. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.52 ms | 2.56 ms | 4.38 ms | 1.2 MiB | 396 |
| 40 | 4.65 ms | 4.79 ms | 6.55 ms | 2.5 MiB | 215 |
| 80 | 8.94 ms | 9.06 ms | 10.8 ms | 5.0 MiB | 112 |
| 160 | 17.6 ms | 20.4 ms | 19.7 ms | 10.0 MiB | 57 |
| 320 | 34.7 ms | 35.0 ms | 36.9 ms | 20.0 MiB | 29 |
| 640 | 68.8 ms | 69.0 ms | 70.9 ms | 40.1 MiB | 15 |
| 1280 | 138 ms | 142 ms | 142 ms | 16.1 MiB | 7 |
| 2560 | 272 ms | 274 ms | 275 ms | 32.3 MiB | 4 |
| 5120 | 545 ms | 547 ms | 548 ms | 707.4 KiB | 2 |
| 10240 | 1.09 s | 1.09 s | 1.10 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.46 ms | 1.59 ms | 3.36 ms | 645.6 KiB | 685 |
| 40 | 2.54 ms | 2.60 ms | 4.49 ms | 1.3 MiB | 394 |
| 80 | 4.70 ms | 4.77 ms | 6.62 ms | 2.5 MiB | 213 |
| 160 | 8.98 ms | 9.15 ms | 10.9 ms | 5.2 MiB | 111 |
| 320 | 17.7 ms | 17.9 ms | 19.7 ms | 10.6 MiB | 57 |
| 640 | 35.3 ms | 35.4 ms | 37.3 ms | 21.4 MiB | 28 |
| 1280 | 70.3 ms | 70.4 ms | 72.4 ms | 43.6 MiB | 14 |
| 2560 | 142 ms | 142 ms | 145 ms | 25.7 MiB | 7 |
| 5120 | 285 ms | 292 ms | 288 ms | 53.9 MiB | 4 |
| 10240 | 572 ms | 595 ms | 578 ms | 46.2 MiB | 2 |

### `validateExceptionPolicyConfig`

**Why we benchmark it.** A check validates its policy config before it judges a single record, once per run.

**What poor performance would mean.** Slower starts for every check in proportion to how large its policy is.

**Expected growth: O(n).** Each rule is validated once, and each required field is looked up in the list of valid ones.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| rules | swept | The tier axis: rules in the config. |
| valid-requirements | swept | How many requirement names are valid. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

**Measured: O(n log n)** (exponent 1.24, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.71 µs | 15.0 µs | 5.86 µs | 9.3 KiB | 175,083 |
| 40 | 8.32 µs | 10.1 µs | 17.2 µs | 8.4 KiB | 120,123 |
| 80 | 15.0 µs | 15.2 µs | 45.3 µs | 16.2 KiB | 66,759 |
| 160 | 26.5 µs | 28.3 µs | 76.0 µs | 31.8 KiB | 37,745 |
| 320 | 42.0 µs | 54.8 µs | 93.3 µs | 63.1 KiB | 23,783 |
| 640 | 103 µs | 114 µs | 291 µs | 127.4 KiB | 9,671 |
| 1280 | 460 µs | 469 µs | 1.21 ms | 340.8 KiB | 2,173 |
| 2560 | 844 µs | 857 µs | 1.61 ms | 694.2 KiB | 1,185 |
| 5120 | 1.85 ms | 1.88 ms | 3.48 ms | 1.3 MiB | 539 |
| 10240 | 3.80 ms | 3.85 ms | 5.60 ms | 2.7 MiB | 263 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.87, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.47 µs | 4.72 µs | 18.9 µs | 4.5 KiB | 223,549 |
| 40 | 4.78 µs | 4.97 µs | 19.7 µs | 4.5 KiB | 209,016 |
| 80 | 5.48 µs | 5.69 µs | 22.2 µs | 4.5 KiB | 182,437 |
| 160 | 6.68 µs | 7.40 µs | 25.5 µs | 4.5 KiB | 149,589 |
| 320 | 8.76 µs | 9.35 µs | 31.8 µs | 4.5 KiB | 114,107 |
| 640 | 13.0 µs | 13.8 µs | 43.4 µs | 4.5 KiB | 77,103 |
| 1280 | 22.2 µs | 23.7 µs | 70.4 µs | 4.5 KiB | 44,987 |
| 2560 | 39.2 µs | 41.6 µs | 122 µs | 4.5 KiB | 25,507 |
| 5120 | 75.3 µs | 82.1 µs | 231 µs | 4.5 KiB | 13,280 |
| 10240 | 142 µs | 148 µs | 402 µs | 4.5 KiB | 7,019 |

### `hashRequirementFields`

**Why we benchmark it.** It fingerprints the fields of a record that a policy requires, so a record that changed after review can be told from one that did not.

**What poor performance would mean.** Slower review checks for every record in proportion to how many fields a policy requires.

**Expected growth: O(n).** Each field's value is read once and the whole list is hashed once, so cost is proportional to the number of fields.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| fields | swept | The tier axis: fields hashed. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

**Measured: O(n)** (exponent 0.94, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 12.7 µs | 14.8 µs | 13.0 µs | 3.6 KiB | 78,925 |
| 40 | 18.8 µs | 21.8 µs | 19.8 µs | 6.3 KiB | 53,086 |
| 80 | 32.1 µs | 33.5 µs | 129 µs | 11.7 KiB | 31,172 |
| 160 | 51.8 µs | 57.4 µs | 188 µs | 22.3 KiB | 19,291 |
| 320 | 96.7 µs | 105 µs | 316 µs | 45.3 KiB | 10,347 |
| 640 | 179 µs | 191 µs | 562 µs | 93.6 KiB | 5,594 |
| 1280 | 303 µs | 322 µs | 807 µs | 191.5 KiB | 3,295 |
| 2560 | 590 µs | 637 µs | 1.34 ms | 360.8 KiB | 1,695 |
| 5120 | 1.28 ms | 1.39 ms | 2.83 ms | 685.3 KiB | 779 |
| 10240 | 2.30 ms | 2.35 ms | 3.96 ms | 1.3 MiB | 436 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.47 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.90 ms | 1.90 ms | 77% |
| `load-exception-registry` | 1 | 535 µs | 535 µs | 22% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 35.4 µs | 1.4% |

**At 10240 entrys** (whole operation: 43.4 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 32.9 ms | 32.9 ms | 76% |
| `load-exception-registry` | 1 | 7.20 ms | 7.20 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.30 ms | 7.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-09T09:47:23.209Z` → `2026-11-09T09:48:26.854Z` (64 s), ci: CI (run 42593706694)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `5b578f6bcba1ac0f565579e06532e32659853e62` on `dependabot/npm_and_yarn/dev-dependencies-582d97ac1b`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


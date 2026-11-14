# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.80 ms** per operation compared with a bare-minimum baseline (**243% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.06). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.80 ms | 37.8 ms |
| Added latency, relative to baseline | 243% | 397% |
| Added CPU time per operation | 1.80 ms | 38.3 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 554 ops/s | 26 ops/s |

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
| 20 | 47.5 µs | 219 µs | 170 µs | 358% | 174 µs | $0.00035 – $0.002 |
| 40 | 74.0 µs | 335 µs | 257 µs | 347% | 263 µs | $0.00053 – $0.003 |
| 80 | 126 µs | 536 µs | 410 µs | 324% | 1.88 ms | $0.00085 – $0.021 |
| 160 | 236 µs | 794 µs | 557 µs | 236% | 2.00 ms | $0.0012 – $0.022 |
| 320 | 456 µs | 1.36 ms | 895 µs | 196% | 952 µs | $0.0019 – $0.011 |
| 640 | 742 µs | 2.55 ms | 1.80 ms | 243% | 1.80 ms | $0.0038 – $0.020 |
| 1280 | 1.26 ms | 4.91 ms | 3.65 ms | 290% | 3.67 ms | $0.0076 – $0.041 |
| 2560 | 2.38 ms | 9.87 ms | 7.49 ms | 314% | 7.71 ms | $0.016 – $0.087 |
| 5120 | 4.82 ms | 22.0 ms | 17.3 ms | 358% | 17.6 ms | $0.036 – $0.198 |
| 10240 | 9.51 ms | 47.3 ms | 37.8 ms | 397% | 38.3 ms | $0.079 – $0.431 |

**How the total grows:** O(n) (linear), exponent 1.06 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 513 µs | 4.64 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 60.5 µs | 1.43 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 539 µs | 7.31 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.94 ms | 32.6 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 36.6 ms | 576 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 152 µs | 4.61 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 68.7 ms | 1.09 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 35.2 ms | 568 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 85.7 µs | 3.80 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.2 µs | 181 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 176 µs | 2.34 ms |

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

**Measured: O(n)** (exponent 0.84, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 126 µs | 166 µs | 505 µs | 115.8 KiB | 7,963 |
| 40 | 79.2 µs | 141 µs | 298 µs | 99.2 KiB | 12,630 |
| 80 | 80.6 µs | 84.4 µs | 251 µs | 120.8 KiB | 12,401 |
| 160 | 108 µs | 115 µs | 327 µs | 159.3 KiB | 9,251 |
| 320 | 159 µs | 187 µs | 467 µs | 237.4 KiB | 6,271 |
| 640 | 513 µs | 841 µs | 2.02 ms | 670.2 KiB | 1,950 |
| 1280 | 563 µs | 604 µs | 1.33 ms | 1.0 MiB | 1,777 |
| 2560 | 1.12 ms | 1.15 ms | 2.69 ms | 2.1 MiB | 889 |
| 5120 | 2.39 ms | 3.28 ms | 4.00 ms | 4.3 MiB | 419 |
| 10240 | 4.64 ms | 4.79 ms | 5.62 ms | 8.6 MiB | 216 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.15, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 13.4 µs | 14.2 µs | 26.5 µs | 17.0 KiB | 74,781 |
| 40 | 14.1 µs | 15.1 µs | 14.5 µs | 16.3 KiB | 70,975 |
| 80 | 18.1 µs | 19.5 µs | 35.7 µs | 20.5 KiB | 55,163 |
| 160 | 23.1 µs | 24.7 µs | 90.0 µs | 28.6 KiB | 43,368 |
| 320 | 33.7 µs | 35.5 µs | 117 µs | 48.3 KiB | 29,654 |
| 640 | 60.5 µs | 64.8 µs | 198 µs | 86.8 KiB | 16,529 |
| 1280 | 117 µs | 125 µs | 341 µs | 166.1 KiB | 8,548 |
| 2560 | 246 µs | 253 µs | 662 µs | 329.7 KiB | 4,063 |
| 5120 | 621 µs | 641 µs | 1.53 ms | 634.3 KiB | 1,610 |
| 10240 | 1.43 ms | 1.48 ms | 3.68 ms | 1.3 MiB | 698 |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 25.7 µs | 29.7 µs | 79.4 µs | 7.3 KiB | 38,912 |
| 40 | 39.2 µs | 41.0 µs | 127 µs | 13.2 KiB | 25,515 |
| 80 | 74.1 µs | 77.0 µs | 223 µs | 25.1 KiB | 13,489 |
| 160 | 143 µs | 148 µs | 395 µs | 48.9 KiB | 7,017 |
| 320 | 286 µs | 307 µs | 781 µs | 96.5 KiB | 3,498 |
| 640 | 539 µs | 553 µs | 1.29 ms | 191.6 KiB | 1,854 |
| 1280 | 1.08 ms | 1.11 ms | 2.64 ms | 381.9 KiB | 930 |
| 2560 | 1.99 ms | 2.40 ms | 3.74 ms | 761.9 KiB | 502 |
| 5120 | 4.48 ms | 4.65 ms | 6.35 ms | 1.5 MiB | 223 |
| 10240 | 7.31 ms | 8.40 ms | 9.56 ms | 3.0 MiB | 137 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 91.3 µs | 113 µs | 343 µs | 44.5 KiB | 10,957 |
| 40 | 161 µs | 193 µs | 536 µs | 83.6 KiB | 6,196 |
| 80 | 278 µs | 312 µs | 778 µs | 161.9 KiB | 3,600 |
| 160 | 521 µs | 554 µs | 1.27 ms | 319.5 KiB | 1,920 |
| 320 | 1.03 ms | 1.12 ms | 2.53 ms | 634.8 KiB | 975 |
| 640 | 1.94 ms | 2.12 ms | 3.47 ms | 1.2 MiB | 517 |
| 1280 | 3.61 ms | 3.80 ms | 5.25 ms | 2.5 MiB | 277 |
| 2560 | 7.12 ms | 7.36 ms | 9.04 ms | 4.9 MiB | 141 |
| 5120 | 14.4 ms | 18.7 ms | 16.7 ms | 9.8 MiB | 69 |
| 10240 | 32.6 ms | 32.8 ms | 35.5 ms | 19.7 MiB | 31 |

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
| 20 | 2.01 ms | 2.34 ms | 4.47 ms | 652.5 KiB | 497 |
| 40 | 2.48 ms | 3.75 ms | 4.03 ms | 1.3 MiB | 404 |
| 80 | 4.66 ms | 5.67 ms | 6.20 ms | 2.6 MiB | 215 |
| 160 | 9.16 ms | 11.4 ms | 10.8 ms | 5.3 MiB | 109 |
| 320 | 17.8 ms | 20.0 ms | 19.6 ms | 10.6 MiB | 56 |
| 640 | 36.6 ms | 37.9 ms | 41.4 ms | 21.5 MiB | 27 |
| 1280 | 71.1 ms | 75.4 ms | 73.2 ms | 43.7 MiB | 14 |
| 2560 | 142 ms | 144 ms | 145 ms | 25.9 MiB | 7 |
| 5120 | 288 ms | 294 ms | 298 ms | 54.3 MiB | 3 |
| 10240 | 576 ms | 580 ms | 589 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.19, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.91 µs | 9.16 µs | 8.32 µs | 7.4 KiB | 126,362 |
| 40 | 12.2 µs | 13.6 µs | 45.6 µs | 14.0 KiB | 82,079 |
| 80 | 21.6 µs | 26.6 µs | 74.3 µs | 27.3 KiB | 46,190 |
| 160 | 40.7 µs | 49.0 µs | 130 µs | 53.9 KiB | 24,562 |
| 320 | 77.0 µs | 83.3 µs | 227 µs | 107.0 KiB | 12,989 |
| 640 | 152 µs | 166 µs | 454 µs | 213.3 KiB | 6,563 |
| 1280 | 550 µs | 589 µs | 1.29 ms | 516.0 KiB | 1,819 |
| 2560 | 1.12 ms | 1.22 ms | 2.64 ms | 1.0 MiB | 892 |
| 5120 | 2.22 ms | 2.43 ms | 3.82 ms | 2.1 MiB | 450 |
| 10240 | 4.61 ms | 4.79 ms | 6.78 ms | 4.2 MiB | 217 |

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
| 20 | 2.56 ms | 2.66 ms | 4.50 ms | 1.2 MiB | 391 |
| 40 | 4.68 ms | 4.79 ms | 6.63 ms | 2.5 MiB | 214 |
| 80 | 8.92 ms | 9.08 ms | 10.9 ms | 5.0 MiB | 112 |
| 160 | 17.5 ms | 18.4 ms | 19.8 ms | 10.0 MiB | 57 |
| 320 | 34.6 ms | 35.4 ms | 37.1 ms | 20.0 MiB | 29 |
| 640 | 68.7 ms | 68.9 ms | 71.0 ms | 40.1 MiB | 15 |
| 1280 | 138 ms | 138 ms | 140 ms | 16.1 MiB | 7 |
| 2560 | 274 ms | 278 ms | 276 ms | 32.3 MiB | 4 |
| 5120 | 547 ms | 549 ms | 550 ms | 707.4 KiB | 2 |
| 10240 | 1.09 s | 1.09 s | 1.10 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.45 ms | 1.49 ms | 3.36 ms | 645.7 KiB | 689 |
| 40 | 2.53 ms | 2.78 ms | 4.43 ms | 1.3 MiB | 395 |
| 80 | 4.66 ms | 4.78 ms | 6.61 ms | 2.5 MiB | 215 |
| 160 | 8.99 ms | 9.07 ms | 10.9 ms | 5.2 MiB | 111 |
| 320 | 17.7 ms | 18.0 ms | 19.7 ms | 10.6 MiB | 56 |
| 640 | 35.2 ms | 35.5 ms | 37.5 ms | 21.4 MiB | 28 |
| 1280 | 70.6 ms | 75.3 ms | 72.8 ms | 43.6 MiB | 14 |
| 2560 | 142 ms | 143 ms | 145 ms | 25.7 MiB | 7 |
| 5120 | 285 ms | 286 ms | 288 ms | 53.9 MiB | 4 |
| 10240 | 568 ms | 575 ms | 572 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.30, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.84 µs | 14.7 µs | 6.00 µs | 9.3 KiB | 171,313 |
| 40 | 7.46 µs | 9.09 µs | 29.1 µs | 8.4 KiB | 134,095 |
| 80 | 12.2 µs | 12.9 µs | 41.7 µs | 16.2 KiB | 81,904 |
| 160 | 22.7 µs | 23.6 µs | 72.9 µs | 31.8 KiB | 44,078 |
| 320 | 38.3 µs | 43.4 µs | 89.6 µs | 63.1 KiB | 26,116 |
| 640 | 85.7 µs | 88.0 µs | 253 µs | 127.7 KiB | 11,670 |
| 1280 | 460 µs | 469 µs | 1.22 ms | 340.8 KiB | 2,176 |
| 2560 | 847 µs | 861 µs | 1.64 ms | 694.2 KiB | 1,181 |
| 5120 | 1.86 ms | 1.88 ms | 3.49 ms | 1.3 MiB | 539 |
| 10240 | 3.80 ms | 3.91 ms | 5.62 ms | 2.7 MiB | 263 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.92, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.45 µs | 4.69 µs | 19.2 µs | 4.5 KiB | 224,537 |
| 40 | 4.89 µs | 5.15 µs | 10.5 µs | 4.5 KiB | 204,589 |
| 80 | 5.74 µs | 6.07 µs | 23.4 µs | 4.5 KiB | 174,182 |
| 160 | 7.13 µs | 7.50 µs | 24.6 µs | 4.5 KiB | 140,335 |
| 320 | 9.35 µs | 9.82 µs | 37.3 µs | 4.5 KiB | 106,896 |
| 640 | 13.2 µs | 14.2 µs | 47.4 µs | 4.5 KiB | 75,472 |
| 1280 | 21.9 µs | 23.1 µs | 74.5 µs | 4.5 KiB | 45,702 |
| 2560 | 38.7 µs | 41.1 µs | 124 µs | 4.5 KiB | 25,848 |
| 5120 | 71.4 µs | 74.9 µs | 220 µs | 4.5 KiB | 14,004 |
| 10240 | 181 µs | 202 µs | 608 µs | 4.6 KiB | 5,531 |

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

**Measured: O(n)** (exponent 0.95, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 15.0 µs | 17.4 µs | 15.3 µs | 3.7 KiB | 66,889 |
| 40 | 23.3 µs | 26.1 µs | 23.8 µs | 6.4 KiB | 42,886 |
| 80 | 35.9 µs | 39.0 µs | 37.7 µs | 11.8 KiB | 27,847 |
| 160 | 55.7 µs | 62.1 µs | 208 µs | 22.4 KiB | 17,967 |
| 320 | 94.6 µs | 111 µs | 315 µs | 45.3 KiB | 10,575 |
| 640 | 176 µs | 193 µs | 560 µs | 93.6 KiB | 5,694 |
| 1280 | 309 µs | 346 µs | 830 µs | 191.5 KiB | 3,240 |
| 2560 | 599 µs | 673 µs | 1.42 ms | 360.9 KiB | 1,670 |
| 5120 | 1.30 ms | 1.41 ms | 2.86 ms | 685.3 KiB | 768 |
| 10240 | 2.34 ms | 2.47 ms | 4.10 ms | 1.3 MiB | 428 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.55 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.94 ms | 1.94 ms | 76% |
| `load-exception-registry` | 1 | 539 µs | 539 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 73.9 µs | 2.9% |

**At 10240 entrys** (whole operation: 47.3 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 32.6 ms | 32.6 ms | 69% |
| `load-exception-registry` | 1 | 7.31 ms | 7.31 ms | 15% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 7.34 ms | 16% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-14T07:12:49.154Z` → `2026-11-14T07:13:50.776Z` (62 s), ci: CI (run 43568159906)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `43f31f226cc93a6e1a562cc17be0af699c682afd` on `chore/bump-internal-package-contract-v0.18.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


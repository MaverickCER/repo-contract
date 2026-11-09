# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.88 ms** per operation compared with a bare-minimum baseline (**285% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.88 ms | 33.1 ms |
| Added latency, relative to baseline | 285% | 313% |
| Added CPU time per operation | 2.65 ms | 32.6 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 531 ops/s | 30 ops/s |

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
| 20 | 28.6 µs | 136 µs | 107 µs | 375% | 368 µs | $0.00022 – $0.0041 |
| 40 | 50.3 µs | 207 µs | 156 µs | 311% | 406 µs | $0.00033 – $0.0046 |
| 80 | 98.1 µs | 405 µs | 307 µs | 313% | 833 µs | $0.00064 – $0.0094 |
| 160 | 187 µs | 664 µs | 477 µs | 256% | 847 µs | $0.00099 – $0.0095 |
| 320 | 345 µs | 1.32 ms | 974 µs | 282% | 1.95 ms | $0.002 – $0.022 |
| 640 | 661 µs | 2.55 ms | 1.88 ms | 285% | 2.65 ms | $0.0039 – $0.030 |
| 1280 | 1.33 ms | 4.93 ms | 3.60 ms | 271% | 3.76 ms | $0.0075 – $0.042 |
| 2560 | 2.55 ms | 9.73 ms | 7.18 ms | 281% | 7.32 ms | $0.015 – $0.082 |
| 5120 | 5.15 ms | 19.6 ms | 14.5 ms | 281% | 14.5 ms | $0.030 – $0.163 |
| 10240 | 10.5 ms | 43.6 ms | 33.1 ms | 313% | 32.6 ms | $0.069 – $0.366 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 385 µs | 4.62 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 58.7 µs | 1.40 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 537 µs | 7.29 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.95 ms | 32.6 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 36.6 ms | 575 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 153 µs | 4.71 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 68.7 ms | 1.09 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 35.1 ms | 570 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 85.6 µs | 3.86 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.0 µs | 150 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 160 µs | 2.30 ms |

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

**Measured: O(n)** (exponent 0.92, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 114 µs | 145 µs | 411 µs | 115.6 KiB | 8,740 |
| 40 | 78.9 µs | 146 µs | 289 µs | 99.2 KiB | 12,679 |
| 80 | 80.3 µs | 83.5 µs | 247 µs | 120.8 KiB | 12,447 |
| 160 | 108 µs | 113 µs | 324 µs | 159.3 KiB | 9,258 |
| 320 | 160 µs | 172 µs | 464 µs | 237.4 KiB | 6,251 |
| 640 | 385 µs | 459 µs | 1.07 ms | 656.2 KiB | 2,598 |
| 1280 | 566 µs | 578 µs | 1.32 ms | 1.0 MiB | 1,768 |
| 2560 | 1.11 ms | 1.14 ms | 2.52 ms | 2.1 MiB | 899 |
| 5120 | 2.30 ms | 2.36 ms | 3.80 ms | 4.3 MiB | 435 |
| 10240 | 4.62 ms | 4.73 ms | 5.83 ms | 8.6 MiB | 217 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.14, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.4 µs | 12.0 µs | 43.9 µs | 17.0 KiB | 87,715 |
| 40 | 11.6 µs | 12.3 µs | 44.0 µs | 16.3 KiB | 86,111 |
| 80 | 14.6 µs | 15.5 µs | 52.5 µs | 20.5 KiB | 68,327 |
| 160 | 20.7 µs | 22.0 µs | 70.9 µs | 28.6 KiB | 48,416 |
| 320 | 33.2 µs | 35.0 µs | 107 µs | 48.2 KiB | 30,142 |
| 640 | 58.7 µs | 60.3 µs | 154 µs | 86.7 KiB | 17,046 |
| 1280 | 130 µs | 134 µs | 371 µs | 168.3 KiB | 7,674 |
| 2560 | 251 µs | 265 µs | 634 µs | 329.7 KiB | 3,978 |
| 5120 | 605 µs | 626 µs | 1.46 ms | 634.3 KiB | 1,654 |
| 10240 | 1.40 ms | 1.44 ms | 3.58 ms | 1.3 MiB | 714 |

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
| 20 | 22.0 µs | 23.0 µs | 77.7 µs | 7.3 KiB | 45,549 |
| 40 | 38.9 µs | 40.4 µs | 122 µs | 13.2 KiB | 25,681 |
| 80 | 73.1 µs | 74.7 µs | 214 µs | 25.1 KiB | 13,681 |
| 160 | 150 µs | 156 µs | 454 µs | 48.9 KiB | 6,663 |
| 320 | 284 µs | 294 µs | 786 µs | 96.5 KiB | 3,516 |
| 640 | 537 µs | 549 µs | 1.28 ms | 191.6 KiB | 1,863 |
| 1280 | 1.08 ms | 1.11 ms | 2.62 ms | 381.9 KiB | 923 |
| 2560 | 1.99 ms | 2.38 ms | 3.67 ms | 761.9 KiB | 503 |
| 5120 | 4.45 ms | 4.59 ms | 6.33 ms | 1.5 MiB | 224 |
| 10240 | 7.29 ms | 8.22 ms | 9.56 ms | 3.0 MiB | 137 |

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
| 20 | 95.2 µs | 127 µs | 377 µs | 44.0 KiB | 10,506 |
| 40 | 145 µs | 171 µs | 429 µs | 83.3 KiB | 6,914 |
| 80 | 270 µs | 290 µs | 742 µs | 161.9 KiB | 3,697 |
| 160 | 513 µs | 568 µs | 1.22 ms | 319.5 KiB | 1,951 |
| 320 | 1.03 ms | 1.10 ms | 2.44 ms | 634.7 KiB | 975 |
| 640 | 1.95 ms | 2.04 ms | 3.42 ms | 1.2 MiB | 512 |
| 1280 | 3.72 ms | 3.81 ms | 5.29 ms | 2.5 MiB | 269 |
| 2560 | 7.23 ms | 7.45 ms | 9.15 ms | 4.9 MiB | 138 |
| 5120 | 14.4 ms | 14.8 ms | 16.7 ms | 9.8 MiB | 69 |
| 10240 | 32.6 ms | 33.2 ms | 35.3 ms | 19.7 MiB | 31 |

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
| 20 | 1.94 ms | 2.30 ms | 4.28 ms | 652.5 KiB | 517 |
| 40 | 2.48 ms | 3.69 ms | 4.05 ms | 1.3 MiB | 403 |
| 80 | 4.67 ms | 6.15 ms | 6.26 ms | 2.6 MiB | 214 |
| 160 | 9.13 ms | 10.3 ms | 10.9 ms | 5.3 MiB | 110 |
| 320 | 17.9 ms | 19.6 ms | 19.8 ms | 10.6 MiB | 56 |
| 640 | 36.6 ms | 37.0 ms | 41.7 ms | 21.5 MiB | 27 |
| 1280 | 70.9 ms | 71.2 ms | 73.3 ms | 43.7 MiB | 14 |
| 2560 | 144 ms | 145 ms | 147 ms | 25.9 MiB | 7 |
| 5120 | 287 ms | 289 ms | 298 ms | 54.2 MiB | 3 |
| 10240 | 575 ms | 577 ms | 587 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.19, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.00 µs | 9.65 µs | 8.21 µs | 7.4 KiB | 125,063 |
| 40 | 11.6 µs | 14.0 µs | 41.4 µs | 14.0 KiB | 86,574 |
| 80 | 21.0 µs | 23.1 µs | 71.0 µs | 27.3 KiB | 47,515 |
| 160 | 39.7 µs | 53.5 µs | 125 µs | 53.9 KiB | 25,207 |
| 320 | 77.2 µs | 89.1 µs | 232 µs | 107.0 KiB | 12,951 |
| 640 | 153 µs | 183 µs | 455 µs | 213.3 KiB | 6,527 |
| 1280 | 548 µs | 617 µs | 1.29 ms | 516.0 KiB | 1,825 |
| 2560 | 1.12 ms | 1.23 ms | 2.71 ms | 1.0 MiB | 893 |
| 5120 | 2.23 ms | 2.42 ms | 3.87 ms | 2.1 MiB | 448 |
| 10240 | 4.71 ms | 5.03 ms | 7.53 ms | 4.2 MiB | 212 |

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
| 20 | 2.58 ms | 2.62 ms | 4.64 ms | 1.2 MiB | 387 |
| 40 | 4.70 ms | 4.82 ms | 6.81 ms | 2.5 MiB | 213 |
| 80 | 8.98 ms | 9.21 ms | 11.2 ms | 5.0 MiB | 111 |
| 160 | 17.7 ms | 18.8 ms | 20.1 ms | 10.0 MiB | 56 |
| 320 | 34.6 ms | 34.8 ms | 37.1 ms | 20.0 MiB | 29 |
| 640 | 68.7 ms | 71.4 ms | 71.0 ms | 40.1 MiB | 15 |
| 1280 | 138 ms | 139 ms | 141 ms | 16.1 MiB | 7 |
| 2560 | 274 ms | 274 ms | 276 ms | 32.3 MiB | 4 |
| 5120 | 545 ms | 547 ms | 548 ms | 707.4 KiB | 2 |
| 10240 | 1.09 s | 1.09 s | 1.09 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.47 ms | 1.52 ms | 3.47 ms | 645.6 KiB | 679 |
| 40 | 2.56 ms | 4.21 ms | 4.55 ms | 1.3 MiB | 391 |
| 80 | 4.94 ms | 8.32 ms | 7.32 ms | 2.5 MiB | 203 |
| 160 | 9.42 ms | 14.7 ms | 11.7 ms | 5.2 MiB | 106 |
| 320 | 18.4 ms | 18.6 ms | 20.9 ms | 10.6 MiB | 54 |
| 640 | 35.1 ms | 35.5 ms | 37.5 ms | 21.4 MiB | 29 |
| 1280 | 70.5 ms | 71.6 ms | 73.0 ms | 43.6 MiB | 14 |
| 2560 | 142 ms | 145 ms | 144 ms | 25.7 MiB | 7 |
| 5120 | 285 ms | 292 ms | 289 ms | 53.9 MiB | 4 |
| 10240 | 570 ms | 570 ms | 575 ms | 46.2 MiB | 2 |

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
| 20 | 5.95 µs | 14.9 µs | 6.16 µs | 9.3 KiB | 168,079 |
| 40 | 7.49 µs | 9.48 µs | 29.9 µs | 8.4 KiB | 133,453 |
| 80 | 12.6 µs | 13.0 µs | 44.0 µs | 16.2 KiB | 79,574 |
| 160 | 22.9 µs | 23.8 µs | 74.9 µs | 31.8 KiB | 43,736 |
| 320 | 43.4 µs | 44.3 µs | 133 µs | 63.1 KiB | 23,063 |
| 640 | 85.6 µs | 88.9 µs | 253 µs | 127.7 KiB | 11,677 |
| 1280 | 466 µs | 477 µs | 1.23 ms | 340.8 KiB | 2,144 |
| 2560 | 861 µs | 902 µs | 1.68 ms | 694.2 KiB | 1,162 |
| 5120 | 1.88 ms | 1.92 ms | 3.55 ms | 1.3 MiB | 533 |
| 10240 | 3.86 ms | 3.94 ms | 5.76 ms | 2.7 MiB | 259 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.88, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.50 µs | 4.71 µs | 18.6 µs | 4.5 KiB | 222,166 |
| 40 | 4.63 µs | 4.92 µs | 19.4 µs | 4.5 KiB | 216,134 |
| 80 | 5.73 µs | 6.18 µs | 5.84 µs | 4.5 KiB | 174,403 |
| 160 | 6.87 µs | 7.24 µs | 28.7 µs | 4.5 KiB | 145,559 |
| 320 | 8.59 µs | 8.98 µs | 32.4 µs | 4.5 KiB | 116,370 |
| 640 | 13.0 µs | 13.6 µs | 46.2 µs | 4.5 KiB | 76,630 |
| 1280 | 21.5 µs | 22.9 µs | 73.0 µs | 4.5 KiB | 46,429 |
| 2560 | 38.9 µs | 45.5 µs | 124 µs | 4.5 KiB | 25,681 |
| 5120 | 74.0 µs | 78.9 µs | 233 µs | 4.5 KiB | 13,522 |
| 10240 | 150 µs | 154 µs | 471 µs | 4.5 KiB | 6,669 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 12.6 µs | 14.9 µs | 12.8 µs | 3.6 KiB | 79,370 |
| 40 | 19.8 µs | 21.9 µs | 20.2 µs | 6.4 KiB | 50,611 |
| 80 | 31.9 µs | 35.2 µs | 132 µs | 11.6 KiB | 31,313 |
| 160 | 53.4 µs | 58.0 µs | 206 µs | 22.4 KiB | 18,720 |
| 320 | 91.8 µs | 100 µs | 310 µs | 45.3 KiB | 10,891 |
| 640 | 160 µs | 191 µs | 465 µs | 92.1 KiB | 6,235 |
| 1280 | 301 µs | 338 µs | 812 µs | 191.5 KiB | 3,324 |
| 2560 | 574 µs | 603 µs | 1.39 ms | 360.0 KiB | 1,743 |
| 5120 | 1.32 ms | 1.43 ms | 3.02 ms | 685.3 KiB | 760 |
| 10240 | 2.30 ms | 2.43 ms | 4.04 ms | 1.3 MiB | 434 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.55 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.95 ms | 1.95 ms | 77% |
| `load-exception-registry` | 1 | 537 µs | 537 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 54.9 µs | 2.2% |

**At 10240 entrys** (whole operation: 43.6 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 32.6 ms | 32.6 ms | 75% |
| `load-exception-registry` | 1 | 7.29 ms | 7.29 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.73 ms | 8.5% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-09T09:47:57.390Z` → `2026-11-09T09:49:01.340Z` (64 s), ci: CI (run 42593748511)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `8174d7883e1c73d3d989d548e209d56171e71a2c` on `dependabot/npm_and_yarn/internal-package-contract-v0.14.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


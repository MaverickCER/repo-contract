# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.90 ms** per operation compared with a bare-minimum baseline (**291% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.90 ms | 31.6 ms |
| Added latency, relative to baseline | 291% | 312% |
| Added CPU time per operation | 2.67 ms | 31.3 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 526 ops/s | 32 ops/s |

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
| 20 | 31.1 µs | 142 µs | 111 µs | 355% | 379 µs | $0.00023 – $0.0043 |
| 40 | 51.0 µs | 207 µs | 155 µs | 305% | 396 µs | $0.00032 – $0.0045 |
| 80 | 97.8 µs | 403 µs | 306 µs | 313% | 835 µs | $0.00064 – $0.0094 |
| 160 | 187 µs | 673 µs | 486 µs | 260% | 862 µs | $0.001 – $0.0097 |
| 320 | 345 µs | 1.32 ms | 973 µs | 282% | 1.95 ms | $0.002 – $0.022 |
| 640 | 653 µs | 2.56 ms | 1.90 ms | 291% | 2.67 ms | $0.004 – $0.030 |
| 1280 | 1.32 ms | 4.93 ms | 3.61 ms | 273% | 3.66 ms | $0.0075 – $0.041 |
| 2560 | 2.53 ms | 9.95 ms | 7.42 ms | 293% | 7.58 ms | $0.015 – $0.085 |
| 5120 | 5.01 ms | 19.5 ms | 14.5 ms | 289% | 14.7 ms | $0.030 – $0.165 |
| 10240 | 10.1 ms | 41.7 ms | 31.6 ms | 312% | 31.3 ms | $0.066 – $0.352 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 328 µs | 4.17 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 58.3 µs | 1.34 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 540 µs | 7.33 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 2.00 ms | 30.5 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 39.5 ms | 584 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 153 µs | 4.33 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 69.7 ms | 1.11 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 35.5 ms | 578 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 85.8 µs | 3.53 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.1 µs | 150 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 187 µs | 2.48 ms |

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
| 20 | 114 µs | 166 µs | 419 µs | 115.6 KiB | 8,793 |
| 40 | 81.4 µs | 127 µs | 329 µs | 99.8 KiB | 12,280 |
| 80 | 78.2 µs | 79.9 µs | 244 µs | 120.8 KiB | 12,794 |
| 160 | 102 µs | 105 µs | 316 µs | 159.3 KiB | 9,768 |
| 320 | 152 µs | 158 µs | 448 µs | 237.4 KiB | 6,578 |
| 640 | 328 µs | 535 µs | 1.08 ms | 530.7 KiB | 3,052 |
| 1280 | 524 µs | 548 µs | 1.27 ms | 1.0 MiB | 1,907 |
| 2560 | 1.05 ms | 1.08 ms | 2.58 ms | 2.1 MiB | 953 |
| 5120 | 2.08 ms | 2.14 ms | 3.46 ms | 4.3 MiB | 482 |
| 10240 | 4.17 ms | 4.23 ms | 5.22 ms | 8.6 MiB | 240 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.15, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.3 µs | 11.5 µs | 43.0 µs | 17.0 KiB | 88,496 |
| 40 | 11.2 µs | 11.8 µs | 43.5 µs | 16.3 KiB | 88,933 |
| 80 | 14.4 µs | 14.9 µs | 53.1 µs | 20.5 KiB | 69,662 |
| 160 | 24.8 µs | 25.7 µs | 105 µs | 28.6 KiB | 40,250 |
| 320 | 33.1 µs | 34.4 µs | 111 µs | 48.2 KiB | 30,248 |
| 640 | 58.3 µs | 60.2 µs | 183 µs | 86.8 KiB | 17,160 |
| 1280 | 111 µs | 116 µs | 328 µs | 166.1 KiB | 9,001 |
| 2560 | 229 µs | 234 µs | 628 µs | 329.7 KiB | 4,366 |
| 5120 | 594 µs | 616 µs | 1.50 ms | 634.3 KiB | 1,684 |
| 10240 | 1.34 ms | 1.37 ms | 3.49 ms | 1.3 MiB | 749 |

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
| 20 | 24.0 µs | 26.9 µs | 93.5 µs | 7.3 KiB | 41,713 |
| 40 | 43.4 µs | 43.9 µs | 156 µs | 13.2 KiB | 23,067 |
| 80 | 75.4 µs | 76.6 µs | 223 µs | 25.1 KiB | 13,263 |
| 160 | 143 µs | 146 µs | 387 µs | 48.9 KiB | 6,996 |
| 320 | 286 µs | 293 µs | 781 µs | 96.5 KiB | 3,497 |
| 640 | 540 µs | 553 µs | 1.28 ms | 191.6 KiB | 1,851 |
| 1280 | 1.08 ms | 1.10 ms | 2.63 ms | 381.9 KiB | 923 |
| 2560 | 1.99 ms | 2.35 ms | 3.68 ms | 761.9 KiB | 502 |
| 5120 | 4.44 ms | 4.54 ms | 6.30 ms | 1.5 MiB | 225 |
| 10240 | 7.33 ms | 8.25 ms | 9.52 ms | 3.0 MiB | 137 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 85.0 µs | 94.4 µs | 299 µs | 44.3 KiB | 11,764 |
| 40 | 150 µs | 190 µs | 445 µs | 83.3 KiB | 6,684 |
| 80 | 281 µs | 300 µs | 775 µs | 161.9 KiB | 3,564 |
| 160 | 533 µs | 552 µs | 1.28 ms | 319.5 KiB | 1,875 |
| 320 | 1.05 ms | 1.12 ms | 2.54 ms | 634.8 KiB | 953 |
| 640 | 2.00 ms | 2.13 ms | 3.54 ms | 1.2 MiB | 501 |
| 1280 | 3.73 ms | 3.84 ms | 5.30 ms | 2.5 MiB | 268 |
| 2560 | 7.22 ms | 7.36 ms | 8.96 ms | 4.9 MiB | 138 |
| 5120 | 14.3 ms | 14.4 ms | 16.3 ms | 9.8 MiB | 70 |
| 10240 | 30.5 ms | 32.5 ms | 33.2 ms | 19.7 MiB | 33 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.98 ms | 3.05 ms | 4.19 ms | 652.7 KiB | 505 |
| 40 | 2.48 ms | 3.85 ms | 4.00 ms | 1.3 MiB | 403 |
| 80 | 4.73 ms | 6.55 ms | 6.22 ms | 2.6 MiB | 212 |
| 160 | 9.30 ms | 12.2 ms | 11.0 ms | 5.3 MiB | 108 |
| 320 | 18.1 ms | 21.2 ms | 19.8 ms | 10.6 MiB | 55 |
| 640 | 39.5 ms | 39.9 ms | 44.3 ms | 21.5 MiB | 25 |
| 1280 | 71.5 ms | 74.1 ms | 73.8 ms | 43.7 MiB | 14 |
| 2560 | 144 ms | 144 ms | 147 ms | 25.9 MiB | 7 |
| 5120 | 293 ms | 294 ms | 303 ms | 54.2 MiB | 3 |
| 10240 | 584 ms | 610 ms | 595 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.10 µs | 10.1 µs | 8.36 µs | 7.4 KiB | 123,491 |
| 40 | 11.7 µs | 14.4 µs | 42.0 µs | 14.0 KiB | 85,125 |
| 80 | 21.0 µs | 28.3 µs | 69.9 µs | 27.3 KiB | 47,526 |
| 160 | 40.0 µs | 48.7 µs | 124 µs | 53.9 KiB | 25,020 |
| 320 | 82.5 µs | 99.8 µs | 272 µs | 107.0 KiB | 12,123 |
| 640 | 153 µs | 188 µs | 455 µs | 213.3 KiB | 6,536 |
| 1280 | 528 µs | 596 µs | 1.31 ms | 516.0 KiB | 1,896 |
| 2560 | 1.06 ms | 1.17 ms | 2.62 ms | 1.0 MiB | 945 |
| 5120 | 2.08 ms | 2.28 ms | 3.67 ms | 2.1 MiB | 481 |
| 10240 | 4.33 ms | 4.57 ms | 6.45 ms | 4.2 MiB | 231 |

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
| 20 | 2.57 ms | 2.64 ms | 4.53 ms | 1.2 MiB | 389 |
| 40 | 4.77 ms | 5.30 ms | 6.80 ms | 2.5 MiB | 209 |
| 80 | 9.08 ms | 9.12 ms | 11.0 ms | 5.0 MiB | 110 |
| 160 | 17.8 ms | 24.7 ms | 19.9 ms | 10.0 MiB | 56 |
| 320 | 35.2 ms | 35.3 ms | 37.5 ms | 20.0 MiB | 28 |
| 640 | 69.7 ms | 70.1 ms | 71.7 ms | 40.1 MiB | 14 |
| 1280 | 139 ms | 140 ms | 142 ms | 16.1 MiB | 7 |
| 2560 | 277 ms | 277 ms | 280 ms | 32.3 MiB | 4 |
| 5120 | 554 ms | 559 ms | 557 ms | 707.4 KiB | 2 |
| 10240 | 1.11 s | 1.11 s | 1.11 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.51 ms | 1.53 ms | 3.43 ms | 645.6 KiB | 664 |
| 40 | 2.58 ms | 2.63 ms | 4.50 ms | 1.3 MiB | 387 |
| 80 | 4.75 ms | 5.19 ms | 6.68 ms | 2.5 MiB | 211 |
| 160 | 9.12 ms | 9.24 ms | 11.1 ms | 5.2 MiB | 110 |
| 320 | 17.9 ms | 20.6 ms | 19.9 ms | 10.6 MiB | 56 |
| 640 | 35.5 ms | 35.6 ms | 37.7 ms | 21.4 MiB | 28 |
| 1280 | 71.3 ms | 72.4 ms | 73.6 ms | 43.6 MiB | 14 |
| 2560 | 144 ms | 145 ms | 146 ms | 25.7 MiB | 7 |
| 5120 | 288 ms | 290 ms | 292 ms | 53.9 MiB | 3 |
| 10240 | 578 ms | 578 ms | 582 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.27, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.93 µs | 15.2 µs | 6.05 µs | 9.3 KiB | 168,770 |
| 40 | 7.69 µs | 10.1 µs | 30.5 µs | 8.4 KiB | 130,040 |
| 80 | 12.7 µs | 13.2 µs | 44.0 µs | 16.2 KiB | 78,603 |
| 160 | 23.6 µs | 24.0 µs | 75.1 µs | 31.8 KiB | 42,392 |
| 320 | 45.2 µs | 53.5 µs | 140 µs | 63.1 KiB | 22,128 |
| 640 | 85.8 µs | 87.6 µs | 254 µs | 127.7 KiB | 11,650 |
| 1280 | 436 µs | 444 µs | 1.22 ms | 340.8 KiB | 2,293 |
| 2560 | 783 µs | 793 µs | 1.57 ms | 694.2 KiB | 1,277 |
| 5120 | 1.70 ms | 1.73 ms | 3.34 ms | 1.3 MiB | 587 |
| 10240 | 3.53 ms | 3.61 ms | 5.34 ms | 2.7 MiB | 284 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.88, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.53 µs | 4.74 µs | 14.4 µs | 4.5 KiB | 220,639 |
| 40 | 4.94 µs | 5.09 µs | 20.7 µs | 4.5 KiB | 202,612 |
| 80 | 5.49 µs | 6.14 µs | 21.8 µs | 4.5 KiB | 182,307 |
| 160 | 6.60 µs | 6.84 µs | 25.4 µs | 4.5 KiB | 151,491 |
| 320 | 8.76 µs | 9.02 µs | 31.9 µs | 4.5 KiB | 114,203 |
| 640 | 13.1 µs | 13.6 µs | 45.7 µs | 4.5 KiB | 76,128 |
| 1280 | 22.1 µs | 22.4 µs | 70.6 µs | 4.5 KiB | 45,323 |
| 2560 | 39.5 µs | 40.3 µs | 123 µs | 4.5 KiB | 25,314 |
| 5120 | 75.1 µs | 84.1 µs | 235 µs | 4.5 KiB | 13,323 |
| 10240 | 150 µs | 155 µs | 484 µs | 4.5 KiB | 6,647 |

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
| 20 | 13.4 µs | 15.6 µs | 13.7 µs | 3.7 KiB | 74,592 |
| 40 | 19.8 µs | 21.2 µs | 20.1 µs | 6.3 KiB | 50,539 |
| 80 | 33.4 µs | 35.8 µs | 140 µs | 11.7 KiB | 29,906 |
| 160 | 53.7 µs | 64.7 µs | 190 µs | 22.3 KiB | 18,613 |
| 320 | 99.9 µs | 112 µs | 320 µs | 45.3 KiB | 10,009 |
| 640 | 187 µs | 217 µs | 565 µs | 93.6 KiB | 5,343 |
| 1280 | 330 µs | 355 µs | 844 µs | 191.5 KiB | 3,035 |
| 2560 | 632 µs | 693 µs | 1.45 ms | 360.9 KiB | 1,583 |
| 5120 | 1.39 ms | 1.53 ms | 3.02 ms | 683.6 KiB | 718 |
| 10240 | 2.48 ms | 2.58 ms | 4.18 ms | 1.3 MiB | 404 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.56 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 2.00 ms | 2.00 ms | 78% |
| `load-exception-registry` | 1 | 540 µs | 540 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 19.5 µs | 0.8% |

**At 10240 entrys** (whole operation: 41.7 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 30.5 ms | 30.5 ms | 73% |
| `load-exception-registry` | 1 | 7.33 ms | 7.33 ms | 18% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.88 ms | 9.3% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-20T02:02:54.378Z` → `2026-10-20T02:03:58.493Z` (64 s), ci: CI (run 39355249621)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `9caf04b4ab765d7b8c0dfe0a98e734d2083782bd` on `chore/follow-ups`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).


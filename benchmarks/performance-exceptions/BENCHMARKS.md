# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.95 ms** per operation compared with a bare-minimum baseline (**296% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.95 ms | 34.7 ms |
| Added latency, relative to baseline | 296% | 338% |
| Added CPU time per operation | 2.70 ms | 34.5 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 514 ops/s | 29 ops/s |

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
| 20 | 30.1 µs | 156 µs | 125 µs | 416% | 496 µs | $0.00026 – $0.0056 |
| 40 | 49.9 µs | 205 µs | 155 µs | 311% | 415 µs | $0.00032 – $0.0047 |
| 80 | 98.0 µs | 407 µs | 309 µs | 315% | 849 µs | $0.00064 – $0.0096 |
| 160 | 188 µs | 672 µs | 485 µs | 258% | 851 µs | $0.001 – $0.0096 |
| 320 | 345 µs | 1.34 ms | 994 µs | 288% | 1.95 ms | $0.0021 – $0.022 |
| 640 | 657 µs | 2.60 ms | 1.95 ms | 296% | 2.70 ms | $0.0041 – $0.030 |
| 1280 | 1.33 ms | 4.97 ms | 3.64 ms | 274% | 3.68 ms | $0.0076 – $0.041 |
| 2560 | 2.52 ms | 9.95 ms | 7.43 ms | 295% | 7.65 ms | $0.015 – $0.086 |
| 5120 | 5.00 ms | 19.8 ms | 14.8 ms | 296% | 15.0 ms | $0.031 – $0.169 |
| 10240 | 10.3 ms | 45.0 ms | 34.7 ms | 338% | 34.5 ms | $0.072 – $0.388 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 346 µs | 4.41 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 59.6 µs | 1.40 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 540 µs | 7.30 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 2.03 ms | 33.7 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 38.6 ms | 583 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 157 µs | 4.53 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 69.2 ms | 1.13 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 36.1 ms | 589 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 87.8 µs | 3.69 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 12.9 µs | 162 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 170 µs | 2.46 ms |

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

**Measured: O(n)** (exponent 0.94, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 113 µs | 154 µs | 407 µs | 115.6 KiB | 8,880 |
| 40 | 79.0 µs | 136 µs | 291 µs | 99.2 KiB | 12,654 |
| 80 | 88.0 µs | 93.4 µs | 295 µs | 118.8 KiB | 11,368 |
| 160 | 113 µs | 121 µs | 361 µs | 159.8 KiB | 8,837 |
| 320 | 155 µs | 161 µs | 448 µs | 237.4 KiB | 6,451 |
| 640 | 346 µs | 436 µs | 1.11 ms | 530.7 KiB | 2,887 |
| 1280 | 532 µs | 547 µs | 1.22 ms | 1.0 MiB | 1,881 |
| 2560 | 1.09 ms | 1.14 ms | 2.60 ms | 2.1 MiB | 915 |
| 5120 | 2.16 ms | 2.20 ms | 3.49 ms | 4.3 MiB | 463 |
| 10240 | 4.41 ms | 6.17 ms | 5.53 ms | 8.6 MiB | 227 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.14, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 10.3 µs | 12.7 µs | 35.6 µs | 17.0 KiB | 97,255 |
| 40 | 11.9 µs | 13.4 µs | 46.5 µs | 16.3 KiB | 84,078 |
| 80 | 16.4 µs | 17.5 µs | 67.3 µs | 20.5 KiB | 60,815 |
| 160 | 21.0 µs | 24.0 µs | 71.9 µs | 28.6 KiB | 47,646 |
| 320 | 35.1 µs | 36.3 µs | 113 µs | 48.3 KiB | 28,525 |
| 640 | 59.6 µs | 61.7 µs | 173 µs | 86.8 KiB | 16,791 |
| 1280 | 130 µs | 142 µs | 369 µs | 168.3 KiB | 7,664 |
| 2560 | 266 µs | 276 µs | 810 µs | 335.9 KiB | 3,766 |
| 5120 | 617 µs | 639 µs | 1.51 ms | 634.3 KiB | 1,620 |
| 10240 | 1.40 ms | 1.45 ms | 3.56 ms | 1.3 MiB | 712 |

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
| 20 | 23.0 µs | 24.5 µs | 88.0 µs | 7.3 KiB | 43,479 |
| 40 | 38.0 µs | 39.8 µs | 116 µs | 13.2 KiB | 26,305 |
| 80 | 73.1 µs | 77.0 µs | 211 µs | 25.1 KiB | 13,672 |
| 160 | 145 µs | 150 µs | 423 µs | 48.9 KiB | 6,902 |
| 320 | 285 µs | 299 µs | 775 µs | 96.5 KiB | 3,513 |
| 640 | 540 µs | 570 µs | 1.28 ms | 191.6 KiB | 1,852 |
| 1280 | 1.08 ms | 1.11 ms | 2.63 ms | 381.9 KiB | 925 |
| 2560 | 1.98 ms | 2.38 ms | 3.72 ms | 761.9 KiB | 505 |
| 5120 | 4.54 ms | 4.84 ms | 6.46 ms | 1.5 MiB | 220 |
| 10240 | 7.30 ms | 8.64 ms | 9.66 ms | 3.0 MiB | 137 |

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
| 20 | 99.7 µs | 111 µs | 395 µs | 44.0 KiB | 10,027 |
| 40 | 151 µs | 179 µs | 444 µs | 83.3 KiB | 6,634 |
| 80 | 283 µs | 333 µs | 782 µs | 161.9 KiB | 3,539 |
| 160 | 537 µs | 587 µs | 1.28 ms | 319.5 KiB | 1,863 |
| 320 | 1.06 ms | 1.15 ms | 2.55 ms | 634.7 KiB | 942 |
| 640 | 2.03 ms | 2.20 ms | 3.52 ms | 1.2 MiB | 492 |
| 1280 | 3.85 ms | 4.27 ms | 5.46 ms | 2.5 MiB | 260 |
| 2560 | 7.51 ms | 7.63 ms | 9.35 ms | 4.9 MiB | 133 |
| 5120 | 15.0 ms | 15.3 ms | 17.2 ms | 9.8 MiB | 67 |
| 10240 | 33.7 ms | 34.8 ms | 36.8 ms | 19.7 MiB | 30 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.94 ms | 2.33 ms | 4.18 ms | 652.9 KiB | 515 |
| 40 | 2.53 ms | 3.77 ms | 4.09 ms | 1.3 MiB | 395 |
| 80 | 4.69 ms | 6.25 ms | 6.20 ms | 2.6 MiB | 213 |
| 160 | 9.21 ms | 12.3 ms | 10.8 ms | 5.3 MiB | 109 |
| 320 | 18.3 ms | 21.2 ms | 20.5 ms | 10.6 MiB | 55 |
| 640 | 38.6 ms | 39.9 ms | 44.2 ms | 21.5 MiB | 26 |
| 1280 | 70.9 ms | 71.3 ms | 73.4 ms | 43.7 MiB | 14 |
| 2560 | 145 ms | 153 ms | 147 ms | 25.9 MiB | 7 |
| 5120 | 297 ms | 305 ms | 309 ms | 54.2 MiB | 3 |
| 10240 | 583 ms | 597 ms | 597 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.10 µs | 9.70 µs | 8.34 µs | 7.4 KiB | 123,509 |
| 40 | 11.6 µs | 12.6 µs | 41.3 µs | 14.0 KiB | 85,923 |
| 80 | 21.4 µs | 25.5 µs | 69.6 µs | 27.3 KiB | 46,680 |
| 160 | 41.1 µs | 51.5 µs | 130 µs | 53.9 KiB | 24,308 |
| 320 | 85.0 µs | 98.8 µs | 274 µs | 107.0 KiB | 11,762 |
| 640 | 157 µs | 190 µs | 460 µs | 213.3 KiB | 6,367 |
| 1280 | 534 µs | 601 µs | 1.27 ms | 516.0 KiB | 1,871 |
| 2560 | 1.09 ms | 1.19 ms | 2.68 ms | 1.0 MiB | 914 |
| 5120 | 2.14 ms | 2.32 ms | 3.71 ms | 2.1 MiB | 468 |
| 10240 | 4.53 ms | 4.78 ms | 6.71 ms | 4.2 MiB | 221 |

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
| 20 | 2.54 ms | 2.66 ms | 4.47 ms | 1.2 MiB | 393 |
| 40 | 4.70 ms | 4.83 ms | 6.67 ms | 2.5 MiB | 213 |
| 80 | 9.01 ms | 9.26 ms | 11.1 ms | 5.0 MiB | 111 |
| 160 | 17.6 ms | 24.3 ms | 19.9 ms | 10.0 MiB | 57 |
| 320 | 35.0 ms | 36.2 ms | 37.3 ms | 20.0 MiB | 29 |
| 640 | 69.2 ms | 72.4 ms | 71.8 ms | 40.1 MiB | 14 |
| 1280 | 141 ms | 145 ms | 144 ms | 16.1 MiB | 7 |
| 2560 | 276 ms | 284 ms | 279 ms | 32.3 MiB | 4 |
| 5120 | 557 ms | 572 ms | 560 ms | 707.4 KiB | 2 |
| 10240 | 1.13 s | 1.14 s | 1.14 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.47 ms | 1.55 ms | 3.38 ms | 645.6 KiB | 680 |
| 40 | 2.55 ms | 2.63 ms | 4.50 ms | 1.3 MiB | 392 |
| 80 | 4.73 ms | 4.90 ms | 6.70 ms | 2.5 MiB | 211 |
| 160 | 9.07 ms | 9.51 ms | 11.1 ms | 5.2 MiB | 110 |
| 320 | 18.0 ms | 18.3 ms | 20.2 ms | 10.6 MiB | 56 |
| 640 | 36.1 ms | 37.2 ms | 38.7 ms | 21.4 MiB | 28 |
| 1280 | 71.9 ms | 72.1 ms | 74.5 ms | 43.6 MiB | 14 |
| 2560 | 143 ms | 144 ms | 146 ms | 25.7 MiB | 7 |
| 5120 | 298 ms | 299 ms | 302 ms | 53.9 MiB | 3 |
| 10240 | 589 ms | 597 ms | 595 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.28, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.95 µs | 15.4 µs | 6.14 µs | 9.3 KiB | 168,165 |
| 40 | 7.96 µs | 9.25 µs | 31.2 µs | 8.4 KiB | 125,707 |
| 80 | 13.5 µs | 14.0 µs | 48.7 µs | 16.2 KiB | 74,026 |
| 160 | 23.7 µs | 24.8 µs | 76.7 µs | 31.8 KiB | 42,267 |
| 320 | 45.2 µs | 46.8 µs | 138 µs | 63.1 KiB | 22,108 |
| 640 | 87.8 µs | 90.9 µs | 256 µs | 127.7 KiB | 11,386 |
| 1280 | 443 µs | 458 µs | 1.22 ms | 340.8 KiB | 2,257 |
| 2560 | 817 µs | 852 µs | 1.61 ms | 694.2 KiB | 1,224 |
| 5120 | 1.79 ms | 1.98 ms | 3.45 ms | 1.3 MiB | 558 |
| 10240 | 3.69 ms | 3.76 ms | 5.55 ms | 2.7 MiB | 271 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.90, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.55 µs | 4.88 µs | 14.6 µs | 4.5 KiB | 219,743 |
| 40 | 4.77 µs | 5.11 µs | 19.7 µs | 4.5 KiB | 209,631 |
| 80 | 5.36 µs | 5.90 µs | 21.7 µs | 4.5 KiB | 186,582 |
| 160 | 6.69 µs | 7.14 µs | 27.2 µs | 4.5 KiB | 149,430 |
| 320 | 8.70 µs | 9.33 µs | 32.7 µs | 4.5 KiB | 114,963 |
| 640 | 12.9 µs | 13.5 µs | 43.3 µs | 4.5 KiB | 77,668 |
| 1280 | 22.4 µs | 24.1 µs | 75.2 µs | 4.5 KiB | 44,582 |
| 2560 | 39.0 µs | 42.5 µs | 123 µs | 4.5 KiB | 25,621 |
| 5120 | 72.9 µs | 76.1 µs | 220 µs | 4.5 KiB | 13,726 |
| 10240 | 162 µs | 172 µs | 491 µs | 4.5 KiB | 6,165 |

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
| 20 | 13.2 µs | 15.6 µs | 13.6 µs | 3.6 KiB | 75,613 |
| 40 | 19.7 µs | 22.2 µs | 20.0 µs | 6.3 KiB | 50,831 |
| 80 | 33.9 µs | 36.5 µs | 106 µs | 11.7 KiB | 29,508 |
| 160 | 54.5 µs | 63.8 µs | 207 µs | 22.4 KiB | 18,341 |
| 320 | 95.9 µs | 115 µs | 314 µs | 45.3 KiB | 10,429 |
| 640 | 170 µs | 190 µs | 477 µs | 92.1 KiB | 5,891 |
| 1280 | 319 µs | 367 µs | 830 µs | 191.5 KiB | 3,136 |
| 2560 | 612 µs | 673 µs | 1.42 ms | 360.8 KiB | 1,635 |
| 5120 | 1.40 ms | 1.52 ms | 3.02 ms | 685.3 KiB | 713 |
| 10240 | 2.46 ms | 2.58 ms | 4.24 ms | 1.3 MiB | 407 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.60 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 2.03 ms | 2.03 ms | 78% |
| `load-exception-registry` | 1 | 540 µs | 540 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 30.4 µs | 1.2% |

**At 10240 entrys** (whole operation: 45.0 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 33.7 ms | 33.7 ms | 75% |
| `load-exception-registry` | 1 | 7.30 ms | 7.30 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.01 ms | 8.9% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T09:49:47.993Z` → `2026-11-02T09:50:52.888Z` (65 s), ci: CI (run 41421212088)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `fbe54786c595c09f8085f9f45cf13643ab70457c` on `dependabot/npm_and_yarn/dev-dependencies-ab16461808`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

